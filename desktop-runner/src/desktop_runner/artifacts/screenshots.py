from __future__ import annotations

import ctypes
import ctypes.wintypes
import os
from pathlib import Path
from typing import Optional


def capture_screenshot(name: str, base_dir: Optional[Path], mode: str) -> str:
    if os.name != "nt":
        raise RuntimeError("Screenshots are only supported on Windows")

    from PIL import ImageGrab

    directory = base_dir or Path("artifacts")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name

    if mode == "screen":
        image = ImageGrab.grab()
    else:
        image = ImageGrab.grab(bbox=_active_window_bbox())
    image.save(path)
    return str(path)


def _active_window_bbox() -> tuple[int, int, int, int]:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    GetForegroundWindow = user32.GetForegroundWindow
    GetWindowRect = user32.GetWindowRect

    hwnd = GetForegroundWindow()
    rect = ctypes.wintypes.RECT()
    GetWindowRect(hwnd, ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom
