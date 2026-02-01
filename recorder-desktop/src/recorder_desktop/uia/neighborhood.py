from __future__ import annotations

from typing import Any, Dict, List


def build_ancestry(element: object, max_depth: int = 4) -> List[Dict[str, Any]]:
    ancestry: List[Dict[str, Any]] = []
    current = element
    depth = 0

    while current is not None and depth < max_depth:
        info = getattr(current, "element_info", None)
        if info is None:
            break
        ancestry.append(
            {
                "controlType": getattr(info, "control_type", None),
                "name": getattr(info, "name", None),
                "automationId": getattr(info, "automation_id", None),
                "className": getattr(info, "class_name", None),
            }
        )
        try:
            current = current.parent()
        except Exception:
            break
        depth += 1

    return ancestry
