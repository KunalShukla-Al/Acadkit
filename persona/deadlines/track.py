"""Claims → items: every claim about one real deadline folded into one item.

One test goes by many names across groups ("FT-II", "CT 2", "FJ2"). A claim
joins an item that shares an instance alias with it, including aliases that
appear together in one message ("FT-II (FJ2)"); a bridging claim merges the
items it links. A claim with no alias joins the one open item of its course
and kind, or starts its own. Claims fold in the order they were said.
"""

from __future__ import annotations

import re

from .model import Claim, Item

_ALIAS = re.compile(r"\b(ft|ct|llt|llj|fj|cla-?t|cla)\s*[-\s]?\s*(\d{1,2}|iv|v?i{1,3}|v)\b", re.IGNORECASE)
_PREFIX = {"ft": "FT", "ct": "CT", "llt": "LLT", "llj": "LLJ", "fj": "FJ", "cla": "CLA-T", "clat": "CLA-T", "cla-t": "CLA-T"}
_ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X"}


def aliases_in(text: str) -> set[str]:
    """Every instance code in a line, as PREFIX-ROMAN ("ct 2" → "CT-II")."""

    out = set()
    for prefix, numeral in _ALIAS.findall(text):
        n = numeral.strip().upper()
        out.add(f"{_PREFIX[prefix.lower()]}-{_ROMAN.get(int(n), n) if n.isdigit() else n}")
    return out


def track(claims: list[Claim]) -> list[Item]:
    items: list[Item] = []
    for claim in sorted(claims, key=lambda c: c.said_at):
        found = aliases_in(claim.message.text)
        if found:
            matches = [it for it in items if it.course == claim.course and it.aliases & found]
            if matches:
                target = matches[0]
                for extra in matches[1:]:
                    target.aliases |= extra.aliases
                    target.history += extra.history
                    items.remove(extra)
            else:
                target = Item(claim.course, claim.kind)
                items.append(target)
        else:
            same = [it for it in items if it.course == claim.course and it.kind == claim.kind]
            target = same[0] if len(same) == 1 else Item(claim.course, claim.kind)
            if target not in items:
                items.append(target)
        target.aliases |= found
        target.history.append(claim)
    return items
