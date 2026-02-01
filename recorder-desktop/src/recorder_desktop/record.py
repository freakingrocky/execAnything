from __future__ import annotations

import argparse
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from recorder_desktop.capture.screenshot import capture_screen
from recorder_desktop.recording import RecordingWriter, build_event, now_iso
from recorder_desktop.uia.snapshot import snapshot_from_cursor
from recorder_desktop.win32.hooks import start_listeners
from recorder_desktop.win32.windows import get_active_window_snapshot, get_cursor_position


def record_session(name: str, out_dir: Path, capture_screenshots: bool) -> Path:
    if os.name != "nt":
        raise RuntimeError("Desktop recorder is only supported on Windows")

    writer = RecordingWriter(out_dir, name)
    stop_event = threading.Event()

    def stop() -> None:
        stop_event.set()

    def write_event(event_type: str, cursor: Optional[Dict[str, int]], metadata: Optional[Dict[str, Any]] = None) -> None:
        window = get_active_window_snapshot() or {}
        target = snapshot_from_cursor(cursor["x"], cursor["y"]) if cursor else {"uia": {}, "ancestry": []}
        screenshot_path = None
        if capture_screenshots:
            filename = f"{event_type}_{now_iso().replace(':', '-')}.png"
            path = writer.screenshots_dir / filename
            capture_screen(path)
            screenshot_path = str(path.relative_to(writer.recording_dir))
        event = build_event(
            event_type,
            window=window,
            target=target,
            cursor=cursor,
            screenshot_path=screenshot_path,
            metadata=metadata,
        )
        writer.write_event(event)

    def on_click(x: int, y: int, button: str) -> None:
        write_event("click", {"x": x, "y": y}, {"button": button})

    def on_key(key: str) -> None:
        cursor = get_cursor_position()
        cursor_payload = {"x": cursor[0], "y": cursor[1]} if cursor else None
        if key == "Key.f9":
            write_event("inspect", cursor_payload, {"key": key})
        elif len(key) == 1:
            write_event("type", cursor_payload, {"text": key})
        else:
            write_event("keypress", cursor_payload, {"key": key})

    hooks = start_listeners(on_click, on_key, stop)

    try:
        cursor = get_cursor_position()
        cursor_payload = {"x": cursor[0], "y": cursor[1]} if cursor else None
        write_event("focus", cursor_payload)

        def wait_for_enter() -> None:
            input("Recording... press Enter to stop (or F8).\n")
            stop_event.set()

        threading.Thread(target=wait_for_enter, daemon=True).start()

        while not stop_event.is_set():
            time.sleep(0.2)

    finally:
        hooks.stop()
        writer.close()

    return writer.path


def main() -> None:
    parser = argparse.ArgumentParser(description="Record desktop interactions to JSONL.")
    parser.add_argument("--name", required=True, help="Recording name")
    parser.add_argument("--out", default="recordings", help="Output directory")
    parser.add_argument("--no-screenshots", action="store_true", help="Disable screenshot capture")
    args = parser.parse_args()

    output_path = record_session(args.name, Path(args.out), not args.no_screenshots)
    print(f"Recording saved to {output_path}")


if __name__ == "__main__":
    main()
