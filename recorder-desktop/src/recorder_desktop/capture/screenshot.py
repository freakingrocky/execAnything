from __future__ import annotations

import os
from pathlib import Path


def capture_screen(path: Path) -> str:
    if os.name != "nt":
        raise RuntimeError("Screenshots are only supported on Windows")

    from PIL import ImageGrab

    path.parent.mkdir(parents=True, exist_ok=True)
    image = ImageGrab.grab()
    image.save(path)
    return str(path)
