"""The environment an engine runs with: the process's own, plus the repo's .env.local.

Under node the orchestrator already loaded .env.local. The WhatsApp reader
runs engines from bash, which doesn't, so the keys missing from the process
are filled from the file. Lines are KEY=value; quotes around a value are
dropped; blanks and # comments are skipped.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env.local"


def parse(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key] = value
    return out


def environment(path: Path = ENV_FILE) -> dict[str, str]:
    try:
        from_file = parse(path.read_text())
    except OSError:
        from_file = {}
    return {**from_file, **os.environ}
