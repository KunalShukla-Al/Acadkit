"""A small database shaped like WhatsApp's ChatStorage.sqlite, for tests.

It has only the tables and columns the collector reads. The names are
stand-ins: a faculty member, a class representative, a classmate.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

CF_EPOCH = 978307200


def cf(iso: str) -> float:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() - CF_EPOCH


def build(path: str, *, members: bool = True, media: bool = True) -> None:
    db = sqlite3.connect(path)
    db.executescript(
        f"""
        CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZPARTNERNAME TEXT);
        {"CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZCONTACTNAME TEXT, ZMEMBERJID TEXT);" if members else ""}
        {"CREATE TABLE ZWAMEDIAITEM (Z_PK INTEGER PRIMARY KEY, ZMEDIALOCALPATH TEXT);" if media else ""}
        CREATE TABLE ZWAMESSAGE (
            Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER,
            {"ZGROUPMEMBER INTEGER," if members else ""} {"ZMEDIAITEM INTEGER," if media else ""}
            ZMESSAGEDATE REAL, ZTEXT TEXT, ZISFROMME INTEGER, ZPUSHNAME TEXT);
        """
    )
    db.executemany(
        "INSERT INTO ZWACHATSESSION VALUES (?, ?)",
        [(1, "AS1 OFFICIAL"), (2, "AS1 unofficial"), (3, "Family")],
    )
    if members:
        db.executemany(
            "INSERT INTO ZWAGROUPMEMBER VALUES (?, ?, ?)",
            [(10, "Faculty A", "fa@s.whatsapp.net"), (11, "Class Rep", "cr@s.whatsapp.net"), (12, None, "mate@s.whatsapp.net")],
        )
    if media:
        db.execute("INSERT INTO ZWAMEDIAITEM VALUES (50, 'Media/AS1/notice.pdf')")
    rows = [
        # pk, chat, member, media, when, text, from_me, push name
        (100, 1, 10, None, "2026-10-13T04:30:00", "DAA FT-I on 27 Jan, Units 1 and 2.", 0, "Faculty A"),
        (101, 2, 12, None, "2026-10-25T10:00:00", "heard the DAA test moved to 28th? not sure", 0, "mate"),
        (102, 1, 11, 50, "2026-10-26T09:49:00", "", 0, "Class Rep"),
        (103, 1, None, None, "2026-10-26T12:16:00", "thank you ma'am", 1, None),
        (104, 1, None, None, "2026-10-26T12:17:00", "", 0, None),
        (105, 3, None, None, "2026-10-27T08:00:00", "dinner at 9", 0, "Mum"),
        (106, 1, 10, None, "2026-07-01T08:00:00", "an old message from July", 0, "Faculty A"),
    ]
    cols = ["Z_PK", "ZCHATSESSION"] + (["ZGROUPMEMBER"] if members else []) + (["ZMEDIAITEM"] if media else []) + [
        "ZMESSAGEDATE", "ZTEXT", "ZISFROMME", "ZPUSHNAME"]
    for pk, chat, member, item, when, text, me, push in rows:
        values = [pk, chat] + ([member] if members else []) + ([item] if media else []) + [cf(when), text, me, push]
        db.execute(f"INSERT INTO ZWAMESSAGE ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})", values)
    db.commit()
    db.close()


def add(path: str, pk: int, chat: int, when: str, text: str) -> None:
    db = sqlite3.connect(path)
    db.execute(
        "INSERT INTO ZWAMESSAGE (Z_PK, ZCHATSESSION, ZMESSAGEDATE, ZTEXT, ZISFROMME) VALUES (?, ?, ?, ?, 0)",
        (pk, chat, cf(when), text),
    )
    db.commit()
    db.close()
