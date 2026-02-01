from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class DesktopRunnerError(Exception):
    code: int
    message: str
    data: Optional[Dict[str, Any]] = None


class ScopeNotFound(DesktopRunnerError):
    def __init__(self, message: str = "Window scope not found") -> None:
        super().__init__(1000, message)


class ElementNotFound(DesktopRunnerError):
    def __init__(self, message: str = "No match for selector ladder", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1001, message, data)


class AmbiguousMatch(DesktopRunnerError):
    def __init__(self, message: str = "Ambiguous match for selector rung", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1002, message, data)


class ActionFailed(DesktopRunnerError):
    def __init__(self, message: str = "Action failed", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1003, message, data)


class AssertionFailed(DesktopRunnerError):
    def __init__(self, message: str = "Assertion failed", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1004, message, data)


class TimeoutError(DesktopRunnerError):
    def __init__(self, message: str = "Operation timed out", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1005, message, data)


class OcrUnavailable(DesktopRunnerError):
    def __init__(self, message: str = "OCR requested but unavailable", data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(1006, message, data)
