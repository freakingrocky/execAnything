from __future__ import annotations

import ctypes
import os
from dataclasses import dataclass
from typing import Iterable, List, Optional

from desktop_runner.errors import ScopeNotFound


@dataclass
class BoundingRect:
    x: int
    y: int
    w: int
    h: int


class UIAAdapter:
    def __init__(self) -> None:
        if os.name != "nt":
            raise RuntimeError("UIA adapter is only available on Windows")
        from pywinauto import Desktop

        self._desktop = Desktop(backend="uia")

    def get_scope_root(self, scope: Optional[dict]) -> object:
        if scope is None:
            return self._desktop

        title_contains = scope.get("window_title_contains")
        class_name = scope.get("window_class")
        process_name = scope.get("process_name")

        windows = self._desktop.windows()
        matches = []
        for window in windows:
            info = window.element_info
            window_title = info.name or window.window_text()
            window_class = info.class_name
            if title_contains and title_contains.lower() not in window_title.lower():
                continue
            if class_name and class_name.lower() != (window_class or "").lower():
                continue
            if process_name and process_name.lower() not in (self._get_process_name(info.process_id) or "").lower():
                continue
            matches.append(window)

        if not matches:
            raise ScopeNotFound()
        return matches[0]

    def find_uia(self, root: object, selector: dict) -> List[object]:
        control_type = selector.get("controlType")
        automation_id = selector.get("automationId")
        name = selector.get("name")
        class_name = selector.get("className")

        if hasattr(root, "descendants"):
            candidates = root.descendants(control_type=control_type) if control_type else root.descendants()
        else:
            candidates = root.windows(control_type=control_type) if control_type else root.windows()

        matches = []
        for element in candidates:
            info = element.element_info
            if automation_id and automation_id != info.automation_id:
                continue
            if name and name != info.name:
                continue
            if class_name and class_name != info.class_name:
                continue
            matches.append(element)
        return matches

    def find_uia_near_label(self, root: object, selector: dict) -> List[object]:
        label_text = selector.get("label")
        control_type = selector.get("controlType")
        max_distance = selector.get("maxDistancePx", 120)
        direction = selector.get("direction")

        if not label_text:
            return []

        labels = self.find_uia(root, {"name": label_text, "controlType": "Text"})
        if not labels:
            return []

        targets = self.find_uia(root, {"controlType": control_type} if control_type else {})
        matches = []
        for label in labels:
            label_rect = self._rect_from_element(label)
            for element in targets:
                rect = self._rect_from_element(element)
                if rect is None or label_rect is None:
                    continue
                if not self._is_near(label_rect, rect, max_distance, direction):
                    continue
                matches.append(element)
        return matches

    def describe(self, element: object) -> dict:
        info = element.element_info
        rect = self._rect_from_element(element)
        return {
            "automationId": info.automation_id,
            "name": info.name,
            "controlType": info.control_type,
            "className": info.class_name,
            "boundingRect": rect.__dict__ if rect else None,
        }

    def click(self, element: object, button: str, clicks: int) -> None:
        element.click_input(button=button, double=clicks == 2)
        if clicks == 3:
            element.click_input(button=button, double=True)
            element.click_input(button=button, double=False)

    def paste_text(self, element: object, text: str) -> None:
        from pywinauto import clipboard, keyboard

        clipboard.set_data(text)
        element.set_focus()
        keyboard.send_keys("^v")

    def set_value(self, element: object, value: str) -> None:
        element.set_value(value)

    def get_value(self, element: object) -> str:
        if hasattr(element, "get_value"):
            return element.get_value()
        info = element.element_info
        return info.name or ""

    def is_visible(self, element: object) -> bool:
        if hasattr(element, "is_visible"):
            return bool(element.is_visible())
        return True

    def get_focused_control_type(self) -> Optional[str]:
        from pywinauto.uia_defines import IUIA

        focused = IUIA().get_focused_element()
        if focused is None:
            return None
        return focused.current_control_type

    def _rect_from_element(self, element: object) -> Optional[BoundingRect]:
        try:
            rect = element.rectangle()
        except Exception:
            return None
        return BoundingRect(x=rect.left, y=rect.top, w=rect.right - rect.left, h=rect.bottom - rect.top)

    def _is_near(self, label: BoundingRect, target: BoundingRect, max_distance: int, direction: Optional[str]) -> bool:
        if direction == "right_of":
            return 0 <= target.x - (label.x + label.w) <= max_distance
        if direction == "left_of":
            return 0 <= label.x - (target.x + target.w) <= max_distance
        if direction == "above":
            return 0 <= label.y - (target.y + target.h) <= max_distance
        if direction == "below":
            return 0 <= target.y - (label.y + label.h) <= max_distance
        return self._distance(label, target) <= max_distance

    def _distance(self, label: BoundingRect, target: BoundingRect) -> float:
        label_center = (label.x + label.w / 2, label.y + label.h / 2)
        target_center = (target.x + target.w / 2, target.y + target.h / 2)
        return ((label_center[0] - target_center[0]) ** 2 + (label_center[1] - target_center[1]) ** 2) ** 0.5

    def _get_process_name(self, pid: int) -> Optional[str]:
        if pid == 0:
            return None
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

        OpenProcess = kernel32.OpenProcess
        CloseHandle = kernel32.CloseHandle
        GetModuleBaseName = psapi.GetModuleBaseNameW

        process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not process_handle:
            return None
        name_buffer = ctypes.create_unicode_buffer(260)
        GetModuleBaseName(process_handle, None, name_buffer, 260)
        CloseHandle(process_handle)
        return name_buffer.value
