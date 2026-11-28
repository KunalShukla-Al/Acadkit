"""Items → <STUDY_DIR>/_src/persona_suggestions.json, the study sync's suggestions format.

The sync reads it beside the weekly scan's acadkit_suggestions.json and offers
each deadline in the app: Add, or Move when `moved_from` names its old date.
Only upcoming, dated items go out, and only when faculty or the CR said so, or
a classmate stated a full date plainly and nothing disputes it.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .model import IST, Item, Trust
from .verify import WHO, moved_from

_TYPE = {"exam": "exam", "retest": "exam", "lab": "lab", "submission": "assignment", "worksheet": "assignment",
         "viva": "other", "review": "other", "deadline": "other"}


def worth_suggesting(item: Item) -> bool:
    if not item.date or not item.winner or "past" in item.flags:
        return False
    if item.winner.trust >= Trust.CR:
        return True
    return item.question is None and item.winner.confidence >= 0.85 and "?" not in item.winner.message.text


def suggestion(item: Item) -> dict:
    w = item.winner
    at = f"T{item.time or '09:00'}:00+05:30"
    old = moved_from(item)
    return {
        "subject_code": item.course,
        "type": _TYPE.get(item.kind, "other"),
        "label": item.label,
        "due_date": item.date + at,
        "max_marks": None,
        "moved_from": old + at if old else None,
        "source": f"WhatsApp · {w.message.chat} · {w.by or WHO[w.trust]} · {w.said_at.astimezone(IST):%d %b}",
        "evidence": w.message.text.strip()[:200],
    }


def write_suggestions(items: list[Item], path: Path) -> int:
    rows = [suggestion(it) for it in items if worth_suggesting(it)]
    rows.sort(key=lambda r: r["due_date"])
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"version": 1, "by": "persona.deadlines", "deadlines": rows}, ensure_ascii=False, indent=1))
    tmp.replace(path)
    return len(rows)
