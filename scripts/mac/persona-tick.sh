#!/bin/bash
# PersonaOS's tick, started by launchd every minute (com.acadkit.persona, docs/persona.md).
# Reads that need Full Disk Access run here in bash first, since macOS denies them to node and
# python; then the orchestrator runs every due job. PERSONA=off in .env.local turns both off.

cd "$(dirname "$0")/../.." || exit 1
grep -q '^PERSONA=off' .env.local 2>/dev/null && exit 0

STAMP="$HOME/Library/Application Support/AcadKit/persona/whatsapp/last-read"
if [ -z "$(find "$STAMP" -mmin -10 2>/dev/null)" ]; then
  mkdir -p "$(dirname "$STAMP")" && touch "$STAMP"
  scripts/mac/whatsapp-read.sh
fi

exec node --env-file-if-exists=.env.local scripts/persona.mjs
