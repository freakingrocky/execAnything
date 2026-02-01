from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional


@dataclass
class RunState:
    run_id: str
    artifact_dir: Path


_RUN_STATE: Dict[str, RunState] = {}


def set_run_state(run_id: str, artifact_dir: str) -> RunState:
    state = RunState(run_id=run_id, artifact_dir=Path(artifact_dir))
    _RUN_STATE[run_id] = state
    return state


def get_run_state(run_id: str) -> Optional[RunState]:
    return _RUN_STATE.get(run_id)


def clear_run_state(run_id: str) -> None:
    _RUN_STATE.pop(run_id, None)
