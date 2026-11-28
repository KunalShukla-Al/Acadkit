"""The semester pack: what PersonaOS needs to know about this semester.

It lives at <STUDY_DIR>/_src/semester.json, beside the study pipelines, and
moves with the folder at each semester switch. The semester engine will fill
courses, units, timetable and calendar; today it holds the chats to watch:

    {"version": 1, "whatsapp": {"groups": ["AS1 OFFICIAL", "AS1 unofficial"]}}

PERSONA_WHATSAPP_GROUPS (comma-separated) overrides the pack's groups.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .env import environment


def pack_path(env: dict | None = None) -> Path:
    env = environment() if env is None else env
    study = Path(os.path.expanduser(env.get("STUDY_DIR") or "~/Documents/SRM_Sem3"))
    return study / "_src" / "semester.json"


def load_pack(env: dict | None = None) -> dict:
    try:
        return json.loads(pack_path(env).read_text())
    except FileNotFoundError:
        return {}


def watched_groups(env: dict | None = None) -> list[str]:
    env = environment() if env is None else env
    override = env.get("PERSONA_WHATSAPP_GROUPS", "").strip()
    if override:
        return [g.strip() for g in override.split(",") if g.strip()]
    return list(load_pack(env).get("whatsapp", {}).get("groups", []))
