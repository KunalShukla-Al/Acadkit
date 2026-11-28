"""The deadline engine's score: a day-by-day replay of stored messages against AcadKit's own deadlines.

Truth is what AcadKit holds, the deadlines I confirmed, with their courses
from AcadKit's subjects, so every Sem 3 course counts even after its study
folder is gone. Each day from the first message to the last, the engine sees
only the messages sent by then. The report gives:

  recall      truth deadlines in the window the engine ends with the right date for
  precision   engine items with a date that match a truth deadline
  lead        days between first having the right date and the deadline itself
  baseline    the same items dated by the latest message alone, ignoring who said it

Only deadlines due within the messages' window count, and only the watched
groups were read, so recall measures what those groups carried.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .extract import Course, Roles, extract
from .model import IST, Item, Message
from .track import track
from .verify import adjudicate


@dataclass(frozen=True)
class Truth:
    code: str
    day: str          # ISO date, India time
    title: str


def courses_from_subjects(subjects: list[dict]) -> list[dict]:
    """AcadKit subjects as pack courses: code, short name and full name as cues."""

    return [
        {"code": s["code"], "short": s.get("short_name") or "", "name": s.get("name") or "", "cues": []}
        for s in subjects
        if s.get("code")
    ]


def truths(deadlines: list[dict], subjects: list[dict]) -> list[Truth]:
    codes = {s["id"]: s.get("code") for s in subjects}
    out = []
    for d in deadlines:
        code = codes.get(d.get("subject_id"))
        if code and d.get("due_date"):
            day = datetime.fromisoformat(d["due_date"].replace("Z", "+00:00")).astimezone(IST).date().isoformat()
            out.append(Truth(code, day, d.get("title") or ""))
    return out


def _latest_wins(item: Item) -> str | None:
    dated = [c for c in item.history if c.date]
    return max(dated, key=lambda c: c.said_at).date if dated else None


def _hits(items: list[Item], truth: list[Truth], dated_by=lambda it: it.date) -> set[Truth]:
    have = {(it.course, dated_by(it)) for it in items if dated_by(it)}
    return {t for t in truth if (t.code, t.day) in have}


def replay(messages: list[Message], courses: list[Course], roles: Roles, truth: list[Truth],
           ids: dict[str, str] | None = None) -> dict:
    if not messages:
        return {"messages": 0}
    msgs = sorted(messages, key=lambda m: m.ts)
    first = msgs[0].ts.astimezone(IST).date()
    last = msgs[-1].ts.astimezone(IST).date()
    window = [t for t in truth if first.isoformat() <= t.day <= (last + timedelta(days=60)).isoformat()]

    first_right: dict[Truth, date] = {}
    day = first
    while day <= last:
        cutoff = datetime(day.year, day.month, day.day, tzinfo=IST) + timedelta(days=1)
        seen = [m for m in msgs if m.ts < cutoff]
        items = adjudicate(track(extract(seen, courses, roles, ids)), day)
        for t in _hits(items, window):
            first_right.setdefault(t, day)
        day += timedelta(days=1)

    final = adjudicate(track(extract(msgs, courses, roles, ids)), last)
    dated = [it for it in final if it.date]
    found = _hits(final, window)
    matched = [it for it in dated if any(t.code == it.course and t.day == it.date for t in window)]
    base_found = _hits(final, window, dated_by=_latest_wins)
    leads = [(date.fromisoformat(t.day) - first_right[t]).days for t in found if t in first_right]
    return {
        "messages": len(msgs),
        "from": first.isoformat(),
        "to": last.isoformat(),
        "truth": len(window),
        "found": len(found),
        "recall": round(len(found) / len(window), 3) if window else None,
        "items": len(dated),
        "matched": len(matched),
        "precision": round(len(matched) / len(dated), 3) if dated else None,
        "lead_days_median": statistics.median(leads) if leads else None,
        "baseline_found": len(base_found),
        "missed": sorted(f"{t.day} {t.code} {t.title}" for t in window if t not in found),
        "unmatched": sorted(f"{it.date} {it.course} {it.label}" for it in dated if it not in matched),
    }


def report(r: dict) -> str:
    if not r.get("messages"):
        return "no messages to replay"
    pct = lambda x: "n/a" if x is None else f"{x:.0%}"  # noqa: E731
    lines = [
        f"Replayed {r['messages']} messages, {r['from']} to {r['to']}, day by day.",
        f"Recall: {r['found']} of {r['truth']} AcadKit deadlines in the window ({pct(r['recall'])}).",
        f"Precision: {r['matched']} of {r['items']} dated items match a deadline ({pct(r['precision'])}).",
        f"Lead: right date a median {r['lead_days_median']} days before the deadline." if r["lead_days_median"] is not None else "Lead: n/a.",
        f"Baseline (latest message wins): {r['baseline_found']} of {r['truth']}; ranked by who said it: {r['found']}.",
    ]
    if r["missed"]:
        lines.append("Missed: " + "; ".join(r["missed"][:12]) + (" …" if len(r["missed"]) > 12 else ""))
    if r["unmatched"]:
        lines.append("Not in AcadKit: " + "; ".join(r["unmatched"][:12]) + (" …" if len(r["unmatched"]) > 12 else ""))
    return "\n".join(lines)
