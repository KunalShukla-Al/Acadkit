"""The WhatsApp collector: new messages from watched groups, read from the Mac app's database.

macOS lets the launch agent's bash, and Apple's tools it starts, read
WhatsApp's database under Full Disk Access, but not node or python. So the
read is split, and only Apple's sqlite3 ever opens WhatsApp's file, read-only:

    scripts/mac/whatsapp-read.sh (run by the agent's bash every 10 min)
      /usr/bin/sqlite3 -readonly -json  SCHEMA_SQL   → schema.json
      python3 -m persona.whatsapp plan schema.json   → query.sql   (checks columns, reads cursors)
      /usr/bin/sqlite3 -readonly -json < query.sql   → rows.json
      python3 -m persona.whatsapp ingest rows.json   → persona.sqlite + status.json

Each group keeps its own cursor (the last row read), so a group added to the
pack later is read back PERSONA_WHATSAPP_DAYS (60) days on its first run.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .pack import watched_groups
from .store import PERSONA_DIR, add_messages, get_cursor, open_store, set_cursor

STATE = PERSONA_DIR / "whatsapp"

# WhatsApp stores time as CFAbsoluteTime: seconds since 2001-01-01 UTC.
CF_EPOCH = 978307200

SCHEMA_SQL = (
    "SELECT m.name AS t, p.name AS c FROM sqlite_master m JOIN pragma_table_info(m.name) p"
    " WHERE m.type = 'table' AND m.name LIKE 'ZWA%'"
)

REQUIRED = {
    "ZWAMESSAGE": {"Z_PK", "ZCHATSESSION", "ZMESSAGEDATE", "ZTEXT", "ZISFROMME"},
    "ZWACHATSESSION": {"Z_PK", "ZPARTNERNAME"},
}
OPTIONAL = {
    "ZWAMESSAGE": {"ZGROUPMEMBER", "ZMEDIAITEM", "ZPUSHNAME", "ZFROMJID"},
    "ZWAGROUPMEMBER": {"Z_PK", "ZCONTACTNAME", "ZMEMBERJID"},
    "ZWAMEDIAITEM": {"Z_PK", "ZMEDIALOCALPATH"},
}


class SchemaChanged(Exception):
    """WhatsApp's tables no longer have the columns the collector reads."""


def columns_of(rows: list[dict]) -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for r in rows:
        found.setdefault(r["t"], set()).add(r["c"])
    return found


def check(found: dict[str, set[str]]) -> None:
    missing = [
        f"{table}.{col}"
        for table, cols in REQUIRED.items()
        for col in sorted(cols - found.get(table, set()))
    ]
    if missing:
        raise SchemaChanged("WhatsApp's database changed; missing " + ", ".join(missing))


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def plan(found: dict[str, set[str]], store: sqlite3.Connection, groups: list[str], now: datetime, days: int = 60) -> str:
    """One read-only query for every watched group's new rows, plus each group's top row and chat count.

    Columns: kind ('msg' or 'top'), grp, pk, n, ts, text, from_me, sender, sender_id, media_path.
    NULL stands in for any optional column this WhatsApp version lacks.
    """

    check(found)

    def has(table: str, col: str) -> bool:
        return col in found.get(table, set())

    members = has("ZWAMESSAGE", "ZGROUPMEMBER") and has("ZWAGROUPMEMBER", "Z_PK")
    media = has("ZWAMESSAGE", "ZMEDIAITEM") and has("ZWAMEDIAITEM", "Z_PK")
    contact = "gm.ZCONTACTNAME" if members and has("ZWAGROUPMEMBER", "ZCONTACTNAME") else None
    push = "m.ZPUSHNAME" if has("ZWAMESSAGE", "ZPUSHNAME") else None
    member_jid = "gm.ZMEMBERJID" if members and has("ZWAGROUPMEMBER", "ZMEMBERJID") else None
    from_jid = "m.ZFROMJID" if has("ZWAMESSAGE", "ZFROMJID") else None

    def coalesce(*parts: str | None) -> str:
        present = [p for p in parts if p]
        return f"COALESCE({', '.join(present)}, NULL)" if present else "NULL"

    joins = " ".join([
        "JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION",
        "LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER" if members else "",
        "LEFT JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM" if media else "",
    ])
    path = "mi.ZMEDIALOCALPATH" if media and has("ZWAMEDIAITEM", "ZMEDIALOCALPATH") else "NULL"
    since = (now - timedelta(days=days)).timestamp() - CF_EPOCH
    parts = []
    for group in groups:
        g = _lit(group)
        match = f"lower(trim(s.ZPARTNERNAME)) = lower(trim({g}))"
        after = int(get_cursor(store, _key(group)) or 0)
        floor = since if after == 0 else -1e12
        parts.append(
            f"SELECT 'msg' AS kind, {g} AS grp, m.Z_PK AS pk, NULL AS n, m.ZMESSAGEDATE AS ts, m.ZTEXT AS text,"
            f" m.ZISFROMME AS from_me, {coalesce(contact, push, member_jid, from_jid)} AS sender,"
            f" {coalesce(member_jid, from_jid)} AS sender_id, {path} AS media_path"
            f" FROM ZWAMESSAGE m {joins} WHERE {match} AND m.Z_PK > {after} AND m.ZMESSAGEDATE >= {floor}"
        )
        parts.append(
            f"SELECT 'top', {g}, (SELECT MAX(m.Z_PK) FROM ZWAMESSAGE m JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION WHERE {match}),"
            f" (SELECT COUNT(*) FROM ZWACHATSESSION s WHERE {match}), NULL, NULL, NULL, NULL, NULL, NULL"
        )
    return " UNION ALL ".join(parts) + " ORDER BY 2, 1, 3;" if parts else ""


