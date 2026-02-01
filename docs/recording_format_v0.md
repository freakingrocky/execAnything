# Recording Format v0

This document describes the minimal JSONL recording format emitted by the desktop recorder in Phase 1.

## File Layout

A recording session creates:

```
recordings/<name>/
  recording.jsonl
  screenshots/
```

Each line in `recording.jsonl` is a single JSON object describing one event.

## Event Schema (v0)

Required keys:

- `type`: `focus`, `click`, `keypress`, `type`, or `inspect`
- `timestamp`: ISO-8601 string (UTC)
- `window`: active window snapshot
- `target`: candidate element snapshot (UIA + ancestry)

Optional keys:

- `cursor`: `{ "x": number, "y": number }`
- `screenshot_path`: relative path to an image under `screenshots/`
- `metadata`: event-specific data (button, key, etc.)

### Window snapshot

```
{
  "hwnd": 12345,
  "title": "Window title",
  "class": "WindowClass",
  "process_id": 4242,
  "process_name": "app.exe"
}
```

### Target snapshot

```
{
  "uia": {
    "name": "Button",
    "automationId": "submitButton",
    "className": "Button",
    "controlType": "Button",
    "boundingRect": { "x": 100, "y": 200, "w": 80, "h": 24 }
  },
  "ancestry": [
    { "controlType": "Button", "name": "Button", "automationId": "submitButton", "className": "Button" },
    { "controlType": "Pane", "name": "Form", "automationId": "formRoot", "className": "Pane" }
  ]
}
```

## Example JSONL Events

```
{"type":"focus","timestamp":"2026-02-01T03:21:02Z","window":{"hwnd":2345,"title":"Untitled - Editor","class":"Editor","process_id":1234,"process_name":"editor.exe"},"target":{"uia":{"name":"","automationId":"","className":"","controlType":"Window","boundingRect":{"x":0,"y":0,"w":800,"h":600}},"ancestry":[]},"cursor":{"x":320,"y":220},"screenshot_path":"screenshots/focus_2026-02-01T03-21-02Z.png"}
{"type":"click","timestamp":"2026-02-01T03:21:05Z","window":{"hwnd":2345,"title":"Untitled - Editor","class":"Editor","process_id":1234,"process_name":"editor.exe"},"target":{"uia":{"name":"Save","automationId":"saveButton","className":"Button","controlType":"Button","boundingRect":{"x":150,"y":80,"w":60,"h":24}},"ancestry":[{"controlType":"Button","name":"Save","automationId":"saveButton","className":"Button"},{"controlType":"ToolBar","name":"Main","automationId":"mainToolbar","className":"ToolBar"}]},"cursor":{"x":160,"y":90},"metadata":{"button":"Button.left"},"screenshot_path":"screenshots/click_2026-02-01T03-21-05Z.png"}
{"type":"keypress","timestamp":"2026-02-01T03:21:08Z","window":{"hwnd":2345,"title":"Untitled - Editor","class":"Editor","process_id":1234,"process_name":"editor.exe"},"target":{"uia":{"name":"","automationId":"editor","className":"Edit","controlType":"Edit","boundingRect":{"x":50,"y":120,"w":700,"h":400}},"ancestry":[]},"cursor":{"x":100,"y":150},"metadata":{"key":"a"}}
```
