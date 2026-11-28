"""The semester pack: what PersonaOS needs to know about this semester.

It lives at <STUDY_DIR>/_src/semester.json, beside the study pipelines, and
moves with the folder at each semester switch. A pack in STUDY_NEXT_DIR is
read too, so next semester's courses are known before the switch:

    {
      "version": 1,
      "courses": [{"code": "21CSC204J", "short": "DAA", "name": "Design and Analysis of Algorithms", "cues": ["algo"]}],
      "whatsapp": {"groups": ["AS1 OFFICIAL"], "faculty": ["<contact name or id>"], "cr": ["<contact name or id>"]}
    }

PERSONA_WHATSAPP_GROUPS (comma-separated) overrides the groups.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .env import environment


def _dirs(env: dict) -> list[Path]:
    here = Path(os.path.expanduser(env.get("STUDY_DIR") or "~/Documents/SRM_Sem3"))
    nxt = (env.get("STUDY_NEXT_DIR") or "").strip()
    dirs = [here]
    if nxt and Path(os.path.expanduser(nxt)).resolve() != here.resolve():
        dirs.append(Path(os.path.expanduser(nxt)))
    return dirs


def pack_path(env: dict | None = None) -> Path:
    return _dirs(environment() if env is None else env)[0] / "_src" / "semester.json"


def load_pack(env: dict | None = None) -> dict:
    """This semester's pack merged with next semester's: courses added, WhatsApp lists joined."""

    env = environment() if env is None else env
    merged: dict = {"courses": [], "whatsapp": {"groups": [], "faculty": [], "cr": []}}
    for d in _dirs(env):
        try:
            pack = json.loads((d / "_src" / "semester.json").read_text())
        except FileNotFoundError:
            continue
        codes = {c["code"] for c in merged["courses"]}
        merged["courses"] += [c for c in pack.get("courses", []) if c["code"] not in codes]
        for key in ("groups", "faculty", "cr"):
            for x in pack.get("whatsapp", {}).get(key, []):
                if x not in merged["whatsapp"][key]:
                    merged["whatsapp"][key].append(x)
    return merged


def watched_groups(env: dict | None = None) -> list[str]:
    env = environment() if env is None else env
    override = env.get("PERSONA_WHATSAPP_GROUPS", "").strip()
    if override:
        return [g.strip() for g in override.split(",") if g.strip()]
    return load_pack(env)["whatsapp"]["groups"]
