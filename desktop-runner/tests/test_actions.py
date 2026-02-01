from desktop_runner.actions.click import click
from desktop_runner.actions.paste_text import paste_text
from desktop_runner.actions.set_value import set_value


class FakeAdapter:
    def __init__(self):
        self.clicked = None
        self.pasted = None
        self.set_values = None

    def click(self, element, button, clicks):
        self.clicked = (element, button, clicks)

    def paste_text(self, element, text):
        self.pasted = (element, text)

    def set_value(self, element, value):
        self.set_values = (element, value)


def test_action_click_invokes_adapter(monkeypatch):
    adapter = FakeAdapter()

    def fake_resolve(*_, **__):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Button"}}, [], "handle"

    monkeypatch.setattr("desktop_runner.actions.click.resolve_ladder", fake_resolve)

    result = click({"run_id": "run", "step_id": "step", "target": {"ladder": []}}, adapter=adapter)

    assert result["ok"] is True
    assert adapter.clicked == ("handle", "left", 1)


def test_action_paste_invokes_adapter(monkeypatch):
    adapter = FakeAdapter()

    def fake_resolve(*_, **__):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Edit"}}, [], "handle"

    monkeypatch.setattr("desktop_runner.actions.paste_text.resolve_ladder", fake_resolve)

    result = paste_text(
        {"run_id": "run", "step_id": "step", "target": {"ladder": []}, "text": "Hello"},
        adapter=adapter,
    )

    assert result["ok"] is True
    assert adapter.pasted == ("handle", "Hello")


def test_action_set_value_invokes_adapter(monkeypatch):
    adapter = FakeAdapter()

    def fake_resolve(*_, **__):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Edit"}}, [], "handle"

    monkeypatch.setattr("desktop_runner.actions.set_value.resolve_ladder", fake_resolve)

    result = set_value(
        {"run_id": "run", "step_id": "step", "target": {"ladder": []}, "value": "42"},
        adapter=adapter,
    )

    assert result["ok"] is True
    assert adapter.set_values == ("handle", "42")
