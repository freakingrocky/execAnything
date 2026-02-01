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


def test_handle_unknown_method_returns_jsonrpc_error():
    payload = {"jsonrpc": "2.0", "id": 99, "method": "nope.method", "params": {}}
    response = server.handle_request(payload)

    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 99
    assert "error" in response
    assert response["error"]["code"] == -32601


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


def test_handle_window_focus_returns_trace(monkeypatch):
    def fake_focus(scope):
        return {"title": "Notepad", "process_name": "notepad.exe"}

    monkeypatch.setattr(server, "focus_window", fake_focus)
    monkeypatch.setattr(server.os, "name", "nt")

    result = server.handle_window_focus(
        {"run_id": "run-1", "step_id": "step-1", "scope": {"window_title_contains": "Notepad"}}
    )

    assert result["trace"]["ok"] is True
    assert result["trace"]["run_id"] == "run-1"
    assert result["trace"]["step_id"] == "step-1"
    assert result["trace"]["started_at"]
    assert result["trace"]["ended_at"]
    assert result["window"]["title"] == "Notepad"


def test_handle_window_focus_error_includes_trace(monkeypatch):
    def fake_focus(scope):
        return None

    monkeypatch.setattr(server, "focus_window", fake_focus)
    monkeypatch.setattr(server.os, "name", "nt")

    response = server.handle_request(
        {
            "jsonrpc": "2.0",
            "id": 7,
            "method": "window.focus",
            "params": {"run_id": "run-2", "step_id": "step-2", "scope": {"window_title_contains": "Nope"}},
        }
    )

    assert response["error"]["code"] == 1000
    trace = response["error"]["data"]["trace"]
    assert trace["ok"] is False
    assert trace["error_code"] == 1000
    assert trace["run_id"] == "run-2"
    assert trace["step_id"] == "step-2"
