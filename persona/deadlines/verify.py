"""Pick each item's date, then flag what deserves a second look.

The date comes from the highest-ranked source (faculty, CR, a classmate, me)
and, within a rank, the latest said. Losing claims stay in the history. Flags:

  moved      the winning rank itself gave more than one date over time
  conflict   another claim disagrees with the chosen date
  stale      still upcoming, but nothing has confirmed it for `stale_days`
  past       the date has gone by

An item is unsure, and gets a question to ask, when it has no date or when a
disagreement has no faculty backing. A past item never asks.
"""

from __future__ import annotations

from datetime import date

from .model import Claim, Item, Trust

WHO = {Trust.FACULTY: "faculty", Trust.CR: "the CR", Trust.RELAY: "a classmate", Trust.ME: "me"}


def _rank(c: Claim):
    return (int(c.trust), c.said_at)


def resolve(item: Item) -> Item:
    dated = [c for c in item.history if c.date]
    item.winner = max(dated, key=_rank) if dated else None
    item.date = item.winner.date if item.winner else None
    item.time = item.winner.time if item.winner else None
    portioned = [c for c in item.history if c.portion]
    item.portion = max(portioned, key=_rank).portion if portioned else None
    return item


def moved_from(item: Item) -> str | None:
    """The date the winning rank gave before its latest, when it moved."""

    if "moved" not in item.flags or not item.winner:
        return None
    same = sorted((c for c in item.history if c.date and c.trust == item.winner.trust), key=lambda c: c.said_at)
    earlier = [c.date for c in same if c.date != item.date]
    return earlier[-1] if earlier else None


def verify(item: Item, today: date, stale_days: int = 14) -> Item:
    dated = [c for c in item.history if c.date]
    flags = []
    if dated:
        top = max(int(c.trust) for c in dated)
        if len({c.date for c in dated if int(c.trust) == top}) > 1:
            flags.append("moved")
        if any(c.date != item.date for c in dated):
            flags.append("conflict")
    past = bool(item.date) and item.date < today.isoformat()
    if past:
        flags.append("past")
    newest = max((c.said_at for c in item.history), default=None)
    if item.date and not past and newest and (today - newest.date()).days > stale_days:
        flags.append("stale")
    item.flags = flags

    backed = any(c.trust is Trust.FACULTY and c.date == item.date for c in dated)
    unsure = not past and (not dated or ("conflict" in flags and not backed))
    if unsure:
        name = f"{item.course} {item.label}"
        if not dated:
            item.question = f'{name}: no date in "{item.history[0].message.text.strip()[:80]}". When is it?'
        else:
            opts = " or ".join(f"{c.date} ({WHO[c.trust]})" for c in sorted(dated, key=lambda c: c.said_at))
            item.question = f"{name}: I have {opts}. Which is right?"
    else:
        item.question = None
    return item


def adjudicate(items: list[Item], today: date, stale_days: int = 14) -> list[Item]:
    for item in items:
        verify(resolve(item), today, stale_days)
    return items
