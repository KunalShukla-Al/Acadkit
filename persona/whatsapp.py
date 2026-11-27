"""The WhatsApp collector: new messages from watched groups, read from the Mac app's database.

The database is opened read-only, one short query per group, so WhatsApp's
file is never written. Each group keeps its own cursor (the last row read),
so a group added to the pack later is read back PERSONA_WHATSAPP_DAYS (60)
days on its first run.

    python3 -m persona.whatsapp collect   one run (the orchestrator's `whatsapp` job)
    python3 -m persona.whatsapp chats     group names and message counts, to fill the pack
    python3 -m persona.whatsapp schema    the tables and columns found, no message content

Reading it needs Full Disk Access, which the launch agent's bash holds.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .pack import watched_groups
from .store import add_messages, get_cursor, open_store, set_cursor

LIVE_DB = (
    Path.home()
    / "Library"
    / "Group Containers"
    / "group.net.whatsapp.WhatsApp.shared"
    / "ChatStorage.sqlite"
)

# WhatsApp stores time as CFAbsoluteTime: seconds since 2001-01-01 UTC.
CF_EPOCH = 978307200

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


def open_live(path: Path = LIVE_DB) -> sqlite3.Connection:
    # macOS privacy (TCC) lets a process see the file but not open it without Full Disk Access.
    try:
        with open(path, "rb"):
            pass
    except PermissionError:
        raise PermissionError("can't read WhatsApp's database: this process needs Full Disk Access") from None
    except FileNotFoundError:
        raise FileNotFoundError(f"no WhatsApp database at {path}; is the Mac app installed?") from None
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")
    return conn


def columns(conn: sqlite3.Connection) -> dict[str, set[str]]:
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    return {t: {r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')} for t in tables}


def check(found: dict[str, set[str]]) -> None:
    missing = [
        f"{table}.{col}"
        for table, cols in REQUIRED.items()
        for col in sorted(cols - found.get(table, set()))
    ]
    if missing:
        raise SchemaChanged("WhatsApp's database changed; missing " + ", ".join(missing))


def _query(found: dict[str, set[str]]) -> str:
    """The read for one group, using NULL for any optional column this version lacks."""

    def has(table: str, col: str) -> bool:
        return col in found.get(table, set())

    members = has("ZWAMESSAGE", "ZGROUPMEMBER") and has("ZWAGROUPMEMBER", "Z_PK")
    media = has("ZWAMESSAGE", "ZMEDIAITEM") and has("ZWAMEDIAITEM", "Z_PK")
    name = [
        "gm.ZCONTACTNAME" if members and has("ZWAGROUPMEMBER", "ZCONTACTNAME") else None,
        "m.ZPUSHNAME" if has("ZWAMESSAGE", "ZPUSHNAME") else None,
        "gm.ZMEMBERJID" if members and has("ZWAGROUPMEMBER", "ZMEMBERJID") else None,
        "m.ZFROMJID" if has("ZWAMESSAGE", "ZFROMJID") else None,
    ]
    jid = [name[2], name[3]]

    def coalesce(parts: list[str | None]) -> str:
        present = [p for p in parts if p]
        return f"COALESCE({', '.join(present)}, NULL)" if present else "NULL"

    return f"""
        SELECT m.Z_PK AS pk, m.ZMESSAGEDATE AS ts, m.ZTEXT AS text, m.ZISFROMME AS from_me,
               {coalesce(name)} AS sender, {coalesce(jid)} AS sender_id,
               {"mi.ZMEDIALOCALPATH" if media and has("ZWAMEDIAITEM", "ZMEDIALOCALPATH") else "NULL"} AS media_path
        FROM ZWAMESSAGE m
        JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION
        {"LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER" if members else ""}
        {"LEFT JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM" if media else ""}
        WHERE lower(trim(s.ZPARTNERNAME)) = lower(trim(?)) AND m.Z_PK > ? AND m.ZMESSAGEDATE >= ?
        ORDER BY m.Z_PK
    """


def _iso(cf: float | None) -> str:
    return datetime.fromtimestamp((cf or 0) + CF_EPOCH, timezone.utc).isoformat()


def collect(live: sqlite3.Connection, store: sqlite3.Connection, groups: list[str], now: datetime, days: int = 60) -> str:
    """Add each watched group's new messages to the store; returns the run's note."""

    if not groups:
        return "no groups to watch: add whatsapp.groups to the semester pack"
    found = columns(live)
    check(found)
    sql = _query(found)
    since = (now - timedelta(days=days)).timestamp() - CF_EPOCH
    names = {r[0].strip().lower() for r in live.execute("SELECT ZPARTNERNAME FROM ZWACHATSESSION") if r[0]}
    new = 0
    unknown = []
    for group in groups:
        if group.strip().lower() not in names:
            unknown.append(group)
            continue
        key = f"whatsapp:{group.strip().lower()}"
        after = int(get_cursor(store, key) or 0)
        # Row numbers don't follow message dates (synced history lands late), so a
        # first run moves the cursor past every row it saw, read or too old.
        top = live.execute(
            "SELECT MAX(m.Z_PK) FROM ZWAMESSAGE m JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION"
            " WHERE lower(trim(s.ZPARTNERNAME)) = lower(trim(?))",
            (group,),
        ).fetchone()[0]
        rows = live.execute(sql, (group, after, since if after == 0 else -1e12)).fetchall()
        kept = [
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
            for r in rows
            if (r["text"] or "").strip() or r["media_path"]
        ]
        new += add_messages(store, kept)
        last = max([after, top or 0] + [r["pk"] for r in rows])
        if last > after:
            set_cursor(store, key, str(last))
    store.commit()
    note = f"{new} new message{'' if new == 1 else 's'} from {len(groups) - len(unknown)} group{'' if len(groups) - len(unknown) == 1 else 's'}"
    if unknown:
        note += f"; no chat named {', '.join(unknown)}"
    return note


def chats(live: sqlite3.Connection) -> list[tuple[str, int]]:
    rows = live.execute(
        "SELECT s.ZPARTNERNAME AS name, COUNT(m.Z_PK) AS n FROM ZWACHATSESSION s"
        " LEFT JOIN ZWAMESSAGE m ON m.ZCHATSESSION = s.Z_PK GROUP BY s.Z_PK ORDER BY n DESC"
    ).fetchall()
    return [(r["name"] or "(unnamed)", r["n"]) for r in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.whatsapp")
    parser.add_argument("command", choices=["collect", "chats", "schema"])
    args = parser.parse_args(argv)
    try:
        live = open_live()
        if args.command == "schema":
            found = columns(live)
            for table in sorted(set(REQUIRED) | set(OPTIONAL)):
                want = REQUIRED.get(table, set()) | OPTIONAL.get(table, set())
                gone = sorted(want - found.get(table, set()))
                print(f"{table}: {len(found.get(table, set()))} columns" + (f", missing {', '.join(gone)}" if gone else ""))
        elif args.command == "chats":
            for name, n in chats(live):
                print(f"{n:>7}  {name}")
        else:
            days = int(os.environ.get("PERSONA_WHATSAPP_DAYS") or 60)
            print(collect(live, open_store(), watched_groups(), datetime.now(timezone.utc), days))
        return 0
    except (PermissionError, FileNotFoundError, SchemaChanged, sqlite3.Error) as err:
        print(str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
