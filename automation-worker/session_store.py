"""In-memory session cache for browser profiles (per worker process)."""

from __future__ import annotations

import time
from typing import Any

_sessions: dict[int, dict[str, Any]] = {}


def update_session(profile_id: int, status: str, logged_in: bool, detail: str | None = None) -> None:
    _sessions[profile_id] = {
        "status": status,
        "loggedIn": logged_in,
        "detail": detail,
        "checkedAt": time.time(),
    }


def get_session(profile_id: int) -> dict[str, Any] | None:
    return _sessions.get(profile_id)


def clear_session(profile_id: int) -> None:
    _sessions.pop(profile_id, None)
