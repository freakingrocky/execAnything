from __future__ import annotations

from desktop_runner.actions.paste_text import paste_text
from desktop_runner.assertions.check import check_assertions
from desktop_runner.runtime.run_state import set_run_state
from desktop_runner.server import focus_window


def main() -> None:
    run_id = "manual_notepad"
    set_run_state(run_id, "artifacts/manual_notepad")

    scope = {"window_title_contains": "Notepad"}
    focused = focus_window(scope)
    if focused is None:
        raise SystemExit("Notepad window not found. Open Notepad before running this script.")

    target = {
        "scope": scope,
        "ladder": [
            {
                "kind": "uia",
                "confidence": 1.0,
                "selector": {"controlType": "Edit"},
            }
        ],
    }

    paste_text(
        {
            "run_id": run_id,
            "step_id": "paste_text",
            "target": target,
            "text": "Codex manual test",
            "capture_screenshots": True,
        }
    )

    check_assertions(
        {
            "run_id": run_id,
            "step_id": "assert_value",
            "assertions": [
                {"kind": "desktop_value_contains", "target": target, "value": "Codex manual test"}
            ],
        }
    )

    print("Manual Notepad test succeeded.")


if __name__ == "__main__":
    main()
