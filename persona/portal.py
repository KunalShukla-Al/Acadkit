"""The portals' reader: attendance and marks from the Student Portal, timetable and calendar from Academia.

PersonaOS never logs in to either. I log in myself in Chrome on the Mac;
scripts/mac/portal-read.sh then has scripts/mac/portal-read.js fetch the
pages through my own session, in the background, and hands them here:

    python3 -m persona.portal ingest raw.json   → persona/portal/state.json, the semester pack, signals

Tables are found by their header text, never by position in the page, as
AcadKit's own paste parser does (src/lib/portal/parse.ts).

  Student Portal attendance   Code · Description · Max. hours · Att. hours · Absent hours · Total Percentage
  Student Portal marks        Code · Description · Mark / Max. Mark
  Academia timetable          Course Code · Course Title · Credit · … · Faculty Name · Slot · Room No.
  Academia planner            per month: Dt · Day · <Mon 'YY> · DO
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

from .env import environment
from .pack import pack_path
from .signals import write_recent
from .store import PERSONA_DIR, add_signals, open_store

IST = timezone(timedelta(hours=5, minutes=30))
STATE = PERSONA_DIR / "portal" / "state.json"
MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


# --- pages to tables ----------------------------------------------------------

def _js_unescape(s: str) -> str:
    simple = {"n": "\n", "t": "\t", "r": "\r"}

    def one(m: re.Match) -> str:
        e = m.group(1)
        if e[0] in "xu" and len(e) > 1:
            return chr(int(e[1:], 16))
        return simple.get(e, e)

    return re.sub(r"\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)", one, s, flags=re.S)


def decode(page: str) -> str:
    """The page's HTML: unwrapped from Academia's pageSanitizer.sanitize('…') or its entity-escaped form."""

    m = re.search(r"pageSanitizer\.sanitize\('(.*?)'\)\s*;", page, re.S)
    if m:
        page = _js_unescape(m.group(1))
    if "&lt;table" in page.lower():
        page = html.unescape(page)
    return page


class _Tables(HTMLParser):
    """Every table as rows of cell text. Cells and rows close themselves when the next one starts,
    as browsers close them (the portals leave many </td> and </tr> out); a nested table's text also
    counts toward its parent's cell."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self.stack: list[dict] = []

    @staticmethod
    def _close_cell(t: dict) -> None:
        if t["cell"] is not None:
            if t["row"] is None:
                t["row"] = []
            t["row"].append(" ".join("".join(t["cell"]).split()))
            t["cell"] = None

    def _close_row(self, t: dict) -> None:
        self._close_cell(t)
        if t["row"] is not None:
            t["rows"].append(t["row"])
            t["row"] = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.stack.append({"rows": [], "row": None, "cell": None})
        elif not self.stack:
            return
        elif tag == "tr":
            self._close_row(self.stack[-1])
            self.stack[-1]["row"] = []
        elif tag in ("td", "th"):
            self._close_cell(self.stack[-1])
            if self.stack[-1]["row"] is None:
                self.stack[-1]["row"] = []
            self.stack[-1]["cell"] = []
        elif tag == "br" and self.stack[-1]["cell"] is not None:
            self.stack[-1]["cell"].append(" ")

    def handle_endtag(self, tag):
        if not self.stack:
            return
        t = self.stack[-1]
        if tag in ("td", "th"):
            self._close_cell(t)
        elif tag == "tr":
            self._close_row(t)
        elif tag == "table":
            self._close_row(t)
            self.tables.append(self.stack.pop()["rows"])

    def handle_data(self, data):
        for t in self.stack:
            if t["cell"] is not None:
                t["cell"].append(data)

    def close(self):
        super().close()
        while self.stack:
            t = self.stack.pop()
            self._close_row(t)
            self.tables.append(t["rows"])


def tables(page: str) -> list[list[list[str]]]:
    p = _Tables()
    p.feed(decode(page))
    p.close()
    return [t for t in p.tables if len(t) > 1]


def _find(page: str, *needles: str) -> tuple[list[str], list[list[str]]] | None:
    """The first table whose header row holds every needle (case-insensitive): (header, body rows)."""

    for t in tables(page):
        for i, row in enumerate(t[:3]):
            low = [c.lower() for c in row]
            if all(any(n in c for c in low) for n in needles):
                return low, t[i + 1:]
    return None


def _col(header: list[str], *names: str) -> int | None:
    for n in names:
        for i, c in enumerate(header):
            if c == n or c.startswith(n):
                return i
    return None


def _num(s: str) -> float | None:
    m = re.search(r"-?\d+(?:\.\d+)?", s or "")
    return float(m.group(0)) if m else None


