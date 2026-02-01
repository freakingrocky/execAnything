from desktop_runner.actions.extract import get_value


class FakeAdapter:
    def get_value(self, element):
        return "extracted"


def test_extract_returns_value_and_trace(monkeypatch):
    adapter = FakeAdapter()

    def fake_resolve(*_, **__):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Edit"}}, [], "handle"

    monkeypatch.setattr("desktop_runner.actions.extract.resolve_ladder", fake_resolve)

    result = get_value(
        {"run_id": "run", "step_id": "step", "target": {"ladder": []}},
        adapter=adapter,
    )

    assert result["ok"] is True
    assert result["value"] == "extracted"
