from pathlib import Path

from desktop_runner import server
from desktop_runner.runtime.run_state import clear_run_state, set_run_state


def test_handle_ping_returns_result():
    payload = {"jsonrpc": "2.0", "id": 1, "method": "system.ping", "params": {}}
    response = server.handle_request(payload)

    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 1
    assert response["result"]["ok"] is True
    assert response["result"]["service"] == "desktop-runner"


def test_handle_artifact_screenshot_returns_trace(tmp_path, monkeypatch):
    def fake_capture(name, base_dir=None, mode=None):
        path = Path(base_dir or tmp_path) / name
        path.write_text("fake", encoding="utf-8")
        return str(path)

    monkeypatch.setattr(server, "capture_screenshot", fake_capture)
    set_run_state("run-1", str(tmp_path))

    try:
        result = server.handle_artifact_screenshot(
            {"run_id": "run-1", "step_id": "step-1", "name": "shot.png", "mode": "screen"}
        )
    finally:
        clear_run_state("run-1")

    assert result["ok"] is True
    assert result["after_screenshot_path"].endswith("shot.png")
