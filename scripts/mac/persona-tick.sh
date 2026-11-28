#!/bin/bash
# PersonaOS's tick, started by launchd every minute (com.acadkit.persona, docs/persona.md).
# Reads that need Full Disk Access or Chrome run here in bash first, since macOS denies them to
# node and python; then the orchestrator runs every due job. PERSONA=off in .env.local turns both off.

cd "$(dirname "$0")/../.." || exit 1
grep -q '^PERSONA=off' .env.local 2>/dev/null && exit 0

STAMP="$HOME/Library/Application Support/AcadKit/persona/whatsapp/last-read"
if [ -z "$(find "$STAMP" -mmin -10 2>/dev/null)" ]; then
  mkdir -p "$(dirname "$STAMP")" && touch "$STAMP"
  scripts/mac/whatsapp-read.sh
fi

# The portals, every 10 minutes whenever the Mac is awake. Each read is activity on the Student
# Portal's session, so an idle timeout never fires between reads; only sleep or a restart ends it.
PORTAL_STAMP="$HOME/Library/Application Support/AcadKit/persona/portal/last-read"
if [ -z "$(find "$PORTAL_STAMP" -mmin -10 2>/dev/null)" ]; then
  mkdir -p "$(dirname "$PORTAL_STAMP")" && touch "$PORTAL_STAMP"
  scripts/mac/portal-read.sh
fi

exec node --env-file-if-exists=.env.local scripts/persona.mjs
