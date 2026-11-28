"""The GitHub snapshot: my open pull requests with their CI, and the days I pushed, through `gh`.

    python3 -m persona.github collect   one run (the orchestrator's `github` job) → persona/github.json

The morning brief reads the snapshot: pull requests waiting for my merge,
the ones whose checks fail, and whether the daily-commit streak held.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .store import PERSONA_DIR

IST = timezone(timedelta(hours=5, minutes=30))
Run = Callable[[list[str]], str]


def gh(args: list[str]) -> str:
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError((r.stderr.strip().splitlines() or [f"gh {' '.join(args[:2])} failed"])[-1])
    return r.stdout


def _ci(buckets: list[str]) -> str:
    if any(b in ("fail", "cancel") for b in buckets):
        return "failing"
    if any(b == "pending" for b in buckets):
        return "running"
    return "passing" if buckets else "none"


def snapshot(run: Run = gh, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    prs = json.loads(run(["search", "prs", "--author=@me", "--state=open", "--json", "number,title,repository,url", "--limit", "20"]))
    waiting = []
    for p in prs:
        repo = p["repository"]["nameWithOwner"]
        try:
            checks = json.loads(run(["pr", "checks", str(p["number"]), "-R", repo, "--json", "bucket"]) or "[]")
        except RuntimeError:
            checks = []
        waiting.append({"repo": repo, "number": p["number"], "title": p["title"], "url": p["url"], "ci": _ci([c["bucket"] for c in checks])})
    login = run(["api", "user", "-q", ".login"]).strip()
    events = json.loads(run(["api", f"/users/{login}/events?per_page=100"]))
    week = {(now - timedelta(days=i)).astimezone(IST).date().isoformat() for i in range(7)}
    pushed = sorted({
        datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).astimezone(IST).date().isoformat()
        for e in events
        if e.get("type") == "PushEvent"
    } & week)
    return {"at": now.isoformat(), "waiting": waiting, "pushed_days": pushed}


def main() -> int:
    try:
        snap = snapshot()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as err:
        print(f"GitHub: {err}", file=sys.stderr)
        return 1
    path = Path(PERSONA_DIR) / "github.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap, indent=1))
    failing = sum(1 for w in snap["waiting"] if w["ci"] == "failing")
    print(f"{len(snap['waiting'])} open PR{'' if len(snap['waiting']) == 1 else 's'}, {failing} failing; pushed on {len(snap['pushed_days'])} of 7 days")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
