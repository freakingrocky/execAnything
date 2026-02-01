import json
import sys
from types import ModuleType

import pytest

from desktop_runner.artifacts import screenshots


class FakeImage:
    def __init__(self, payload):
        self.payload = payload

    def save(self, path):
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(self.payload)


def test_capture_screenshot_writes_file(tmp_path, monkeypatch):
    fake_pil = ModuleType("PIL")
    monkeypatch.setitem(sys.modules, "PIL", fake_pil)

    class FakeImageGrab:
        @staticmethod
        def grab(bbox=None):
            return FakeImage(json.dumps({"bbox": bbox}))

    fake_pil.ImageGrab = FakeImageGrab

    monkeypatch.setattr(screenshots.os, "name", "nt")
    monkeypatch.setitem(sys.modules, "PIL", fake_pil)

    path = screenshots.capture_screenshot("shot.png", base_dir=tmp_path, mode="screen")

    assert (tmp_path / "shot.png").exists()
    assert path.endswith("shot.png")


def test_capture_screenshot_raises_on_non_windows(monkeypatch, tmp_path):
    monkeypatch.setattr(screenshots.os, "name", "posix")
    with pytest.raises(RuntimeError, match="only supported on Windows"):
        screenshots.capture_screenshot("shot.png", base_dir=tmp_path, mode="screen")
