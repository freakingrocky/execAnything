# AI‑Minimal Dual‑Mode RPA System (Web + Windows Desktop)

## 1. Problem Statement
Build a **Windows‑only automation platform** similar in spirit to Blue Prism, but:
- Uses **AI only at build time**, never at runtime
- Supports **both Web (browser) and Desktop (Windows native) automation**
- Learns **robust selectors from multiple recordings (≈10)** via deterministic pattern matching
- Produces **codified, replayable scripts** with strict validation and minimal brittleness

Target use case: **data entry + light decision logic** where selector instability is the main pain point.

---

## 2. Core Design Principles

1. **AI is a compiler, not an operator**
   - AI assists in selector synthesis only when deterministic methods fail
   - Runtime execution is fully deterministic

2. **Multiple demonstrations > single snapshot**
   - Selectors are synthesized from multiple successful runs
   - Stability and uniqueness across runs is mandatory

3. **Selector ladders, not single selectors**
   - Every step has ranked primary + fallback strategies

4. **Every action is verified**
   - Assertions after each step are mandatory

---

## 3. High‑Level Architecture

### 3.1 Components

1. **Recorder** (Web + Desktop)
2. **Snapshot Store** (multi‑run UI/DOM captures)
3. **Selector Synthesizer** (pattern matching + minimization)
4. **AI Compiler (optional)**
5. **Workflow DSL + Package Format**
6. **Deterministic Runner** (Web + Desktop drivers)
7. **IDE / Inspector (later stage)**

---

## 4. Recording Layer

### 4.1 Desktop Recording (Windows)

Captured per action:
- Process name, PID
- Window title + class
- UI Automation (UIA) element under cursor
- Parent chain (to root)
- Sibling summary
- Nearby static texts (labels) with relative positions
- Bounding rectangle
- Screenshot crop (target + surrounding area)

APIs:
- Windows UI Automation (UIA)
- Win32 hooks (mouse/keyboard)

### 4.2 Web Recording

Captured per action:
- URL pattern + frame
- DOM node properties
- Role, label, name, placeholder
- Candidate Playwright selectors
- DOM ancestor snippet (scoped)
- Bounding box + screenshot crop

Tooling base:
- Playwright persistent context

---

## 5. Snapshot Storage Model

For each step, store **N snapshots** (N ≈ 5–10):

- `window_fingerprint`
- `element_features[]`
- `neighborhood_features[]`
- `candidate_selectors[]`
- `screenshots[]`

This is **training data**, not ML data.

---

## 6. Selector Synthesis via Pattern Matching

### 6.1 Candidate Generation

For each snapshot, generate selector candidates.

#### Desktop Candidates (ordered)
1. AutomationId + ControlType
2. Name + ControlType
3. ControlType + near(label)
4. ControlType + container signature
5. Partial parent chain signature
6. OCR anchor + offset
7. Absolute coordinates (discouraged)

#### Web Candidates (ordered)
1. getByRole(role, name)
2. getByLabel(text)
3. data‑testid / name / id
4. scoped text proximity
5. XPath

---

### 6.2 Cross‑Run Evaluation

For each candidate selector **S**:

Evaluate across all snapshots:
- **Coverage**: matches ≥1 element in all snapshots
- **Uniqueness**: matches exactly 1 element per snapshot
- **Stability**: matched elements share same signature
- **Cost**: number and complexity of predicates

Reject any selector with <100% coverage or uniqueness.

---

### 6.3 Disambiguation Loop

If selector matches multiple elements:

Desktop discriminators (incremental):
- Add ControlType
- Add container constraint
- Add nearest label constraint (distance + direction)
- Add partial parent chain
- Add sibling pattern

Web discriminators:
- Scope to form/dialog/region
- Require visibility
- Add accessible name
- Add nearby label container
- Add attribute constraints

Repeat evaluation after each refinement.

---

### 6.4 Selector Minimization

Once a selector passes all constraints:

Greedy minimization:
1. Remove one predicate
2. Re‑evaluate across all snapshots
3. If coverage + uniqueness hold, keep removal
4. Repeat until minimal

Result: **smallest stable selector**.

---

## 7. Handling “Area‑Based” Matching

### Desktop
Area = **UI neighborhood**, not pixels:
- Nearby labels
- Relative geometry
- Container signature

Pixels are only used for OCR fallback.

### Web
Area = DOM scope:
- Ancestor form / dialog / section

---

## 8. OCR Fallback (Desktop)

Used only if UIA fails.

Flow:
1. OCR on stored crop
2. Match anchor text
3. Apply relative offset
4. Validate by checking focus or value change

OCR engine options:
- Windows OCR (WinRT)
- Tesseract

---

## 9. Workflow DSL (Unified)

Key primitives:
- focus_window
- click
- fill / type / paste
- select
- wait_for
- assert
- extract
- branch / loop (bounded)

Each step includes:
- driver: web | desktop
- selector ladder
- retry policy
- post‑assertions

DSL is **language‑agnostic JSON/YAML**.

---

## 10. Verification, Review, and Exception Queue (Human-in-the-Loop)

### 10.1 Goal
After a recording is created and selectors are synthesized, provide a **verification pass** where a user (non-technical) supplies required input data (e.g., song name, playlist name, identifiers) and the system replays the workflow in a **step-by-step explain-and-confirm** mode.

