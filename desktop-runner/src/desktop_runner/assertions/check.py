from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from desktop_runner.actions.step_trace import StepTraceBuilder
from desktop_runner.errors import AssertionFailed, DesktopRunnerError
from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.uia.adapter import UIAAdapter
from desktop_runner.windows import get_active_window_descriptor


def check_assertions(
    params: Dict[str, Any],
    adapter: Optional[UIAAdapter] = None,
) -> Dict[str, Any]:
    adapter = adapter or UIAAdapter()
    trace = StepTraceBuilder(run_id=params["run_id"], step_id=params["step_id"])
    failed: List[Dict[str, Any]] = []
    match_attempts: List[Dict[str, Any]] = []
    resolved: Optional[Dict[str, Any]] = None
    assertions = params.get("assertions") or []

    for index, assertion in enumerate(assertions):
        ok, message, attempts, resolved_element = _evaluate_with_timeout(assertion, adapter)
        match_attempts.extend(attempts)
        if resolved_element is not None:
            resolved = resolved_element
        if not ok:
            failed.append({"index": index, "kind": assertion.get("kind"), "message": message})

    trace.match_attempts = match_attempts
    trace.resolved = resolved
    if failed:
        trace.ok = False
        trace.error = "Assertion failed"
        trace.error_code = AssertionFailed().code
        trace.failed = failed
        raise AssertionFailed(data={"failed": failed, "trace": trace.finish()})

    trace.ok = True
    trace.failed = []
    return trace.finish()


def _evaluate_with_timeout(
    assertion: Dict[str, Any], adapter: UIAAdapter
) -> Tuple[bool, str, List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    timeout_ms = assertion.get("timeout_ms")
    deadline = time.monotonic() + (timeout_ms / 1000) if timeout_ms else None
    last_message = "Assertion did not pass"
    attempts: List[Dict[str, Any]] = []
    resolved: Optional[Dict[str, Any]] = None

    while True:
        ok, message, new_attempts, new_resolved = _evaluate_once(assertion, adapter)
        attempts.extend(new_attempts)
        if new_resolved is not None:
            resolved = new_resolved
        if ok:
            return True, "", attempts, resolved
        last_message = message
        if deadline is None or time.monotonic() >= deadline:
            return False, last_message, attempts, resolved
        time.sleep(0.2)


def _evaluate_once(
    assertion: Dict[str, Any], adapter: UIAAdapter
) -> Tuple[bool, str, List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    kind = assertion.get("kind")
    if kind == "not":
        nested = assertion.get("assert")
        if not isinstance(nested, dict):
            return False, "Missing nested assertion for not", [], None
        ok, _, attempts, resolved = _evaluate_once(nested, adapter)
        return (not ok, "Negated assertion failed" if ok else "", attempts, resolved)

    if kind == "desktop_window_active":
        scope = (assertion.get("target") or {}).get("scope")
        active = get_active_window_descriptor()
        if not _matches_scope(active, scope):
            return False, "Active window did not match scope", [], None
        return True, "", [], None

    if kind in {"desktop_element_exists", "desktop_element_visible"}:
        target = assertion.get("target")
        if not isinstance(target, dict):
            return False, "Missing target for element assertion", [], None
        try:
            resolved, match_attempts, element = resolve_ladder(
                target, adapter=adapter, return_element=True, timeout_ms=assertion.get("timeout_ms")
            )
        except DesktopRunnerError as exc:
            return False, exc.message, exc.data.get("match_attempts", []) if exc.data else [], None
        if element is None:
            return False, "Element not resolved", match_attempts, resolved
        if kind == "desktop_element_visible" and not adapter.is_visible(element):
            return False, "Element not visible", match_attempts, resolved
        return True, "", match_attempts, resolved

    if kind == "desktop_focused_controlType":
        expected = assertion.get("controlType")
        focused = adapter.get_focused_control_type()
        if focused != expected:
            return False, f"Focused control type mismatch (expected {expected}, got {focused})", [], None
        return True, "", [], None

    if kind in {"desktop_value_equals", "desktop_value_contains"}:
        target = assertion.get("target")
        expected = assertion.get("value", "")
        if not isinstance(target, dict):
            return False, "Missing target for value assertion", [], None
        try:
            resolved, match_attempts, element = resolve_ladder(
                target, adapter=adapter, return_element=True, timeout_ms=assertion.get("timeout_ms")
            )
        except DesktopRunnerError as exc:
            return False, exc.message, exc.data.get("match_attempts", []) if exc.data else [], None
        value = adapter.get_value(element)
        if kind == "desktop_value_equals" and value != expected:
            return False, f"Value mismatch (expected {expected}, got {value})", match_attempts, resolved
        if kind == "desktop_value_contains" and expected not in value:
            return False, f"Value did not contain {expected}", match_attempts, resolved
        return True, "", match_attempts, resolved

    return False, f"Unsupported assertion kind: {kind}", [], None


def _matches_scope(active: Optional[Dict[str, Any]], scope: Optional[Dict[str, Any]]) -> bool:
    if active is None:
        return False
    if not scope:
        return True
    title_contains = scope.get("window_title_contains")
    class_name = scope.get("window_class")
    process_name = scope.get("process_name")

    if title_contains and title_contains.lower() not in (active.get("title") or "").lower():
        return False
    if class_name and class_name.lower() != (active.get("class") or "").lower():
        return False
    if process_name and process_name.lower() not in (active.get("process_name") or "").lower():
        return False
    return True
