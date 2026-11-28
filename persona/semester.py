"""The semester runner: the study pipeline's steps, in order, from the semester pack (docs/persona.md).

    python3 -m persona.semester             run this semester's pipeline (STUDY_DIR)
    python3 -m persona.semester --next      run next semester's (STUDY_NEXT_DIR)
    python3 -m persona.semester --dry-run   list the steps without running them

The pack's "pipeline" lists commands, each run from the semester's folder
with a 30-minute limit; the first that fails stops the run. Their output
goes to persona/semester.log.
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from .env import environment
from .pack import _dirs
from .store import PERSONA_DIR

LIMIT_S = 30 * 60


def run_pipeline(folder: Path, log: Path, dry_run: bool = False, runner=subprocess.run) -> tuple[bool, list[str]]:
    pack = json.loads((folder / "_src" / "semester.json").read_text())
    steps = pack.get("pipeline", [])
    if not steps:
        return False, [f"no pipeline in {folder / '_src' / 'semester.json'}"]
    if dry_run:
        return True, [f"would run: {s}" for s in steps]
    lines = []
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a") as out:
        out.write(f"\n== {datetime.now():%Y-%m-%d %H:%M} {folder.name}\n")
        for step in steps:
            out.write(f"$ {step}\n")
            out.flush()
            try:
                r = runner(shlex.split(step), cwd=folder, stdout=out, stderr=subprocess.STDOUT, timeout=LIMIT_S)
                code = r.returncode
            except subprocess.TimeoutExpired:
                code = "timeout"
            if code != 0:
                lines.append(f"failed ({code}): {step}")
                return False, lines
            lines.append(f"ok: {step}")
    return True, lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m persona.semester")
    parser.add_argument("--next", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    dirs = _dirs(environment())
    if args.next and len(dirs) < 2:
        print("STUDY_NEXT_DIR isn't set", file=sys.stderr)
        return 1
    folder = dirs[1] if args.next else dirs[0]
    ok, lines = run_pipeline(folder, PERSONA_DIR / "semester.log", args.dry_run)
    print("\n".join(lines))
    if not args.dry_run:
        print(f"Log: {PERSONA_DIR / 'semester.log'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
