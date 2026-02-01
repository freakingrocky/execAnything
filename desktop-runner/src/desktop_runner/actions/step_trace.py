from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from desktop_runner.artifacts.screenshots import capture_screenshot
from desktop_runner.runtime.run_state import get_run_state


@dataclass
class StepTraceBuilder:
    run_id: str
    step_id: str
    started_at: str = field(default_factory=lambda: _now_iso())
    ended_at: Optional[str] = None
    ok: bool = False
    match_attempts: List[Dict[str, Any]] = field(default_factory=list)
    resolved: Optional[Dict[str, Any]] = None
    before_screenshot_path: Optional[str] = None
    after_screenshot_path: Optional[str] = None
    error: Optional[str] = None

    def capture_before(self, enabled: bool) -> None:
        if not enabled:
            return
        self.before_screenshot_path = self._capture("before")

    def capture_after(self, enabled: bool) -> None:
        if not enabled:
            return
        self.after_screenshot_path = self._capture("after")

    def _capture(self, suffix: str) -> str:
        state = get_run_state(self.run_id)
        base_dir = state.artifact_dir if state else None
        filename = f"{self.step_id}_{suffix}.png"
        return capture_screenshot(filename, base_dir=base_dir, mode="active_window")

    def finish(self) -> Dict[str, Any]:
        self.ended_at = self.ended_at or _now_iso()
        payload: Dict[str, Any] = {
            "run_id": self.run_id,
            "step_id": self.step_id,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "ok": self.ok,
            "match_attempts": self.match_attempts,
        }
        if self.resolved is not None:
            payload["resolved"] = self.resolved
        if self.before_screenshot_path:
            payload["before_screenshot_path"] = self.before_screenshot_path
        if self.after_screenshot_path:
            payload["after_screenshot_path"] = self.after_screenshot_path
        if self.error:
            payload["error"] = self.error
        return payload


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
