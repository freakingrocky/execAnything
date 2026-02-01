from __future__ import annotations

import importlib.util
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from desktop_runner.actions.click import click
from desktop_runner.actions.extract import get_value
from desktop_runner.actions.paste_text import paste_text
from desktop_runner.actions.set_value import set_value
from desktop_runner.actions.step_trace import StepTraceBuilder
from desktop_runner.assertions.check import check_assertions
from desktop_runner.errors import ActionFailed, DesktopRunnerError, ScopeNotFound
from desktop_runner.runtime.run_state import clear_run_state, get_run_state, set_run_state
from desktop_runner.selector.resolve import resolve_ladder
from desktop_runner.artifacts.screenshots import capture_screenshot

JSONRPC_VERSION = "2.0"
SERVICE_NAME = "desktop-runner"
SERVICE_VERSION = "0.1"

ERROR_PARSE = -32700
ERROR_INVALID_REQUEST = -32600
ERROR_METHOD_NOT_FOUND = -32601
ERROR_INVALID_PARAMS = -32602
ERROR_INTERNAL = -32603

ERROR_SCOPE_NOT_FOUND = 1000


@dataclass
class JsonRpcError(Exception):
    code: int
    message: str
    data: Optional[Dict[str, Any]] = None


def make_error_response(request_id: Any, error: JsonRpcError) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "error": {
            "code": error.code,
            "message": error.message,
        },
    }
    if error.data is not None:
        payload["error"]["data"] = error.data
    return payload


def make_result_response(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "result": result,
    }


def validate_request(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise JsonRpcError(ERROR_INVALID_REQUEST, "Invalid request")
    if payload.get("jsonrpc") != JSONRPC_VERSION:
        raise JsonRpcError(ERROR_INVALID_REQUEST, "Invalid JSON-RPC version")
    if "method" not in payload:
        raise JsonRpcError(ERROR_INVALID_REQUEST, "Missing method")
    if "id" not in payload:
        raise JsonRpcError(ERROR_INVALID_REQUEST, "Missing id")
    return payload


def handle_ping(_: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "service": SERVICE_NAME, "version": SERVICE_VERSION}


def handle_capabilities(_: Dict[str, Any]) -> Dict[str, Any]:
    windows_ocr = importlib.util.find_spec("winrt") is not None
    tesseract = importlib.util.find_spec("pytesseract") is not None
    return {
        "uia": True,
        "ocr": {"windows_ocr": windows_ocr, "tesseract": tesseract},
        "screenshots": True,
    }


def handle_window_focus(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = params.get("run_id")
    step_id = params.get("step_id")
    if not isinstance(run_id, str) or not isinstance(step_id, str):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "run_id and step_id are required")

    scope = params.get("scope")
    if not isinstance(scope, dict):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "scope is required")

    trace = StepTraceBuilder(run_id=run_id, step_id=step_id)
    try:
        if os.name != "nt":
            raise ScopeNotFound()

        descriptor = focus_window(scope)
        if descriptor is None:
            raise ScopeNotFound()
        trace.ok = True
        return {"trace": trace.finish(), "window": descriptor}
    except DesktopRunnerError as exc:
        trace.error = exc.message
        trace.error_code = exc.code
        exc.data = exc.data or {}
        exc.data["trace"] = trace.finish()
        raise
    except Exception as exc:
        trace.error = str(exc)
        trace.error_code = ActionFailed().code
        raise ActionFailed(data={"trace": trace.finish()}) from exc


def handle_run_begin(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = params.get("run_id")
    artifact_dir = params.get("artifact_dir")
    if not isinstance(run_id, str) or not isinstance(artifact_dir, str):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "run_id and artifact_dir are required")
    set_run_state(run_id, artifact_dir)
    return {"ok": True}


def handle_run_end(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = params.get("run_id")
    if not isinstance(run_id, str):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "run_id is required")
    clear_run_state(run_id)
    return {"ok": True}


def handle_target_resolve(params: Dict[str, Any]) -> Dict[str, Any]:
    target = params.get("target")
    if not isinstance(target, dict):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "target is required")
    resolved, match_attempts, _ = resolve_ladder(
        target,
        retry=params.get("retry"),
        timeout_ms=params.get("timeout_ms"),
    )
    return {"resolved": resolved, "match_attempts": match_attempts}


def handle_action_click(params: Dict[str, Any]) -> Dict[str, Any]:
    return click(params)


def handle_action_paste(params: Dict[str, Any]) -> Dict[str, Any]:
    return paste_text(params)


def handle_action_set_value(params: Dict[str, Any]) -> Dict[str, Any]:
    return set_value(params)


def handle_assert_check(params: Dict[str, Any]) -> Dict[str, Any]:
    return check_assertions(params)


def handle_extract_value(params: Dict[str, Any]) -> Dict[str, Any]:
    return get_value(params)


