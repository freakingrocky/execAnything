# DSL and Desktop RPC Notes

## Desktop StepTrace

Action methods (`action.click`, `action.pasteText`, `action.setValue`) return a `StepTrace` object with the following fields:

- `run_id`: Orchestrator run identifier.
- `step_id`: Workflow step identifier.
- `started_at` / `ended_at`: ISO-8601 UTC timestamps.
- `ok`: Whether the action completed successfully.
- `match_attempts`: Array of selector ladder match attempts.
- `resolved`: Best-effort resolved element descriptor (rung index, kind, and element metadata).
- `before_screenshot_path`: Path to the screenshot captured before the action (when enabled).
- `after_screenshot_path`: Path to the screenshot captured after the action (when enabled).
- `error`: Optional error message when the step fails.

## Desktop RPC error codes

The desktop runner uses the following error codes in JSON-RPC error responses:

- `1000` ScopeNotFound: target window/process not found
- `1001` ElementNotFound: no match for selector ladder
- `1002` AmbiguousMatch: selector rung matched more than one element
- `1003` ActionFailed: click/paste/set failed
- `1004` AssertionFailed: assert.check failed
- `1005` Timeout: operation timed out
- `1006` OCRUnavailable: OCR requested but not available

## Web assertion kinds

Web assertions in the workflow DSL include:

- `web_exists`: target is attached to the DOM
- `web_visible`: target is visible
- `web_url_contains`: current URL contains `url_contains`
- `web_url_equals`: current URL equals `url_equals`
- `web_title_contains`: document title contains `title_contains`
- `web_text_contains`: target text contains `text`
- `web_text_equals`: target text equals `text`
- `web_value_equals`: target input value equals `value`
- `web_value_contains`: target input value contains `value`
- `not`: negate nested assertion
