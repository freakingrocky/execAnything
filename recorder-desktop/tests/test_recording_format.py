import json

from recorder_desktop.recording import RecordingWriter, build_event, validate_event_schema


def test_recording_event_schema(tmp_path):
    writer = RecordingWriter(tmp_path, "sample")
    event = build_event(
        "click",
        window={"title": "Test", "process_name": "app.exe"},
        target={"uia": {"name": "Button"}, "ancestry": []},
        cursor={"x": 10, "y": 20},
        metadata={"button": "left"},
    )
    assert validate_event_schema(event)

    writer.write_event(event)
    writer.close()

    lines = writer.path.read_text(encoding="utf-8").strip().split("\n")
    payload = json.loads(lines[0])

    assert payload["type"] == "click"
    assert "window" in payload
    assert "target" in payload


def test_recording_event_schema_rejects_missing_required_fields():
    event = build_event(
        "click",
        window={"title": "Test", "process_name": "app.exe"},
        target={"uia": {"name": "Button"}, "ancestry": []},
        cursor={"x": 10, "y": 20},
        metadata={"button": "left"},
    )

    # Remove a required field to ensure validator is real
    event.pop("type", None)

    assert validate_event_schema(event) is False
