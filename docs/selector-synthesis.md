# Selector Synthesis (v0)

The v0 synthesizer reads `recording.jsonl` artifacts from the desktop recorder
and emits deterministic selector ladders plus assertion templates. This phase
is *compile-time only* and never uses runtime AI.

## Inputs

- `recording.jsonl` produced by the desktop recorder (see `docs/recording_format_v0.md`).

## Outputs

Two JSON files are emitted in the workflow package:

### `selectors.json`

```json
{
  "version": "v0",
  "recording": "recording.jsonl",
  "steps": [
    {
      "event_index": 0,
      "event_type": "click",
      "ladder": [
        { "kind": "uia", "confidence": 0.92, "selector": { "automationId": "saveButton", "controlType": "Button" } },
        { "kind": "uia", "confidence": 0.86, "selector": { "name": "Save", "controlType": "Button" } },
        { "kind": "uia_path", "confidence": 0.7, "selector": { "path": [ ... ] } }
      ],
      "ambiguous": false
    }
  ]
}
```

- `ladder` entries are ranked in priority order.
- `ambiguous` is `true` when multiple rungs share the same confidence or no
  stable rung was produced.

### `assertions.json`

```json
{
  "version": "v0",
  "recording": "recording.jsonl",
  "steps": [
    {
      "event_index": 0,
      "event_type": "click",
      "pre_assert": [
        { "kind": "desktop_window_active", "target": { "scope": { "window_title_contains": "Untitled - Editor" } } }
      ],
      "post_assert": [
        { "kind": "desktop_element_exists", "target": { "ladder": [ ... ] } }
      ]
    }
  ]
}
```

## Current heuristics

For each recorded event with a UIA snapshot, v0 produces:

1. UIA automationId + controlType
2. UIA name + controlType
3. UIA automationId only
4. UIA name only
5. UIA path ladder from ancestry
6. Near-label selectors when label metadata is present

These rungs are deterministic and sorted by confidence. If multiple rungs share
the same confidence, the step is marked as `ambiguous` for review.

## Extension points

Future versions will add multi-recording scoring, disambiguation loops, and
greedy minimization. v0 intentionally stops short of those steps.
