# AGENTS.md

## Project: AI-Minimal Dual-Mode RPA (Windows-only)

This repository builds a Windows-only automation platform that supports:

- Web automation via Playwright (Node/TypeScript)
- Desktop automation via Windows UI Automation (UIA) (Python for MVP)
- Multi-recording selector synthesis (deterministic, no ML training)
- Human verification mode + exception queue
- AI is allowed ONLY at compile-time as an optional fallback, never at runtime

This file defines rules for any agent (including Codex) making changes.

## Codex Run Log Requirement (Mandatory)

After EACH Codex run that changes files, create a new markdown file under:

- `CODEX/1.codex.md`
- `CODEX/2.codex.md`
- `CODEX/3.codex.md`
- ... (incrementing)

Each file must include:

1. Summary of what was implemented/changed (bullet list)
2. Files changed (explicit list)
3. How to test locally on Windows (exact commands)
4. How to verify behavior manually (if applicable)
5. Known issues / follow-ups

If the run made no changes, still write a CODEX log stating:

- “No changes made” and why
- What was attempted
- Suggested next action

---

## Non-Negotiable Requirements

### 1) No runtime AI

- Do not add any runtime dependency on LLMs or online AI services.
- The runner must be deterministic and fully functional offline.
- AI may be used only in the compiler/synthesizer toolchain, gated by confidence thresholds, and its outputs must be cached and embedded into workflow packages.

### 2) Windows-only targeting

- Desktop automation targets Windows only.
- Avoid cross-platform abstractions that reduce Windows UIA correctness.

### 3) Every step must verify success

- Each workflow step must have:
  - `pre_assert` (required markers before action)
  - `post_assert` (required markers after action)
- If a step cannot be verified, treat it as compile-time failure and route to exception queue or require manual assertions.

### 4) Selector ladders (never single selectors)

- Every actionable step must compile into a ranked ladder:
  - Primary selector
  - One or more fallbacks
- Desktop fallback order must prefer UIA-based methods before OCR, and OCR before coordinates.

### 5) Strong logging and artifacts

- On every step execution, record:
  - which selector rung was used
  - match attempts and counts
  - timings and retries
  - before/after screenshots
- On failure, capture:
  - screenshot(s)
  - selector attempt traces
  - last-known UI markers
- Logs must be reproducible and sufficient to debug without rerunning interactively.

---

## Repository Conventions

### Language split (MVP)

- Orchestrator + web runner + synthesizer: TypeScript (Node)
- Desktop runner + desktop recorder: Python
- Do not rewrite desktop runner into Rust/Java in MVP.

### Packaging

Compiled workflows are stored as a directory package containing:

- workflow.json (DSL)
- inputs.json (user-provided inputs for replay/verification)
- selectors.json (compiled selector ladders)
- assertions.json (compiled pre/post checks)
- evidence/ (screenshots + match traces)
- review/ (verification decisions + comments)

Do not introduce a new packaging format without updating docs and migration notes.

### No breaking DSL changes

- Any change to DSL requires:
  1. JSON Schema update in `packages/shared/src/dsl/`
  2. TypeScript types update
  3. Migration note in `docs/dsl.md`
  4. At least one sample workflow updated under `workflows/samples/`

### Determinism

- No random sleeps as “fixes”.
- Use explicit waits for markers, bounded retries, and assertions.

---

## Desktop Automation Rules (UIA)

### UIA first

Selector ladder should attempt in this order:

1. UIA: AutomationId + ControlType (scoped to window)
2. UIA: Name + ControlType (scoped)
3. UIA: near-label (StaticText proximity with distance/direction constraints)
4. UIA: stable container signature + relative selection
5. OCR anchor + offset (only if UIA fails)
6. Coordinates (only with window-position validation + marker check)

### OCR usage

- OCR is allowed only as a fallback.
- OCR clicks must always have post-assertions to confirm correctness.

### Virtualized lists/grids

- Never rely on row index alone.
- Prefer locating rows by visible text + container scoping, then act within the row.

---

## Web Automation Rules (Playwright)

### Preferred selector order

1. getByRole(role, name)
2. getByLabel(text)
3. data-testid or stable attributes
4. scoped locators (within form/dialog/region)
5. XPath (last resort)

### Always scope

If multiple matches exist, scope to the nearest stable container (form/dialog/region).

---

## Multi-Recording Selector Synthesis

The synthesizer must:

- Generate candidates per snapshot
- Evaluate across N recordings:
  - coverage: must match across all snapshots
  - uniqueness: must match exactly one per snapshot
  - stability: matched items share signature
  - cost: prefer minimal predicates
- Run disambiguation loop if multiple matches
- Run greedy minimization to remove unnecessary predicates

If no selector meets constraints:

- Mark the step as “needs review” and route to exception queue
- Do not silently fall back to coordinates without validation

---

## Verification Mode + Exception Queue

### Verification mode

For each step, show:

1. Pre-check markers
2. Planned action (human-readable explain string)
3. Post-check markers
4. Evidence panel (before/after screenshots + selector rung used)

User options per step:

- Proceed
- Proceed with Comments
- Raise Issue with Comments

### Exception queue

On “Raise Issue”:

- Create an issue record containing:
  - workflow id, step id
  - inputs used
  - logs and screenshots
  - selector ladder and attempt trace
  - user comment
- Mark workflow as not finalized until resolved.

---

## Testing Requirements (must not regress)

### Minimum tests required for any PR/change

- Unit tests for selector resolution/scoring changes
- Unit tests for DSL validation changes
- At least one Playwright smoke test (web-runner)
- At least one desktop-runner unit test using mocked UIA objects

### CI rules

- No failing tests allowed.
- If new dependencies are introduced, justify in PR notes and keep footprint minimal.

---

## Documentation Requirements

Any of the following changes require documentation updates:

- DSL schema changes -> `docs/dsl.md`
- Selector synthesis logic changes -> `docs/selector-synthesis.md`
- Verification flow changes -> `docs/verification-mode.md`
- Exception queue changes -> `docs/exception-queue.md`

---

## What to do when unsure

- Prefer adding a small, testable increment rather than a broad refactor.
- Add instrumentation and assertions before adding new fallback behavior.
- If a step cannot be deterministically verified, route it to verification/exception queue instead of guessing.
