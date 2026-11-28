#!/bin/bash
# The portals' read for PersonaOS (persona/portal.py), run by persona-tick.sh every 15 minutes from
# 07:00 to 23:00. Apple's osascript runs scripts/mac/portal-read.js, which fetches attendance, marks,
# timetable and planner through the Student Portal and Academia tabs I'm logged in to in Chrome;
# python reads the tables. It never logs in. The page dump holds my data, so it's deleted at once.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

STATE="$HOME/Library/Application Support/AcadKit/persona/portal"
mkdir -p "$STATE"
trap 'rm -f "$STATE/raw.json"' EXIT

status() {
  local note
  note=$(printf '%s' "$2" | tr '"\n\\' "'  ")
  printf '{"at":"%s","ok":%s,"note":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$note" > "$STATE/status.json"
}

if ! err=$(/usr/bin/osascript -l JavaScript scripts/mac/portal-read.js 2>&1 > "$STATE/raw.json"); then
  status false "$err"
  exit 1
fi
case "$(head -c 400 "$STATE/raw.json")" in
  *"turned off"*) status false "Chrome blocks it: View > Developer > Allow JavaScript from Apple Events"; exit 1 ;;
  *"isn't open"*) status true "Chrome isn't open"; exit 0 ;;
esac
if note=$(python3 -m persona.portal ingest "$STATE/raw.json" 2>&1); then
  status true "$note"
else
  status false "$note"
  exit 1
fi
