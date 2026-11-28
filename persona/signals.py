"""The last day's signals from every source, as persona/signals.json for the morning brief (phone.mjs)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from .store import PERSONA_DIR


def write_recent(store, now: datetime | None = None) -> None:
    since = ((now or datetime.now(timezone.utc)) - timedelta(days=1)).isoformat()
    rows = [dict(r) for r in store.execute(
        "SELECT source, kind, title, who, at FROM signals WHERE at >= ? ORDER BY at", (since,))]
    PERSONA_DIR.mkdir(parents=True, exist_ok=True)
    (PERSONA_DIR / "signals.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
