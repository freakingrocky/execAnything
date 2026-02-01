from __future__ import annotations

import os
from typing import Optional


def element_from_point(x: int, y: int) -> Optional[object]:
    if os.name != "nt":
        return None
    try:
        from pywinauto import Desktop

        desktop = Desktop(backend="uia")
        return desktop.from_point(x, y)
    except Exception:
        return None
