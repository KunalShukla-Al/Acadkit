"""What the Desk's Ask can read about my class groups: recent messages as Markdown in the study folder.

    python3 -m persona.export   one run (the orchestrator's `export` job)

It writes <dir>/_src/_persona/messages.md for this semester's folder and
next semester's: the watched groups' last 120 days, a line per message,
grouped by group and day, newest last. Folders starting with "_" never sync,
so the file stays on the Mac. scripts/desk-ask.mjs tells Claude where it is.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from .env import environment
from .pack import _dirs
from .store import open_store

IST = timezone(timedelta(hours=5, minutes=30))
DAYS = 120


def markdown(rows: list[dict], now: datetime) -> str:
    out = [
        f"# Class group messages, last {DAYS} days",
        "",
        f"A read-only copy for the Desk's Ask, written {now.astimezone(IST):%d %b %Y %H:%M} by PersonaOS (persona/export.py). Newest last.",
    ]
    chat = day = None
    for r in rows:
        when = datetime.fromisoformat(r["ts"]).astimezone(IST)
        if r["chat"] != chat:
            chat, day = r["chat"], None
            out += ["", f"## {chat}"]
        if when.date() != day:
            day = when.date()
            out += ["", f"### {day:%a %d %b %Y}"]
        text = " ".join((r["text"] or "").split()) or "(a file)"
        out.append(f"- {when:%H:%M} {r['sender'] or 'someone'}: {text}")
    return "\n".join(out) + "\n"


def export(store, dirs: list[Path], now: datetime) -> str:
    rows = [dict(r) for r in store.execute(
        "SELECT chat, sender, ts, text FROM messages WHERE source = 'whatsapp' AND ts >= ? ORDER BY chat, ts",
        ((now - timedelta(days=DAYS)).isoformat(),),
    )]
    body = markdown(rows, now)
    for d in dirs:
        target = d / "_src" / "_persona" / "messages.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)
    return f"{len(rows)} messages for Ask in {len(dirs)} folder{'' if len(dirs) == 1 else 's'}"


def main() -> int:
    dirs = [d for d in _dirs(environment()) if d.exists()]
    print(export(open_store(), dirs, datetime.now(timezone.utc)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
