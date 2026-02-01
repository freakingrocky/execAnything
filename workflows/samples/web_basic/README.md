# Web basic sample

This sample drives the local web runner test page.

## How to run

1. Build a file URL for the test app:
   - `web-runner/test-app/index.html`
2. Update `inputs.json` with that file URL under `TEST_APP_URL`.
3. Run the orchestrator:

```powershell
node orchestrator/dist/cli/run.js --workflow workflows/samples/web_basic/workflow.json --inputs workflows/samples/web_basic/inputs.json --out runs
```

## Notes

- This sample is intentionally generic and uses the bundled demo HTML page.
- It includes pre/post assertions on every step to enforce deterministic verification.
