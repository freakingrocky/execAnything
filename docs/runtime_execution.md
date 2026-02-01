# Runtime Execution (Phase 1)

This document describes how the Phase 1 orchestrator executes **desktop-only** workflows and where artifacts are written.

## Run Flow

1. Load `workflow.json` and `inputs.json`.
2. Create a run folder under the output directory.
3. Start the desktop runner (JSON-RPC over stdio).
4. Call `run.begin` with the run id and evidence directory.
5. For each workflow step:
   - Run `pre_assert` (if provided) via `assert.check`.
   - Execute the step action (`click`, `paste`, `fill`, `type`, `extract`, or `assert`).
   - Run `post_assert` (if provided) via `assert.check`.
   - Append each returned `StepTrace` to `logs/step_traces.jsonl`.
6. Call `run.end` and stop the runner.

## Checkpointing & Resume

The orchestrator records checkpoints in:

```
artifacts/<run>/checkpoints.json
```

The file includes:

- `run_id`
- `started_at` / `ended_at`
- `last_success_step_id`
- per-step start/end timestamps

To resume a run:

```
node dist/cli/run.js --workflow workflow.json --inputs inputs.json --out <existing-run-dir> --resume
```

When `--resume` is set, the orchestrator loads `checkpoints.json` from the provided run directory, skips completed steps, and continues from the next step.

## Artifact Layout

```
artifacts/<run>/
  evidence/            # screenshots captured by the desktop runner
  logs/step_traces.jsonl
  review/              # reserved for verification mode (Phase 2)
  checkpoints.json
```

Each line in `logs/step_traces.jsonl` is the exact `StepTrace` object returned by the desktop runner for that action or assertion.