def handle_artifact_screenshot(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = params.get("run_id")
    step_id = params.get("step_id")
    name = params.get("name")
    mode = params.get("mode", "active_window")
    if not isinstance(run_id, str) or not isinstance(step_id, str) or not isinstance(name, str):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "run_id, step_id, and name are required")
    state = get_run_state(run_id)
    base_dir = state.artifact_dir if state else None
    trace = StepTraceBuilder(run_id=run_id, step_id=step_id)
    try:
        path = capture_screenshot(name, base_dir=base_dir, mode=mode)
        trace.after_screenshot_path = path
        trace.ok = True
        return trace.finish()
    except DesktopRunnerError as exc:
        trace.error = exc.message
        trace.error_code = exc.code
        exc.data = exc.data or {}
        exc.data["trace"] = trace.finish()
        raise
    except Exception as exc:
        trace.error = str(exc)
        trace.error_code = ActionFailed().code
        raise ActionFailed(data={"trace": trace.finish()}) from exc


def handle_request(payload: Any) -> Optional[Dict[str, Any]]:
    request_id = None
    try:
        data = validate_request(payload)
        request_id = data.get("id")
        method = data.get("method")
        params = data.get("params") or {}
        if not isinstance(params, dict):
            raise JsonRpcError(ERROR_INVALID_PARAMS, "params must be an object")

        handlers: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
            "system.ping": handle_ping,
            "system.getCapabilities": handle_capabilities,
            "run.begin": handle_run_begin,
            "run.end": handle_run_end,
            "window.focus": handle_window_focus,
            "target.resolve": handle_target_resolve,
            "action.click": handle_action_click,
            "action.pasteText": handle_action_paste,
            "action.setValue": handle_action_set_value,
            "assert.check": handle_assert_check,
            "extract.getValue": handle_extract_value,
            "artifact.screenshot": handle_artifact_screenshot,
        }

        handler = handlers.get(method)
        if handler is None:
            raise JsonRpcError(ERROR_METHOD_NOT_FOUND, "Method not found")

        result = handler(params)
        return make_result_response(request_id, result)
    except DesktopRunnerError as exc:
        return make_error_response(request_id, JsonRpcError(exc.code, exc.message, exc.data))
    except JsonRpcError as exc:
        return make_error_response(request_id, exc)
    except Exception as exc:  # pragma: no cover - last resort
        return make_error_response(request_id, JsonRpcError(ERROR_INTERNAL, str(exc)))


def serve() -> None:
    for line in sys.stdin:
        message = line.strip()
        if not message:
            continue
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            response = make_error_response(None, JsonRpcError(ERROR_PARSE, "Parse error"))
            write_response(response)
            continue

        response = handle_request(payload)
        if response is not None:
            write_response(response)


def write_response(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def focus_window(scope: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)

    EnumWindows = user32.EnumWindows
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    GetWindowText = user32.GetWindowTextW
    GetWindowTextLength = user32.GetWindowTextLengthW
    GetClassName = user32.GetClassNameW
    GetWindowThreadProcessId = user32.GetWindowThreadProcessId
    SetForegroundWindow = user32.SetForegroundWindow
    ShowWindow = user32.ShowWindow

    OpenProcess = ctypes.WinDLL("kernel32", use_last_error=True).OpenProcess
    CloseHandle = ctypes.WinDLL("kernel32", use_last_error=True).CloseHandle
    GetModuleBaseName = psapi.GetModuleBaseNameW

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    SW_SHOW = 5

    title_contains = scope.get("window_title_contains")
    class_name = scope.get("window_class")
    process_name = scope.get("process_name")

    matches: list[Dict[str, Any]] = []

    def enum_proc(hwnd: int, _: int) -> bool:
        length = GetWindowTextLength(hwnd)
        buffer = ctypes.create_unicode_buffer(length + 1)
        GetWindowText(hwnd, buffer, length + 1)
        title = buffer.value

        class_buffer = ctypes.create_unicode_buffer(256)
        GetClassName(hwnd, class_buffer, 256)
        window_class_name = class_buffer.value

        pid = wintypes.DWORD()
        GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

        exe_name = None
        if process_name:
            process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
            if process_handle:
                name_buffer = ctypes.create_unicode_buffer(260)
                GetModuleBaseName(process_handle, None, name_buffer, 260)
                exe_name = name_buffer.value
                CloseHandle(process_handle)

        if title_contains and title_contains.lower() not in title.lower():
            return True
        if class_name and class_name.lower() != window_class_name.lower():
            return True
        if process_name and exe_name and process_name.lower() not in exe_name.lower():
            return True
        if process_name and exe_name is None:
            return True

        matches.append(
            {
                "hwnd": int(hwnd),
                "title": title,
                "class": window_class_name,
                "process_id": int(pid.value),
                "process_name": exe_name,
            }
        )
        return True

    EnumWindows(EnumWindowsProc(enum_proc), 0)

    if not matches:
        return None

    window = matches[0]
    ShowWindow(window["hwnd"], SW_SHOW)
    SetForegroundWindow(window["hwnd"])
    return window


if __name__ == "__main__":
    serve()