def _held(session: dict) -> str | None:
    """How long a session lasted, as "4 h 50 min", for the logout alert."""

    if not session.get("in") or not session.get("out"):
        return None
    mins = round((datetime.fromisoformat(session["out"]) - datetime.fromisoformat(session["in"])).total_seconds() / 60)
    h, m = divmod(max(mins, 0), 60)
    return (f"{h} h " if h else "") + f"{m} min held" if (h or m) else None


_CODE = re.compile(r"^\d{2}[A-Z]{3}\d{3}[A-Z]$")


# --- the four pages -------------------------------------------------------------

def attendance(page: str) -> list[dict]:
    found = _find(page, "code", "max. hours", "absent")
    if not found:
        return []
    h, rows = found
    c, d, mx, at, ab, pc = (_col(h, "code"), _col(h, "description"), _col(h, "max. hours"), _col(h, "att. hours"),
                            _col(h, "absent"), _col(h, "total percentage", "percentage"))
    out = []
    for r in rows:
        if c is None or c >= len(r) or not _CODE.match(r[c]):
            continue
        conducted, absent = _num(r[mx]), _num(r[ab])
        if conducted is None or absent is None:
            continue
        out.append({
            "code": r[c],
            "title": r[d] if d is not None and d < len(r) else "",
            "conducted": int(conducted),
            "attended": int(_num(r[at]) or conducted - absent) if at is not None and at < len(r) else int(conducted - absent),
            "absent": int(absent),
            "percentage": _num(r[pc]) if pc is not None and pc < len(r) else None,
        })
    return out


def marks(page: str) -> list[dict]:
    found = _find(page, "code", "mark / max")
    if not found:
        return []
    h, rows = found
    c, d, m = _col(h, "code"), _col(h, "description"), _col(h, "mark / max")
    out = []
    for r in rows:
        if c is None or c >= len(r) or not _CODE.match(r[c]) or m is None or m >= len(r):
            continue
        got = re.match(r"\s*(-?\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", r[m])
        if got:
            out.append({"code": r[c], "title": r[d] if d is not None and d < len(r) else "",
                        "mark": float(got.group(1)), "max": float(got.group(2))})
    return out


def courses(page: str) -> list[dict]:
    found = _find(page, "course code", "faculty name")
    if not found:
        return []
    h, rows = found
    col = {k: _col(h, k) for k in ("course code", "course title", "credit", "course type", "faculty name", "slot", "room no")}
    out = []
    for r in rows:
        get = lambda k: r[col[k]] if col[k] is not None and col[k] < len(r) else ""  # noqa: E731
        if not _CODE.match(get("course code")):
            continue
        out.append({
            "code": get("course code"),
            "name": get("course title"),
            "credits": _num(get("credit")),
            "type": get("course type"),
            "faculty": re.sub(r"\s*\(\d+\)\s*$", "", get("faculty name")).strip(),
            "slot": get("slot"),
            "room": get("room no"),
        })
    return out


def planner(page: str) -> dict[str, dict]:
    """{ISO date: {"do": day order or None, "event": text}} from a planner's month grid."""

    out: dict[str, dict] = {}
    for t in tables(page):
        head = t[0]
        months = []
        for i, cell in enumerate(head):
            m = re.match(r"^([A-Za-z]{3})\w*\s*['’`]\s*(\d{2})$", cell.strip())
            if m and m.group(1).lower() in MONTHS:
                months.append((i, MONTHS[m.group(1).lower()], 2000 + int(m.group(2))))
        if not months:
            continue
        for row in t[1:]:
            for i, month, year in months:
                if i + 1 >= len(row) or i < 2:
                    continue
                day = _num(row[i - 2])
                if day is None:
                    continue
                try:
                    when = date(year, month, int(day))
                except ValueError:
                    continue
                do = _num(row[i + 1])
                out[when.isoformat()] = {"do": int(do) if do is not None else None, "event": row[i]}
    return out


# --- ingest -------------------------------------------------------------------

