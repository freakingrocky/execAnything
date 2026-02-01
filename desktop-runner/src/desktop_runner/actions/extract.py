from __future__ import annotations

from typing import Any, Dict, Optional

from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.uia.adapter import UIAAdapter


def get_value(
    params: Dict[str, Any],
    adapter: Optional[UIAAdapter] = None,
) -> Dict[str, Any]:
    adapter = adapter or UIAAdapter()
    _, _, element_handle = resolve_ladder(
        params["target"],
        retry=params.get("retry"),
        timeout_ms=params.get("timeout_ms"),
        adapter=adapter,
        return_element=True,
    )
    value = adapter.get_value(element_handle)
    return {"value": value}