This serves two purposes:
1. Ensures the automation does what the user intended before compilation and distribution
2. Produces better assertions and failure metadata for later hardening

---

### 10.2 Verification Playback Format (Explain → Act → Verify)
For each step, the verifier UI must show:

1. **Pre-check (UI state assertion)**
   - Example: "Tidal is open" and "Search bar is visible"
   - Driver-specific checks:
     - Web: URL/title/frame marker + required element visible
     - Desktop: process/window in foreground + required UIA element exists/visible

2. **Planned action (natural language + structured)**
   - Example: "Click search bar to focus it, then type ${song_name}."

3. **Post-check (outcome verification)**
   - Example: "Search bar contains the song name" and "Dropdown shows matches"
   - Checks:
     - Field value equals/contains expected
     - Next UI marker appears (list/table/label)
     - No error marker present

4. **Artifacts (always captured)**
   - Before/after screenshots
   - Matched selector details (which ladder rung succeeded)
   - Timing + retries

---

### 10.3 User Decisions Per Step
During verification playback, present **exactly three** options:

1. **Proceed**
   - Accept the step as-is and continue

2. **Proceed with Comments**
   - Continue, but attach a comment to this step
   - Comments are stored in package metadata and shown in the inspector

3. **Raise Issue with Comments**
   - Stop verification (or optionally skip to next step)
   - Create an **Exception Queue item** that includes:
     - workflow id + step id
     - input data used
     - full logs + screenshots
     - selector ladder and match attempts
     - user comment describing what went wrong or is ambiguous
   - This workflow version is **not compiled as final** until resolved

---

### 10.4 Exception Queue (Triage Workflow)
The exception queue is for technical review and hardening.

Each queue item should support:
- Reproduce with captured inputs
- Compare expected vs observed UI state
- Re-record only the failing step
- Re-run selector synthesis for that step
- Add or adjust assertions/fallbacks
- Mark as resolved and re-enter verification

Storage minimum:
- JSON record + attachments directory (screenshots/logs)
- Status: open | in_review | resolved | rejected
- Owner/assignee field (optional)

---

### 10.5 DSL Extensions Required
Add optional fields per step:
- `pre_assert`: required UI markers before action
- `post_assert`: required outcome markers after action
- `explain`: short natural language string for verifier UI
- `review`: user comments + decision history

Example (conceptual):
- pre_assert: window open, element visible
- explain: "Click search bar, paste song name"
- post_assert: field contains value, results list visible

---

## 11. Runtime Execution Rules (Strict)

1. No AI allowed
2. Every step must assert success (pre + post)
3. Bounded retries with backoff
4. Fallbacks attempted in order
5. Checkpoint after every success
6. Full logs + screenshots on failure

---

## 11. AI Usage Policy (Compile‑Time Only)

AI is triggered only if:
- No selector reaches confidence threshold
- UIA tree is empty or unstable
- Labels vary semantically across runs

AI input (minimal):
- Candidate selector list
- Small image crops
- UIA or DOM neighborhood summary

AI output:
- Deterministic selector rules
- Fallback strategy
- Assertion rules

Results are cached and embedded in package.

---

## 12. Technology Stack (Pragmatic)

### Recommended MVP Stack

- **Web Runner**: Node.js + Playwright
- **Desktop Runner**: Python (UIA libraries)
- **Orchestrator**: Node.js (spawns desktop runner via RPC)
- **Compiler**: Node.js (TypeScript)
- **OCR**: Windows OCR or Tesseract

Package format remains language‑agnostic.

---

## 13. Step‑by‑Step Prototype Plan

### Phase 1 – Deterministic Core
1. Implement DSL schema
2. Web runner (Playwright)
3. Desktop runner (UIA click, set value, wait, assert)
4. Logging + screenshots

### Phase 2 – Recorder
5. Desktop recorder with UIA snapshots
6. Web recorder via Playwright hooks

### Phase 3 – Selector Synthesis
7. Candidate generation
8. Cross‑run evaluation
9. Disambiguation + minimization

### Phase 4 – AI Assist (Optional)
10. Confidence gating
11. AI selector resolver
12. Cache + embed results

### Phase 5 – IDE Lite
13. Step inspector
14. Re‑record step
15. Re‑synthesize selector

---

## 14. Existing Tools to Check Before Building

You should evaluate these for reuse or inspiration:

### Web Automation
- Playwright (selectors, recorder)
- Puppeteer

### Desktop Automation
- pywinauto
- FlaUI (.NET)
- WinAppDriver (limited)

### RPA Platforms (Reference Only)
- Blue Prism
- UiPath
- Power Automate Desktop

### AI‑Assisted Tools (Partial Overlap)
- UiPath Autopilot (AI‑heavy)
- Replit Agent (not RPA‑focused)

None currently combine **multi‑recording selector synthesis + AI‑minimal design** in a clean, open way.

---

## 15. What This System Uniquely Achieves

- Selectors derived from **multiple successful executions**
- Deterministic, auditable automation
- AI used as a compiler tool, not a crutch
- One workflow language for web + desktop

This is closer to **program synthesis** than traditional RPA recording.

---

## 16. Next Logical Deliverables

- Selector synthesis pseudocode (reference implementation)
- DSL JSON Schema
- Repo skeleton (Node + Playwright + Python UIA worker)

This document is sufficient to begin a working prototype.

