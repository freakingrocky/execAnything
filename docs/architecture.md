# Architecture

## Orchestrator <-> Desktop Runner JSON-RPC

The orchestrator spawns the desktop runner as a Python module and communicates over JSON-RPC 2.0 using stdio with JSON Lines framing (one JSON object per line). The orchestrator owns request IDs and correlates responses, while the desktop runner validates requests and returns either a result or a JSON-RPC error code defined in the shared desktop RPC contract. The protocol currently covers health checks (system.ping), capability discovery (system.getCapabilities), and the core desktop primitives.

### Desktop runner method map

- Resolve
  - `target.resolve`
- Actions
  - `action.click`
  - `action.pasteText`
  - `action.setValue`
- Assertions
  - `assert.check`
- Extract
  - `extract.getValue`
- Artifacts
  - `artifact.screenshot`