def _update_pack(path: Path, found: list[dict], calendar: dict[str, dict]) -> bool:
    """Add the timetable's courses and faculty, and the planner's days, to this semester's pack."""

    if not path.parent.exists() or not (found or calendar):
        return False
    try:
        pack = json.loads(path.read_text())
    except FileNotFoundError:
        pack = {"version": 1}
    # A course with a lab has a row per component, each with its own faculty and slot.
    merged: dict[str, dict] = {}
    for c in found:
        m = merged.setdefault(c["code"], {"name": c["name"], "faculty": [], "slots": []})
        if c["faculty"] and c["faculty"] not in m["faculty"]:
            m["faculty"].append(c["faculty"])
        if c["slot"] and c["slot"] not in m["slots"]:
            m["slots"].append(c["slot"])
    have = {c["code"]: c for c in pack.setdefault("courses", [])}
    for code, m in merged.items():
        mine = have.get(code)
        if mine is None:
            mine = {"code": code, "name": m["name"], "cues": []}
            pack["courses"].append(mine)
        mine.update({"faculty": m["faculty"], "slots": m["slots"]})
        mine.pop("slot", None)
    wa = pack.setdefault("whatsapp", {})
    faculty = wa.setdefault("faculty", [])
    for m in merged.values():
        faculty += [f for f in m["faculty"] if f not in faculty]
    if calendar:
        pack.setdefault("calendar", {}).update(calendar)
    path.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n")
    return True


def ingest(raw: dict, store, state_file: Path = STATE, pack_file: Path | None = None, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    prev = json.loads(state_file.read_text()) if state_file.exists() else {}
    state = {"at": now.isoformat(), "portal": prev.get("portal", {}), "academia": prev.get("academia", {})}
    notes, signals = [], []
    p = raw.get("portal") or {}
    prev = state["portal"]
    sessions = list(prev.get("sessions", []))
    was_in = prev.get("read_at") is not None and not prev.get("login", True)
    if p.get("attendance"):
        rows = attendance(p["attendance"])
        got = marks(p.get("marks") or "")
        old = {m["code"]: m for m in prev.get("marks", [])}
        for m in got:
            was = old.get(m["code"])
            if was and was["mark"] != m["mark"]:
                signals.append({"source": "portal", "id": f"marks:{m['code']}:{m['mark']}", "kind": "marks",
                                "title": f"{m['title'].title() or m['code']}: {m['mark']:g} / {m['max']:g} (was {was['mark']:g})", "at": now.isoformat()})
        if not was_in:                                   # a fresh login: a new session begins
            sessions = (sessions + [{"in": now.isoformat(), "out": None}])[-20:]
        state["portal"] = {"read_at": now.isoformat(), "attendance": rows, "marks": got or prev.get("marks", []),
                           "login": False, "logout_at": None, "sessions": sessions}
        notes.append(f"portal: {len(rows)} subjects")
    elif p.get("login") or p.get("tab") is False:
        logout_at = prev.get("logout_at")
        if was_in:                                       # the session just ended: close it and note when
            logout_at = now.isoformat()
            if sessions and sessions[-1].get("out") is None:
                sessions[-1]["out"] = logout_at
            held = _held(sessions[-1]) if sessions else None
            signals.append({"source": "portal", "id": f"logout:{logout_at[:16]}", "kind": "login",
                            "title": f"Student Portal logged out at {now.astimezone(IST):%H:%M}"
                                     + (f" ({held})" if held else "") + ". Log in on the Mac and leave the tab open.",
                            "at": now.isoformat()})
        state["portal"] = {**prev, "login": True, "logout_at": logout_at, "sessions": sessions}
        notes.append("portal: logged out" if p.get("login") else "portal: no tab open")
    elif p.get("error"):
        notes.append(f"portal: {p['error'][:120]}")
    a = raw.get("academia") or {}
    if a.get("timetable") or a.get("planners"):
        found = courses(a.get("timetable") or "")
        calendar: dict[str, dict] = {}
        for pl in a.get("planners") or []:
            calendar.update(planner(pl.get("html") or ""))
        state["academia"] = {"read_at": now.isoformat(), "courses": found, "days": len(calendar)}
        if _update_pack(pack_file or pack_path(environment()), found, calendar):
            notes.append(f"academia: {len(found)} courses, {len(calendar)} days")
    elif a.get("login") or a.get("tab") is False:
        notes.append("academia: waiting for you to log in" if a.get("login") else "academia: no tab open")
    elif a.get("error"):
        notes.append(f"academia: {a['error'][:120]}")
    if signals:
        add_signals(store, signals)
        store.commit()
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    return "; ".join(notes) or "nothing read"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.portal")
    parser.add_argument("command", choices=["ingest"])
    parser.add_argument("raw")
    args = parser.parse_args(argv)
    try:
        raw = json.loads(Path(args.raw).read_text() or "{}")
    except ValueError as err:
        print(f"the portal read gave no JSON: {err}", file=sys.stderr)
        return 1
    if raw.get("error"):
        print(raw["error"], file=sys.stderr)
        return 1
    store = open_store()
    print(ingest(raw, store))
    write_recent(store)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
