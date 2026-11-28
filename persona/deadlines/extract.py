"""Messages → claims, by rules: who said it, which course, what kind, and when.

The prefilter keeps only messages with an assessment word and a date cue,
generously, since a message dropped here is never seen again. The rules then
read one claim per message: the first course the pack's cues name, the
dominant kind, and the first date resolvable against the day it was sent.
A bare ordinal like "11th experiment" is not read as a date.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

from .model import IST, Claim, Message, Trust

_ASSESS = re.compile(
    r"\b(ft|ct|llt|llj|fj|cla|exam|test|quiz|viva|lab|worksheet|assignment"
    r"|submit|submission|due|deadline|portion|syllabus|review|imposition"
    r"|retest|assessment|practical|record|experiment|exercise)(?:s|zes)?\b",
    re.IGNORECASE,
)
_DATE_CUE = re.compile(
    r"(\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?"
    r"|\b\d{1,2}\s?(st|nd|rd|th)?\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)"
    r"|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}"
    r"|\b\d{1,2}(st|nd|rd|th)\b"
    r"|\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b"
    r"|\b(today|tomorrow|tmrw|tonight|next week|this week)\b)",
    re.IGNORECASE,
)


def is_candidate(text: str) -> bool:
    return bool(text and _ASSESS.search(text) and _DATE_CUE.search(text))


# --- who said it -------------------------------------------------------------

_TITLED = re.compile(r"^\s*(dr|prof|professor)\b\.?", re.IGNORECASE)
# A forwarded circular ("Dear Students, … CT 1 … is scheduled on …") speaks for the department.
_CIRCULAR = re.compile(r"^\W*dear\s+(students|all|coordinators|faculty|academic advisors|class advisors|parents)\b", re.IGNORECASE)


def is_circular(text: str) -> bool:
    return bool(_CIRCULAR.match(text))


@dataclass(frozen=True)
class Roles:
    """Faculty and CRs by contact name or WhatsApp id, from the semester pack."""

    faculty: frozenset[str] = frozenset()
    cr: frozenset[str] = frozenset()

    @classmethod
    def from_pack(cls, pack: dict) -> "Roles":
        wa = pack.get("whatsapp", {})
        norm = lambda xs: frozenset(x.strip().lower() for x in xs or [] if x.strip())  # noqa: E731
        return cls(norm(wa.get("faculty")), norm(wa.get("cr")))

    def trust(self, sender: str | None, sender_id: str | None = None) -> Trust:
        if sender == "me":
            return Trust.ME
        keys = {(sender or "").strip().lower(), (sender_id or "").strip().lower()} - {""}
        if keys & self.faculty or _TITLED.match(sender or ""):
            return Trust.FACULTY
        if keys & self.cr:
            return Trust.CR
        return Trust.RELAY


# --- which course ------------------------------------------------------------


@dataclass(frozen=True)
class Course:
    code: str
    cues: tuple[re.Pattern, ...]


_STOP = {"and", "of", "the", "for", "in", "to", "with", "on", "a", "an", "&"}
_ROMAN = {"i", "ii", "iii", "iv", "v", "vi"}


def initials(name: str) -> str:
    """The abbreviation students write for a course: "Data Structures and Algorithms" → "dsa".
    A title that opens with its own code ("UHV-II: Universal Human Values …") gives that code's letters."""

    name = (name or "").strip()
    lead = re.match(r"^([A-Z]{2,})(?:-[IVX]+)?\s*[:–-]", name)
    if lead:
        return lead.group(1).lower()
    head = re.split(r"[:–(]", name, maxsplit=1)[0]
    words = [w for w in re.findall(r"[A-Za-z]+", head) if w.lower() not in _STOP and w.lower() not in _ROMAN]
    return "".join(w[0] for w in words).lower()


def courses_from_pack(pack: dict) -> list[Course]:
    """Each course's cues: its code, its full name, its short name, the initials of its name, and any
    listed. Short cues are safe because a course only counts near an assessment word (course_of)."""

    out = []
    for c in pack.get("courses", []):
        words = [c["code"], c.get("name", ""), c.get("short") or "", initials(c.get("name", "")), *(c.get("cues") or [])]
        words = list(dict.fromkeys(w for w in words if len(w.strip()) >= 2))
        cues = tuple(re.compile(rf"(?<![a-z0-9]){re.escape(w.lower())}(?![a-z0-9])") for w in words)
        out.append(Course(c["code"], cues))
    return out


NEAR = 60


def course_of(text: str, courses: list[Course]) -> str | None:
    """The course named first within NEAR characters of an assessment word, so a long
    circular that mentions a course in passing isn't read as that course's deadline."""

    low = text.lower()
    words = [m.start() for m in _ASSESS.finditer(low)]
    hits = [
        (m.start(), c.code)
        for c in courses
        for cue in c.cues
        for m in cue.finditer(low)
        if any(abs(m.start() - w) <= NEAR for w in words)
    ]
    return min(hits)[1] if hits else None


# --- what kind ---------------------------------------------------------------

