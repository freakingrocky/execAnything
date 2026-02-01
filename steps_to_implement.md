[X] Step 1: Create monorepo skeleton with workspaces and Python packages (folders under `packages/`, `docs/`, `workflows/`, `scripts/`)

[X] Step 2: Add core project docs placeholders in `docs/` (architecture, DSL, selector synthesis, verification mode, exception queue)

[X] Step 3: Add `AGENTS.md` and enforce repo rules (no runtime AI, selector ladders, pre/post asserts, logging)

[X] Step 4: Add DSL JSON Schemas in `packages/shared/src/dsl/` (`schema.workflow.json`, `schema.step.json`) and TypeScript types + validator stub

[X] Step 5: Add shared RPC contract file `packages/shared/src/rpc/desktop.rpc.json`

[X] (CDX) Step 6: Implement orchestrator CLI skeleton in `packages/orchestrator/src/cli/` (`run.ts`, `verify.ts`, `compile.ts`) with config loading

[X] (CDX) Step 7: Implement orchestrator runtime engine skeleton (`engine.ts`) with step scheduling, timeouts, and checkpointing interface

[X] (CDX) Step 8: Implement artifact manager in orchestrator (`artifacts.ts`) to create run folders, store screenshots, match traces, and logs

[X] (CDX) Step 9: Implement JSON-RPC stdio client in orchestrator (`desktopClient.ts`) to spawn desktop-runner and call `system.ping`

[X] (CDX) Step 10: Implement Python desktop-runner JSON-RPC server skeleton (`desktop_runner/server.py`) with method dispatch and error mapping

[X] (CDX) Step 11: Implement `system.ping` and `system.getCapabilities` in desktop-runner

[X] (CDX) Step 12: Implement desktop window focusing (`window.focus`) using Win32 + UIA scoping, return window descriptor

[X] (CDX) Step 13: Implement desktop selector ladder resolution (`target.resolve`) returning match attempts + resolved element descriptor

[] (CDX) Step 14: Implement desktop action: click (`action.click`) with before/after screenshot capture and StepTrace return

[] (CDX) Step 15: Implement desktop action: paste text (`action.pasteText`) and StepTrace return

[] (CDX) Step 16: Implement desktop action: set value via ValuePattern (`action.setValue`) and StepTrace return

[] (CDX) Step 17: Implement desktop assertions (`assert.check`) for required kinds (window active, element exists/visible, focused control type, value equals/contains, not)

[] (CDX) Step 18: Implement desktop extract (`extract.getValue`) to read text/value from resolved element

[] (CDX) Step 19: Implement desktop screenshot endpoint (`artifact.screenshot`) for active window and screen

[] (CDX) Step 20: Add Playwright web-runner package skeleton with actions (click/fill/select/wait/assert/extract) and basic selector ladder resolution

[] (CDX) Step 21: Add orchestrator web client wrapper (in-proc library) and a minimal `system.ping` equivalent for web-runner

[] (CDX) Step 22: Implement orchestrator `run` mode: execute workflow steps across web + desktop drivers with pre/post asserts and retries

[] (CDX) Step 23: Implement workflow checkpointing (write last successful step id + state) and resume logic

[] (CDX) Step 24: Create first sample workflow in `workflows/samples/` (simple web-only) and a Playwright smoke test

[] (CDX) Step 25: Create second sample workflow (desktop-only) that focuses a window and fills a text box with verification asserts

[] (CDX) Step 26: Implement recorder-web `recording.jsonl` output with DOM snapshot fragments, selector candidates, and screenshots

[] (CDX) Step 27: Implement recorder-desktop `recording.jsonl` output with UIA snapshot under cursor, neighborhood, and screenshots

[] (CDX) Step 28: Define recording format v0 (JSONL event types) in `docs/` and add schema/validator if needed

[] (CDX) Step 29: Implement synthesizer v0 candidate generation (web + desktop) from recordings

[] (CDX) Step 30: Implement synthesizer v0 evaluation metrics: coverage, uniqueness, stability, cost

[] (CDX) Step 31: Implement disambiguation loop (web: scoping, role/name; desktop: label proximity, container signature)

[] (CDX) Step 32: Implement greedy minimization of selectors (remove predicates while keeping coverage + uniqueness)

[] (CDX) Step 33: Output compiled `selectors.json` and `assertions.json` into workflow package format

[] (CDX) Step 34: Add verification mode in orchestrator: Explain → Act → Verify per step, always capturing evidence

[] (CDX) Step 35: Build verifier UI package skeleton (simple local web UI or Electron shell) to show step details and the 3 decision buttons

[] (CDX) Step 36: Implement decision handling: Proceed, Proceed with Comments, Raise Issue with Comments

[] (CDX) Step 37: Implement exception-queue storage (SQLite) with issue schema, statuses, and attachments folder

[] (CDX) Step 38: Wire verifier UI to exception-queue API and orchestrator verification sessions

[] (CDX) Step 39: Implement re-run single step and re-record single step flows for issue triage

[] (CDX) Step 40: Add CI workflow (`.github/workflows/ci.yml`) for lint + unit tests + web smoke tests

[] (CDX) Step 41: Add hardening: structured error taxonomy, consistent StepTrace, and richer assertion failure messages

[] (CDX) Step 42: Add optional OCR fallback module (Windows OCR first), integrate into desktop selector ladder as last UIA fallback

[] (CDX) Step 43: Add enterprise edge-case tests: virtualized list handling strategy, window focus stability, and timeouts

[] (CDX) Step 44: Add optional compile-time AI resolver (behind a strict confidence gate and caching), never used at runtime

[] (CDX) Step 45: Write getting started guide and architecture overview in `docs/` and publish to GitHub Pages

[] (CDX) Step 46: Prepare initial release: versioning, changelog, license, README updates, and publish to npm/PyPI

[] (CDX) Step 47: Establish test frameworks and conventions

- Node: add Vitest (or Jest) setup for `packages/*` TS code
- Python: add pytest setup for `desktop-runner` and `recorder-desktop`
- Define `scripts/test.ps1` to run all tests consistently on Windows

[] (CDX) Step 48: Add contract/schema validation tests

- Validate DSL examples against JSON Schema
- Validate JSON-RPC messages (basic shape checks) against contract types
- Add a failing test for any missing pre/post assertions

[] (CDX) Step 49: Add integration test harness (headless + mocked desktop)

- Web integration: Playwright against a local demo page
- Desktop integration: mock UIA layer for unit tests + optional “manual” integration tests gated by env var

[] (CDX) Step 50: Add coverage reporting

- Node: coverage output to `coverage/`
- Python: coverage output to `htmlcov/`
- Upload coverage artifacts in CI (optional)

[] (CDX) Step 51: Docs generation pipeline

- Add `docs/` build using MkDocs (Python) or Docusaurus (Node) (pick one)
- Generate API/DSL docs from JSON Schemas (auto-render schema fields into markdown)

[] (CDX) Step 52: GitHub Actions workflows expansion

- `ci.yml`: lint + unit tests + schema validation + Playwright smoke
- `docs.yml`: build docs on PR; deploy to GitHub Pages on main
- `release.yml`: tag-driven release workflow (build + publish artifacts)

[] (CDX) Step 53: Add pre-commit style checks (optional)

- Node: eslint + prettier
- Python: ruff + black
- Ensure CI enforces formatting

[] (CDX) Step 54: Add sample workflow “verification run” golden artifacts

- Store a minimal expected `review/` + `evidence/` output for one sample
- Add a test that checks the orchestrator writes required evidence files
