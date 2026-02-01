from __future__ import annotations

from typing import Any, Dict, Optional

from desktop_runner.actions.step_trace import StepTraceBuilder
from desktop_runner.errors import ActionFailed, DesktopRunnerError
from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.uia.adapter import UIAAdapter


def get_value(
    params: Dict[str, Any],
    adapter: Optional[UIAAdapter] = None,
) -> Dict[str, Any]:
    adapter = adapter or UIAAdapter()
    trace = StepTraceBuilder(run_id=params["run_id"], step_id=params["step_id"])
    try:
        resolved, match_attempts, element_handle = resolve_ladder(
            params["target"],
            retry=params.get("retry"),
            timeout_ms=params.get("timeout_ms"),
            adapter=adapter,
            return_element=True,
        )
        trace.match_attempts = match_attempts
        trace.resolved = resolved
        value = adapter.get_value(element_handle)
        trace.value = value
        trace.ok = True
        return trace.finish()
    except DesktopRunnerError as exc:
        if exc.data and "match_attempts" in exc.data:
            trace.match_attempts = exc.data["match_attempts"]
        trace.error = exc.message
        trace.error_code = exc.code
        exc.data = exc.data or {}
        exc.data["trace"] = trace.finish()
        raise
    except Exception as exc:
        trace.error = str(exc)
        trace.error_code = ActionFailed().code
        raise ActionFailed(data={"trace": trace.finish()}) from exc