# Top to bottom: a retest is its own event, never the test it repeats; "lab" sits above "exam" so
# "FJ lab test" reads as lab work.
_KINDS = (
    ("retest", ("retest", "re-test", "re test")),
    ("worksheet", ("worksheet",)),
    ("review", ("review",)),
    ("viva", ("viva",)),
    ("lab", ("lab", "experiment", "exercise", "practical", "record", "llj")),
    ("submission", ("submit", "submission", "due", "assignment", "imposition")),
    ("exam", ("ft", "ct", "llt", "cla", "fj", "exam", "test", "quiz", "assessment")),
)


def kind_of(text: str) -> str:
    low = text.lower()
    for kind, cues in _KINDS:
        if any(re.search(rf"\b{re.escape(c)}\b", low) for c in cues):
            return kind
    return "deadline"


def portion_of(text: str) -> str | None:
    m = re.search(r"\bunits?\s+(?:[ivx]+|\d)(?:\s*(?:&|and|,|-|to)\s*(?:[ivx]+|\d))*", text, re.IGNORECASE)
    return m.group(0).strip() if m else None


# --- when --------------------------------------------------------------------

_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_WEEKDAYS = {d: i for i, d in enumerate(("mon", "tue", "wed", "thu", "fri", "sat", "sun"))}


def _assemble(d: int, mo: int, y: str | None, ref: date) -> str | None:
    """An ISO date, its year from the message's own day when missing. A December
    message naming January means next January."""

    year = int(y) + (2000 if y and int(y) < 100 else 0) if y else ref.year
    try:
        cand = date(year, mo, d)
    except ValueError:
        return None
    if not y and (cand - ref).days < -180:
        cand = date(year + 1, mo, d)
    return cand.isoformat()


def date_of(text: str, ref: date) -> tuple[str | None, float]:
    """(ISO date or None, confidence), relative forms read against `ref`."""

    low = text.lower()
    # Whole month words only: "mar" and "march", never the "mar" of "marks".
    mon = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b"
    found = []  # (position, iso, confidence): the date written first wins, whatever its form
    for m in re.finditer(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+{mon}\.?(?:\s*,?\s*(\d{{4}}|\d{{2}}(?!\d|:)))?", low):
        found.append((m.start(), _assemble(int(m.group(1)), _MONTHS[m.group(2)[:3]], m.group(3), ref), 0.9 if m.group(3) else 0.85))
    for m in re.finditer(rf"\b{mon}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{{4}}))?", low):
        found.append((m.start(), _assemble(int(m.group(2)), _MONTHS[m.group(1)[:3]], m.group(3), ref), 0.9 if m.group(3) else 0.85))
    for m in re.finditer(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b", low):
        d, mo = int(m.group(1)), int(m.group(2))
        if re.match(r"\s*(am|pm)\b", low[m.end():]) or not (1 <= mo <= 12 and 1 <= d <= 31):
            continue
        found.append((m.start(), _assemble(d, mo, m.group(3), ref), 0.9 if m.group(3) else 0.85))
    found = [f for f in found if f[1]]
    if found:
        _, iso, conf = min(found)
        return iso, conf
    # "on 11th" is the next 11th; "till 11th experiment" is a count, not a date.
    m = re.search(
        r"\b(?:on|by|till|before)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b"
        r"(?!\s*(?:experiment|exercise|program|question|chapter|unit|lab|week|class|sem|lecture))",
        low,
    )
    if m and 1 <= int(m.group(1)) <= 31:
        day, nxt = int(m.group(1)), ref
        for _ in range(62):
            if nxt.day == day:
                return nxt.isoformat(), 0.6
            nxt += timedelta(days=1)
    m = re.search(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b", low)
    if m:
        ahead = (_WEEKDAYS[m.group(1)[:3]] - ref.weekday()) % 7
        return (ref + timedelta(days=ahead)).isoformat(), 0.7
    if re.search(r"\b(today|tonight)\b", low):
        return ref.isoformat(), 0.7
    if re.search(r"\b(tomorrow|tmrw)\b", low):
        return (ref + timedelta(days=1)).isoformat(), 0.7
    return None, 0.4


def time_of(text: str) -> str | None:
    m = re.search(r"\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)\b", text.lower()) or re.search(r"\b(\d{1,2})[:](\d{2})\b", text)
    if not m:
        return None
    h, mins = int(m.group(1)), int(m.group(2) or 0)
    half = m.group(3) if m.lastindex and m.lastindex >= 3 else None
    if half == "pm" and h < 12:
        h += 12
    if half == "am" and h == 12:
        h = 0
    return f"{h:02d}:{mins:02d}" if h < 24 and mins < 60 else None


def extract(messages: list[Message], courses: list[Course], roles: Roles, ids: dict[str, str] | None = None) -> list[Claim]:
    """One claim per candidate message that names a course. `ids` maps a message id to its sender's WhatsApp id."""

    out = []
    for m in messages:
        if not is_candidate(m.text):
            continue
        course = course_of(m.text, courses)
        if course is None:
            continue
        day, conf = date_of(m.text, m.ts.astimezone(IST).date())
        out.append(Claim(
            kind=kind_of(m.text),
            course=course,
            date=day,
            time=time_of(m.text) if day else None,
            portion=portion_of(m.text),
            message=m,
            trust=Trust.FACULTY if is_circular(m.text) else roles.trust(m.sender, (ids or {}).get(m.id)),
            confidence=conf,
            by="a circular" if is_circular(m.text) else None,
        ))
    return out
