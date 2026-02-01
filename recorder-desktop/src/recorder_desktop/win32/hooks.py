from __future__ import annotations

import os
from typing import Callable, Optional, Tuple


class HookHandle:
    def __init__(self, mouse_listener, keyboard_listener) -> None:
        self._mouse_listener = mouse_listener
        self._keyboard_listener = keyboard_listener

    def stop(self) -> None:
        if self._mouse_listener:
            self._mouse_listener.stop()
        if self._keyboard_listener:
            self._keyboard_listener.stop()


OnClick = Callable[[int, int, str], None]
OnKey = Callable[[str], None]
OnStop = Callable[[], None]


def start_listeners(on_click: Optional[OnClick], on_key: Optional[OnKey], on_stop: Optional[OnStop]) -> HookHandle:
    if os.name != "nt":
        raise RuntimeError("Hooks are only supported on Windows")

    from pynput import keyboard, mouse

    def handle_click(x: int, y: int, button: mouse.Button, pressed: bool) -> None:
        if not pressed:
            return
        if on_click:
            on_click(int(x), int(y), str(button))

    def handle_key(key: keyboard.Key | keyboard.KeyCode) -> None:
        if key == keyboard.Key.f8:
            if on_stop:
                on_stop()
            return
        if on_key:
            try:
                on_key(key.char if hasattr(key, "char") and key.char else str(key))
            except Exception:
                on_key(str(key))

    mouse_listener = mouse.Listener(on_click=handle_click)
    keyboard_listener = keyboard.Listener(on_press=handle_key)

    mouse_listener.start()
    keyboard_listener.start()

    return HookHandle(mouse_listener, keyboard_listener)
