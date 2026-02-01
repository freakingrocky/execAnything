from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from desktop_runner.errors import AmbiguousMatch, ElementNotFound, OcrUnavailable, TimeoutError
from desktop_runner.uia.adapter import UIAAdapter


def resolve_ladder(
    target: Dict[str, Any],
    retry: Optional[Dict[str, Any]] = None,
    timeout_ms: Optional[int] = None,
    adapter: Optional[UIAAdapter] = None,
    return_element: bool = False,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Optional[Any]]:
    adapter = adapter or UIAAdapter()
    ladder = target.get("ladder") or []
    scope = target.get("scope")
    if not ladder:
        raise ElementNotFound("Target ladder is empty")

    attempts: List[Dict[str, Any]] = []
    start_time = time.monotonic()

    total_attempts = 1 + int((retry or {}).get("attempts", 0))
    wait_ms = int((retry or {}).get("wait_ms", 0))
    backoff = (retry or {}).get("backoff", "none")

    for attempt_index in range(total_attempts):
        if timeout_ms is not None and _elapsed_ms(start_time) > timeout_ms:
            raise TimeoutError(data={"match_attempts": attempts})

        try:
            resolved, new_attempts, element = _resolve_once(adapter, ladder, scope)
            attempts.extend(new_attempts)
            return resolved, attempts, element if return_element else None
        except ElementNotFound as exc:
            attempts.extend(exc.data.get("match_attempts", []) if exc.data else [])
            if attempt_index >= total_attempts - 1:
                raise ElementNotFound(data={"match_attempts": attempts}) from exc
        if wait_ms > 0 and attempt_index < total_attempts - 1:
            time.sleep(_backoff_delay(wait_ms, backoff, attempt_index))

    raise ElementNotFound(data={"match_attempts": attempts})


def _resolve_once(
    adapter: UIAAdapter, ladder: List[Dict[str, Any]], scope: Optional[Dict[str, Any]]
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Optional[Any]]:
    attempts: List[Dict[str, Any]] = []
    root = adapter.get_scope_root(scope)

    for index, rung in enumerate(ladder):
        kind = rung.get("kind")
        selector = rung.get("selector", {})
        start = time.monotonic()
        error: Optional[str] = None
        matched: List[Any] = []
        ok = False

        try:
            if kind == "uia":
                matched = adapter.find_uia(root, selector)
            elif kind == "uia_near_label":
                matched = adapter.find_uia_near_label(root, selector)
            elif kind == "ocr_anchor":
                raise OcrUnavailable()
            elif kind == "coords":
                matched = []
                error = "Coordinate selector not supported yet"
            else:
                matched = []
                error = f"Unsupported rung kind: {kind}"
        except OcrUnavailable as exc:
            duration_ms = _duration_ms(start)
            attempts.append(
                {
                    "rung_index": index,
                    "kind": kind,
                    "matched_count": 0,
                    "duration_ms": duration_ms,
                    "ok": False,
                    "error": exc.message,
                }
            )
            raise

        matched_count = len(matched)
        duration_ms = _duration_ms(start)
        if matched_count == 1:
            ok = True
        attempt = {
            "rung_index": index,
            "kind": kind,
            "matched_count": matched_count,
            "duration_ms": duration_ms,
            "ok": ok,
        }
        if error:
            attempt["error"] = error
        attempts.append(attempt)

        if matched_count == 1:
            resolved = {"rung_index": index, "kind": kind, "element": adapter.describe(matched[0])}
            return resolved, attempts, matched[0]
        if matched_count > 1:
            raise AmbiguousMatch(data={"match_attempts": attempts})

    raise ElementNotFound(data={"match_attempts": attempts})


def _elapsed_ms(start_time: float) -> int:
    return int((time.monotonic() - start_time) * 1000)


def _duration_ms(start_time: float) -> int:
    return int((time.monotonic() - start_time) * 1000)


def _backoff_delay(wait_ms: int, backoff: str, attempt_index: int) -> float:
    if backoff == "linear":
        return wait_ms * (attempt_index + 1) / 1000
    if backoff == "exponential":
        return wait_ms * (2**attempt_index) / 1000
    return wait_ms / 1000
