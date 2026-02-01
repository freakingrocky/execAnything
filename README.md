# AI-Minimal Dual-Mode RPA (Windows-only)

![CI](https://github.com/ORG/REPO/actions/workflows/ci.yml/badge.svg?branch=main) <!-- Replace ORG/REPO with your GitHub org/repo -->

This repository contains a **deterministic, verification-first automation system** for enterprise environments.

It automates **both web and Windows desktop applications**, synthesizes **robust selectors from multiple recordings**, and **never uses AI at runtime**.

AI, if used at all, is strictly a **compile-time helper** for selector synthesis when deterministic methods fail.

---

## What this is (and is not)

### This **is**

- A **Blue Prism–style automation system**, but developer-first
- Deterministic, auditable, reproducible
- Built for **enterprise desktop tech** (UIA, legacy apps, embedded browsers)
- Verification-driven with **human sign-off**
- Designed to fail loudly, not silently

### This **is not**

- A “self-healing AI clicks stuff” tool
- A runtime LLM agent
- A cross-platform automation framework
- A low-code/no-code product (yet)

---

## Core ideas

### 1. Multi-recording selector synthesis

Selectors are **not** derived from a single snapshot.

Instead:

- Record the same automation **N times (≈5–10)**
- Extract candidate selectors from each run
- Synthesize the **minimal selector that is stable across all runs**
- Reject anything that is ambiguous or unstable

This drastically reduces selector brittleness in enterprise UIs.

---

### 2. Selector ladders, not single selectors

Every step compiles into a ranked ladder:

1. Strong semantic selector (UIA / ARIA)
2. Contextual selector (container + label proximity)
3. OCR anchor fallback (desktop only)
4. Coordinates (last resort, validated)

No guessing. No silent fallback.

---

### 3. Verification before production

Before a workflow is finalized, it runs in **verification mode**:

For each step the user sees:

- What UI state is expected
- What action will happen
- What outcome will be verified

They choose:

- **Proceed**
- **Proceed with comments**
- **Raise issue with comments** (routes to exception queue)

Nothing is “live” without human confirmation.

---

### 4. Exception queue, not silent failure

When something is ambiguous or wrong:

- Full logs, screenshots, selector attempts, and inputs are captured
- The workflow is **blocked from finalization**
- A more technical reviewer can fix or re-record only the failing step

This is how you make automation safe in enterprise contexts.

---

## Architecture (high level)

User → Recorder → Selector Synthesizer → Verification Mode
↓
Exception Queue
↓
Deterministic Runner

### Components

- **Orchestrator** (Node/TypeScript)
- **Web runner** (Playwright)
- **Desktop runner** (Python + UI Automation)
- **Recorder** (web + desktop)
- **Selector synthesizer** (deterministic)
- **Verification UI**
- **Exception queue**

All components share a common DSL and package format.

---

## Technology choices (MVP)

| Area               | Choice                  | Why                                         |
| ------------------ | ----------------------- | ------------------------------------------- |
| Web automation     | Playwright              | Best selectors, stable, enterprise-friendly |
| Desktop automation | Python + UIA            | Fastest reliable access to Windows UIA      |
| Orchestration      | Node.js                 | Glue, CLI, verification UI                  |
| OCR fallback       | Windows OCR / Tesseract | Required for real desktop apps              |
| AI usage           | Compile-time only       | Never at runtime                            |

---

## Repository layout (simplified)

packages/
shared/ # DSL schemas & types
orchestrator/ # runtime engine & CLI
web-runner/ # Playwright execution
desktop-runner/ # UIA execution (Python)
synthesizer/ # multi-recording selector synthesis
recorder-web/
recorder-desktop/
verifier-ui/
exception-queue/

docs/
architecture.md
dsl.md
selector-synthesis.md
verification-mode.md
exception-queue.md

See `AGENTS.md` for non-negotiable rules.

---

## Workflow lifecycle

1. **Record**
   - Capture web + desktop interactions
   - Store UI/DOM snapshots per step

2. **Synthesize**
   - Generate selector candidates
   - Evaluate across all recordings
   - Disambiguate and minimize

3. **Verify**
   - User supplies input data
   - Step-by-step explain → act → verify
   - Approve, comment, or raise issue

4. **Finalize**
   - Package workflow (no AI required)
   - Deterministic replay only

---

## Why enterprise-only (for now)

Enterprise desktop software:

- Frequently breaks UI Automation assumptions
- Uses custom-drawn controls
- Implements accessibility inconsistently

This system is designed **for that reality**, not against it.

Consumer apps are easier. Enterprise apps are the real problem.

---

## Current status

- Architecture and rules defined
- Repo skeleton established
- Ready for MVP implementation

This repo is intentionally strict to avoid the typical RPA failure modes:

- brittle selectors
- silent data corruption
- “AI guessed wrong but didn’t tell you”

---

## How to get started

1. Read `AGENTS.md` (mandatory)
2. Start with:
   - DSL schema in `packages/shared`
   - Web runner smoke test (Playwright)
   - Desktop runner proof of UIA click + assert
3. Build selector synthesis for **one control type only** (text input)
4. Add verification mode before adding AI

---

## Philosophy (read this if you change anything)

If something cannot be:

- Deterministically matched
- Verified post-action
- Reproduced from logs

Then it does not belong in the runtime.

Route it to verification or the exception queue instead.

---
