from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

from ..pack import load_pack, pack_path
from ..store import open_store
from .extract import Roles, courses_from_pack, extract
from .model import IST, Item, Message
from .output import write_suggestions
from .track import track
from .verify import adjudicate

WINDOW_DAYS = 120


def load_messages(conn: sqlite3.Connection, since: datetime) -> tuple[list[Message], dict[str, str]]:
    rows = conn.execute(
        "SELECT source, id, chat, sender, sender_id, ts, text FROM messages WHERE ts >= ? ORDER BY ts",
        (since.isoformat(),),
    ).fetchall()
    msgs, ids = [], {}
    for r in rows:
        key = f"{r['source']}:{r['id']}"
        msgs.append(Message(key, r["chat"], r["sender"] or "", datetime.fromisoformat(r["ts"]), r["text"] or ""))
        if r["sender_id"]:
            ids[key] = r["sender_id"]
    return msgs, ids


def items_now(conn: sqlite3.Connection, pack: dict, now: datetime) -> list[Item]:
    msgs, ids = load_messages(conn, now - timedelta(days=WINDOW_DAYS))
    claims = extract(msgs, courses_from_pack(pack), Roles.from_pack(pack), ids)
    return adjudicate(track(claims), now.astimezone(IST).date())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.deadlines")
    parser.add_argument("command", choices=["run", "show"])
    args = parser.parse_args(argv)
    pack = load_pack()
    if not pack["courses"]:
        print(f"no courses in the semester pack ({pack_path()})", file=sys.stderr)
        return 1
    items = items_now(open_store(), pack, datetime.now(timezone.utc))
    if args.command == "show":
        for it in sorted(items, key=lambda i: i.date or "9999"):
            flags = f" [{', '.join(it.flags)}]" if it.flags else ""
            print(f"{it.date or '????-??-??'}  {it.course} {it.label}{flags}  ({len(it.history)} claims)")
            if it.question:
                print(f"            ? {it.question}")
        return 0
    out = pack_path().parent / "persona_suggestions.json"
    n = write_suggestions(items, out)
    upcoming = sum(1 for it in items if it.date and "past" not in it.flags)
    asks = sum(1 for it in items if it.question)
    print(f"{n} suggested of {upcoming} upcoming; {asks} unsure")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
