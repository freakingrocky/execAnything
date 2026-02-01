from __future__ import annotations

from typing import Any, Dict, Optional

from desktop_runner.actions.step_trace import StepTraceBuilder
from desktop_runner.errors import ActionFailed, DesktopRunnerError
from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.uia.adapter import UIAAdapter


def set_value(
    params: Dict[str, Any],
    adapter: Optional[UIAAdapter] = None,
) -> Dict[str, Any]:
    adapter = adapter or UIAAdapter()
    trace = StepTraceBuilder(run_id=params["run_id"], step_id=params["step_id"])
    capture = bool(params.get("capture_screenshots", False))
    try:
        trace.capture_before(capture)
        resolved, match_attempts, element_handle = resolve_ladder(
            params["target"],
            retry=params.get("retry"),
            timeout_ms=params.get("timeout_ms"),
            adapter=adapter,
            return_element=True,
        )
        trace.match_attempts = match_attempts
        trace.resolved = resolved
        try:
            adapter.set_value(element_handle, params["value"])
        except Exception:
            adapter.paste_text(element_handle, params["value"])
        trace.capture_after(capture)
        trace.ok = True
        return trace.finish()
    except DesktopRunnerError as exc:
        if exc.data and "match_attempts" in exc.data:
            trace.match_attempts = exc.data["match_attempts"]
        trace.error = exc.message
        trace.error_code = exc.code
        trace.capture_after(capture)
        exc.data = exc.data or {}
        exc.data["trace"] = trace.finish()
        raise
    except Exception as exc:
        trace.error = str(exc)
        trace.error_code = ActionFailed().code
        trace.capture_after(capture)
        raise ActionFailed(data={"trace": trace.finish()}) from exc
