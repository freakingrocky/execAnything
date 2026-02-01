import pytest

from desktop_runner.assertions.check import check_assertions
from desktop_runner.errors import AssertionFailed


class FakeAdapter:
    def __init__(self):
        self.visible = True
        self.value = "Hello world"

    def is_visible(self, element):
        return self.visible

    def get_value(self, element):
        return self.value

    def get_focused_control_type(self):
        return "Edit"


def test_assert_check_passes_for_value_contains(monkeypatch):
    adapter = FakeAdapter()

    def fake_resolve(target, **_):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Edit"}}, [], "element-handle"

    monkeypatch.setattr("desktop_runner.assertions.check.resolve_ladder", fake_resolve)
    monkeypatch.setattr(
        "desktop_runner.assertions.check.get_active_window_descriptor",
        lambda: {"title": "Notepad", "class": "Notepad", "process_name": "notepad.exe"},
    )

    result = check_assertions(
        {
            "run_id": "run_1",
            "step_id": "step_1",
            "assertions": [
                {"kind": "desktop_window_active", "target": {"scope": {"window_title_contains": "Notepad"}}},
                {"kind": "desktop_value_contains", "target": {"ladder": []}, "value": "Hello"},
            ],
        },
        adapter=adapter,
    )

    assert result["ok"] is True
    assert result["failed"] == []


def test_assert_check_fails_for_visibility(monkeypatch):
    adapter = FakeAdapter()
    adapter.visible = False

    def fake_resolve(target, **_):
        return {"rung_index": 0, "kind": "uia", "element": {"name": "Edit"}}, [], "element-handle"

    monkeypatch.setattr("desktop_runner.assertions.check.resolve_ladder", fake_resolve)

    with pytest.raises(AssertionFailed) as exc:
        check_assertions(
            {
                "run_id": "run_1",
                "step_id": "step_2",
                "assertions": [
                    {"kind": "desktop_element_visible", "target": {"ladder": []}},
                ],
            },
            adapter=adapter,
        )

    assert exc.value.code == 1004
    trace = exc.value.data["trace"]
    assert trace["error_code"] == 1004
    assert trace["failed"][0]["kind"] == "desktop_element_visible"