def _key(group: str) -> str:
    return f"whatsapp:{group.strip().lower()}"


def _iso(cf: float | None) -> str:
    return datetime.fromtimestamp((cf or 0) + CF_EPOCH, timezone.utc).isoformat()


def ingest(rows: list[dict], store: sqlite3.Connection, groups: list[str]) -> str:
    """Store the planned query's rows and move each group's cursor; returns the run's note."""

    if not groups:
        return "no groups to watch: add whatsapp.groups to the semester pack"
    by_group: dict[str, list[dict]] = {g: [] for g in groups}
    top: dict[str, dict] = {}
    for r in rows:
        if r["kind"] == "top":
            top[r["grp"]] = r
        else:
            by_group.setdefault(r["grp"], []).append(r)
    new, unknown = 0, []
    for group in groups:
        if not (top.get(group) or {}).get("n"):
            unknown.append(group)
            continue
        msgs = by_group.get(group, [])
        new += add_messages(store, [
            {
                "source": "whatsapp",
                "id": str(r["pk"]),
                "chat": group,
                "sender": "me" if r["from_me"] else r["sender"],
                "sender_id": r["sender_id"],
                "ts": _iso(r["ts"]),
                "text": r["text"] or "",
                "from_me": int(bool(r["from_me"])),
                "media_path": r["media_path"],
            }
            for r in msgs
            if (r["text"] or "").strip() or r["media_path"]
        ])
        # Row numbers don't follow message dates (synced history lands late), so the
        # cursor moves past every row seen, read or too old.
        after = int(get_cursor(store, _key(group)) or 0)
        last = max([after, top[group]["pk"] or 0] + [r["pk"] for r in msgs])
        if last > after:
            set_cursor(store, _key(group), str(last))
    store.commit()
    read = len(groups) - len(unknown)
    note = f"{new} new message{'' if new == 1 else 's'} from {read} group{'' if read == 1 else 's'}"
    if unknown:
        note += f"; no chat named {', '.join(unknown)}"
    return note


def collect(conn: sqlite3.Connection, store: sqlite3.Connection, groups: list[str], now: datetime, days: int = 60) -> str:
    """Plan, read and ingest in one process, through an open connection (tests, or a database this process may read)."""

    if not groups:
        return ingest([], store, groups)
    conn.row_factory = sqlite3.Row
    found = columns_of([dict(r) for r in conn.execute(SCHEMA_SQL)])
    rows = [dict(r) for r in conn.execute(plan(found, store, groups, now, days))]
    return ingest(rows, store, groups)


def write_status(ok: bool, note: str, state: Path = STATE) -> None:
    state.mkdir(parents=True, exist_ok=True)
    (state / "status.json").write_text(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "ok": ok, "note": note}))


def _read_json(path: str) -> list[dict]:
    text = Path(path).read_text().strip()
    return json.loads(text) if text else []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.whatsapp")
    parser.add_argument("command", choices=["schema-sql", "plan", "ingest"])
    parser.add_argument("file", nargs="?")
    args = parser.parse_args(argv)
    if args.command == "schema-sql":
        print(SCHEMA_SQL)
        return 0
    groups = watched_groups()
    try:
        store = open_store()
        if args.command == "plan":
            days = int(os.environ.get("PERSONA_WHATSAPP_DAYS") or 60)
            print(plan(columns_of(_read_json(args.file)), store, groups, datetime.now(timezone.utc), days))
        else:
            note = ingest(_read_json(args.file), store, groups)
            write_status(True, note)
            print(note)
        return 0
    except (SchemaChanged, ValueError, KeyError, sqlite3.Error) as err:
        write_status(False, str(err))
        print(str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
