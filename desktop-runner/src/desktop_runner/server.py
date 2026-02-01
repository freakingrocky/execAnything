from __future__ import annotations

import importlib.util
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

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


def handle_focus(params: Dict[str, Any]) -> Dict[str, Any]:
    scope = params.get("scope")
    if not isinstance(scope, dict):
        raise JsonRpcError(ERROR_INVALID_PARAMS, "scope is required")

    if os.name != "nt":
        raise JsonRpcError(ERROR_SCOPE_NOT_FOUND, "Window scope not found")

    descriptor = focus_window(scope)
    if descriptor is None:
        raise JsonRpcError(ERROR_SCOPE_NOT_FOUND, "Window scope not found")
    return {"ok": True, "window": descriptor}


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
            "window.focus": handle_focus,
        }

        handler = handlers.get(method)
        if handler is None:
            raise JsonRpcError(ERROR_METHOD_NOT_FOUND, "Method not found")

        result = handler(params)
        return make_result_response(request_id, result)
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
