from __future__ import annotations

import ctypes
import os
from typing import Any, Dict, Optional, Tuple


def get_active_window_snapshot() -> Optional[Dict[str, Any]]:
    if os.name != "nt":
        return None

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    GetForegroundWindow = user32.GetForegroundWindow
    GetWindowTextLength = user32.GetWindowTextLengthW
    GetWindowText = user32.GetWindowTextW
    GetClassName = user32.GetClassNameW
    GetWindowThreadProcessId = user32.GetWindowThreadProcessId

    OpenProcess = kernel32.OpenProcess
    CloseHandle = kernel32.CloseHandle
    GetModuleBaseName = psapi.GetModuleBaseNameW

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

    hwnd = GetForegroundWindow()
    if not hwnd:
        return None

    length = GetWindowTextLength(hwnd)
    title_buffer = ctypes.create_unicode_buffer(length + 1)
    GetWindowText(hwnd, title_buffer, length + 1)

    class_buffer = ctypes.create_unicode_buffer(256)
    GetClassName(hwnd, class_buffer, 256)

    pid = ctypes.c_ulong()
    GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    process_name = None
    process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if process_handle:
        name_buffer = ctypes.create_unicode_buffer(260)
        GetModuleBaseName(process_handle, None, name_buffer, 260)
        process_name = name_buffer.value
        CloseHandle(process_handle)

    return {
        "hwnd": int(hwnd),
        "title": title_buffer.value,
        "class": class_buffer.value,
        "process_id": int(pid.value),
        "process_name": process_name,
    }


def get_cursor_position() -> Optional[Tuple[int, int]]:
    if os.name != "nt":
        return None

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    point = POINT()
    if ctypes.windll.user32.GetCursorPos(ctypes.byref(point)) == 0:
        return None
    return point.x, point.y
