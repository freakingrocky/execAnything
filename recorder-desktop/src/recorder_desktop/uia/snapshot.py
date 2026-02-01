from __future__ import annotations

from typing import Any, Dict

from recorder_desktop.uia.element_under_cursor import element_from_point
from recorder_desktop.uia.neighborhood import build_ancestry


def snapshot_from_cursor(x: int, y: int) -> Dict[str, Any]:
    element = element_from_point(x, y)
    if element is None:
        return {"uia": {}, "ancestry": []}
    return snapshot_from_element(element)


def snapshot_from_element(element: object) -> Dict[str, Any]:
    info = getattr(element, "element_info", None)
    rect = None
    try:
        rectangle = element.rectangle()
        rect = {
            "x": rectangle.left,
            "y": rectangle.top,
            "w": rectangle.right - rectangle.left,
            "h": rectangle.bottom - rectangle.top,
        }
    except Exception:
        rect = None

    uia = {
        "name": getattr(info, "name", None) if info else None,
        "automationId": getattr(info, "automation_id", None) if info else None,
        "className": getattr(info, "class_name", None) if info else None,
        "controlType": getattr(info, "control_type", None) if info else None,
        "boundingRect": rect,
    }
    return {
        "uia": uia,
        "ancestry": build_ancestry(element),
    }
