from desktop_runner import server


def test_handle_ping_returns_result():
    payload = {"jsonrpc": "2.0", "id": 1, "method": "system.ping", "params": {}}
    response = server.handle_request(payload)

    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 1
    assert response["result"]["ok"] is True
    assert response["result"]["service"] == "desktop-runner"
