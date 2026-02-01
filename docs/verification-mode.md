# Verification Mode (CLI Scaffolding)

The verification CLI runs workflows step-by-step, capturing evidence and
requiring explicit human decisions before proceeding to the next step.

## CLI flow

1. Load `workflow.json` and `inputs.json`.
2. Create a run folder with `logs/`, `evidence/`, and `review/`.
3. For each step:
   - Write `review/step_<id>.md` with the explain text and pre/post assertions.
   - Execute the step (pre-assert → action → post-assert).
   - Write the latest trace to `review/step_<id>_trace.json`.
   - Copy any before/after screenshots into `review/`.
   - Persist the decision to `review/decisions.jsonl`.

## Decisions

Operators choose one of:

- Proceed
- Proceed with comments
- Raise issue with comments

Decisions are stored as JSONL records with timestamps and comments when
provided.
