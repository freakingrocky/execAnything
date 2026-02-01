# Desktop basic sample (manual)

This workflow focuses a Notepad window and fills in text. It is **manual-only**
and should not run in CI.

## How to run (Windows)

1. Launch Notepad.
2. Ensure the Notepad window title contains “Notepad”.
3. Run:

```powershell
node orchestrator/dist/cli/run.js --workflow workflows/samples/desktop_basic/workflow.json --inputs workflows/samples/desktop_basic/inputs.json --out runs
```

## Notes

- Targets are UIA-based and scoped to `notepad.exe`.
- Update `inputs.json` to change the text payload.
