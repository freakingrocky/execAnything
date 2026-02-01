from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


REQUIRED_KEYS = {"type", "timestamp", "window", "target"}


@dataclass
class RecordingWriter:
    base_dir: Path
    name: str

    def __post_init__(self) -> None:
        self.recording_dir = self.base_dir / self.name
        self.screenshots_dir = self.recording_dir / "screenshots"
        self.recording_dir.mkdir(parents=True, exist_ok=True)
        self.screenshots_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.recording_dir / "recording.jsonl"
        self._handle = self._path.open("a", encoding="utf-8")

    @property
    def path(self) -> Path:
        return self._path

    def write_event(self, event: Dict[str, Any]) -> None:
        self._handle.write(json.dumps(event, ensure_ascii=False) + "\n")
        self._handle.flush()

    def close(self) -> None:
        self._handle.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_event(
    event_type: str,
    *,
    window: Dict[str, Any],
    target: Dict[str, Any],
    cursor: Optional[Dict[str, int]] = None,
    timestamp: Optional[str] = None,
    screenshot_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    event: Dict[str, Any] = {
        "type": event_type,
        "timestamp": timestamp or now_iso(),
        "window": window,
        "target": target,
    }
    if cursor is not None:
        event["cursor"] = cursor
    if screenshot_path is not None:
        event["screenshot_path"] = screenshot_path
    if metadata is not None:
        event["metadata"] = metadata
    return event


def validate_event_schema(event: Dict[str, Any]) -> bool:
    return REQUIRED_KEYS.issubset(event.keys())
