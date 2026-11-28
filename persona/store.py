"""persona.sqlite: what PersonaOS has read, kept on this Mac only.

    messages   one row per message from any source, raw text included
    cursors    how far each source has been read

Raw text never leaves the Mac. Engines send Supabase only what they extract,
with one quoted source line.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

PERSONA_DIR = Path(
    os.environ.get("PERSONA_DIR")
    or Path.home() / "Library" / "Application Support" / "AcadKit" / "persona"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    source      TEXT NOT NULL,
    id          TEXT NOT NULL,
    chat        TEXT NOT NULL,
    sender      TEXT,
    sender_id   TEXT,
    ts          TEXT NOT NULL,
    text        TEXT NOT NULL,
    from_me     INTEGER NOT NULL DEFAULT 0,
    media_path  TEXT,
    PRIMARY KEY (source, id)
);
CREATE INDEX IF NOT EXISTS messages_ts ON messages (ts);
CREATE TABLE IF NOT EXISTS cursors (
    source  TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
"""

_COLUMNS = ("source", "id", "chat", "sender", "sender_id", "ts", "text", "from_me", "media_path")


def open_store(path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(path) if path else PERSONA_DIR / "persona.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_SCHEMA)
    return conn


def get_cursor(conn: sqlite3.Connection, source: str) -> str | None:
    row = conn.execute("SELECT value FROM cursors WHERE source = ?", (source,)).fetchone()
    return row["value"] if row else None


def set_cursor(conn: sqlite3.Connection, source: str, value: str) -> None:
    conn.execute(
        "INSERT INTO cursors (source, value) VALUES (?, ?)"
        " ON CONFLICT (source) DO UPDATE SET value = excluded.value",
        (source, value),
    )


def add_messages(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Insert rows not seen before; returns how many were new."""

    before = conn.total_changes
    conn.executemany(
        f"INSERT OR IGNORE INTO messages ({', '.join(_COLUMNS)})"
        f" VALUES ({', '.join('?' for _ in _COLUMNS)})",
        [tuple(r.get(c) for c in _COLUMNS) for r in rows],
    )
    return conn.total_changes - before
