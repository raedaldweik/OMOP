"""Lightweight in-memory + JSON-backed query audit log."""
from __future__ import annotations
import json
import os
import threading
from typing import Any

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                        "data", "query_log.json")
LOG_PATH = os.path.abspath(LOG_PATH)
_LOCK = threading.Lock()


def _load() -> list[dict[str, Any]]:
    if not os.path.exists(LOG_PATH):
        return []
    try:
        with open(LOG_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return []


def _save(entries: list[dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as fh:
        json.dump(entries[-500:], fh, indent=2)  # keep last 500


def append(entry: dict[str, Any]) -> None:
    with _LOCK:
        entries = _load()
        entries.append(entry)
        _save(entries)


def all_entries() -> list[dict[str, Any]]:
    with _LOCK:
        return list(reversed(_load()))


def clear() -> None:
    with _LOCK:
        _save([])
