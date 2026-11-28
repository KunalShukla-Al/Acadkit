"""The types the deadline engine passes between its stages."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import IntEnum

IST = timezone(timedelta(hours=5, minutes=30))


class Trust(IntEnum):
    """Who asserted a claim. Higher wins."""

    ME = 0          # my own message
    RELAY = 1       # a classmate, forwarding or guessing
    CR = 2          # the class representative
    FACULTY = 3     # faculty


@dataclass(frozen=True)
class Message:
    id: str
    chat: str
    sender: str
    ts: datetime          # UTC
    text: str


@dataclass(frozen=True)
class Claim:
    """One dated item a message asserts, before tracking merges claims."""

    kind: str             # exam, lab, worksheet, submission, viva, review, deadline
    course: str           # the course's code from the semester pack
    date: str | None      # ISO date, or None when the message gives none
    time: str | None      # HH:MM when the message gives one
    portion: str | None
    message: Message
    trust: Trust
    confidence: float
    by: str | None = None     # who said it, when the rank alone doesn't say ("a circular")

    @property
    def said_at(self) -> datetime:
        return self.message.ts


@dataclass
class Item:
    """One real deadline, carrying everything claimed about it."""

    course: str
    kind: str
    aliases: set[str] = field(default_factory=set)
    history: list[Claim] = field(default_factory=list)
    date: str | None = None
    time: str | None = None
    portion: str | None = None
    flags: list[str] = field(default_factory=list)
    winner: Claim | None = None
    question: str | None = None

    @property
    def label(self) -> str:
        for prefix in ("FT", "CT", "LLT", "CLA-T", "LLJ", "FJ"):
            hits = sorted(a for a in self.aliases if a.startswith(prefix + "-"))
            if hits:
                return hits[0]
        return sorted(self.aliases)[0] if self.aliases else self.kind.capitalize()
