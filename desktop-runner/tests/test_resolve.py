from desktop_runner.errors import AmbiguousMatch, ElementNotFound
from desktop_runner.selector.resolve import resolve_ladder


class FakeAdapter:
    def __init__(self, matches):
        self.matches = matches

    def get_scope_root(self, scope):
        return "root"

    def find_uia(self, root, selector):
        return self.matches.get(selector.get("id"), [])

    def find_uia_near_label(self, root, selector):
        return []

    def describe(self, element):
        return {"name": element}


def test_resolve_ladder_returns_first_match():
    adapter = FakeAdapter(matches={"primary": ["element-1"]})
    target = {
        "ladder": [
            {"kind": "uia", "selector": {"id": "primary"}, "confidence": 0.9},
            {"kind": "uia", "selector": {"id": "secondary"}, "confidence": 0.5},
        ]
    }

    resolved, attempts, element = resolve_ladder(target, adapter=adapter, return_element=True)

    assert resolved["rung_index"] == 0
    assert resolved["element"]["name"] == "element-1"
    assert attempts[0]["matched_count"] == 1
    assert element == "element-1"


def test_resolve_ladder_raises_on_ambiguous():
    adapter = FakeAdapter(matches={"primary": ["a", "b"]})
    target = {"ladder": [{"kind": "uia", "selector": {"id": "primary"}, "confidence": 0.9}]}

    try:
        resolve_ladder(target, adapter=adapter)
    except AmbiguousMatch as exc:
        assert exc.code == 1002
    else:
        raise AssertionError("Expected AmbiguousMatch")


def test_resolve_ladder_raises_on_not_found():
    adapter = FakeAdapter(matches={})
    target = {"ladder": [{"kind": "uia", "selector": {"id": "primary"}, "confidence": 0.9}]}

    try:
        resolve_ladder(target, adapter=adapter)
    except ElementNotFound as exc:
        assert exc.code == 1001
    else:
        raise AssertionError("Expected ElementNotFound")
