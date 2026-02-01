from __future__ import annotations

from typing import Any, Dict, List, Optional

from desktop_runner.errors import AssertionFailed
from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.uia.adapter import UIAAdapter
from desktop_runner.windows import get_active_window_descriptor


def check_assertions(
    params: Dict[str, Any],
    adapter: Optional[UIAAdapter] = None,
) -> Dict[str, Any]:
    adapter = adapter or UIAAdapter()
    failed: List[Dict[str, Any]] = []
    assertions = params.get("assertions") or []

    for index, assertion in enumerate(assertions):
        ok, message = _evaluate_assertion(assertion, adapter)
        if not ok:
            failed.append({"index": index, "kind": assertion.get("kind"), "message": message})

    if failed:
        raise AssertionFailed(data={"failed": failed})
    return {"ok": True, "failed": []}


def _evaluate_assertion(assertion: Dict[str, Any], adapter: UIAAdapter) -> tuple[bool, str]:
    kind = assertion.get("kind")
    if kind == "not":
        nested = assertion.get("assert")
        if not isinstance(nested, dict):
            return False, "Missing nested assertion for not"
        ok, _ = _evaluate_assertion(nested, adapter)
        return (not ok, "Negated assertion failed" if ok else "")

    if kind == "desktop_window_active":
        scope = (assertion.get("target") or {}).get("scope")
        active = get_active_window_descriptor()
        if not _matches_scope(active, scope):
            return False, "Active window did not match scope"
        return True, ""

    if kind in {"desktop_element_exists", "desktop_element_visible"}:
        target = assertion.get("target")
        if not isinstance(target, dict):
            return False, "Missing target for element assertion"
        _, _, element = resolve_ladder(target, adapter=adapter, return_element=True)
        if element is None:
            return False, "Element not resolved"
        if kind == "desktop_element_visible" and not adapter.is_visible(element):
            return False, "Element not visible"
        return True, ""

    if kind == "desktop_focused_controlType":
        expected = assertion.get("controlType")
        focused = adapter.get_focused_control_type()
        if focused != expected:
            return False, f"Focused control type mismatch (expected {expected}, got {focused})"
        return True, ""

    if kind in {"desktop_value_equals", "desktop_value_contains"}:
        target = assertion.get("target")
        expected = assertion.get("value", "")
        if not isinstance(target, dict):
            return False, "Missing target for value assertion"
        _, _, element = resolve_ladder(target, adapter=adapter, return_element=True)
        value = adapter.get_value(element)
        if kind == "desktop_value_equals" and value != expected:
            return False, f"Value mismatch (expected {expected}, got {value})"
        if kind == "desktop_value_contains" and expected not in value:
            return False, f"Value did not contain {expected}"
        return True, ""

    return False, f"Unsupported assertion kind: {kind}"


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
