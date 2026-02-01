# UI Runner & Verifier

The UI provides a lightweight front-end to list workflows, visualize their step graph, and launch:

- **Record Desktop** (recorder-desktop)
- **Run** (orchestrator run)
- **Verify** (orchestrator verify with UI-driven decisions)

## Launch on Windows

From the repo root:

```powershell
pwsh -File scripts\run.ps1
```

The script:

1. Ensures Node dependencies are installed (web-runner, orchestrator, ui-server, ui).
2. Installs Playwright Chromium if needed.
3. Creates a local Python virtual environment and installs `desktop-runner` + `recorder-desktop`.
4. Builds and starts the UI server and Vite UI.
5. Opens your default browser to `http://localhost:5173`.

## Using the UI

### Workflow list
- The UI scans `workflows/**/workflow.json` and lists each workflow.
- Selecting a workflow renders a read-only flow graph showing each step's id, driver, action, target summary, and assertion counts.

### Run
- Click **Run** to execute the selected workflow via the orchestrator.
- The UI shows streaming logs and the output run directory.

### Verify
- Click **Verify** to run in verification mode.
- When a step requires a decision, the UI shows the decision panel.
- Choose **Proceed**, **Proceed w/ Comments**, or **Raise Issue**.
- The review artifacts directory is shown once the run completes.

### Record Desktop
- Click **Record Desktop** to start the desktop recorder.
- Recording stops when you end the recorder session (per recorder CLI instructions).

## Ports & Environment Overrides

By default:

- UI: `http://localhost:5173`
- UI server: `http://localhost:8787`

Overrides:

- `AI_RPA_WORKFLOWS_DIR`: custom workflows root
- `AI_RPA_RUNS_DIR`: run artifacts root
- `AI_RPA_RECORDINGS_DIR`: recording output root
- `AI_RPA_ORCHESTRATOR_CONFIG`: orchestrator config file path
- `AI_RPA_PYTHON`: python executable for recorder
