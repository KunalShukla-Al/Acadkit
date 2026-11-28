#!/bin/bash
# The WhatsApp read for PersonaOS (persona/whatsapp.py), run by persona-tick.sh every 10 minutes.
# macOS lets launchd's bash, and Apple's tools it starts, read WhatsApp's database under Full Disk
# Access, but not node or python. So only /usr/bin/sqlite3 opens it, read-only; python plans the
# query and stores the rows.
#
#   scripts/mac/whatsapp-read.sh           one read
#   scripts/mac/whatsapp-read.sh --chats   chat names and message counts, to fill the semester pack

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

DB="$HOME/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
STATE="$HOME/Library/Application Support/AcadKit/persona/whatsapp"
SQLITE=/usr/bin/sqlite3
mkdir -p "$STATE"
trap 'rm -f "$STATE/rows.json"' EXIT

# The orchestrator's whatsapp job reports this status, so a failure here alerts like any job's.
fail() {
  local note
  note=$(printf '%s' "$1" | tr '"\n\\' "'  ")
  case "$note" in *"authorization denied"*) note="can't read WhatsApp's database: give /bin/bash Full Disk Access" ;; esac
  printf '{"at":"%s","ok":false,"note":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$note" > "$STATE/status.json"
  echo "$(date '+%Y-%m-%d %H:%M:%S') whatsapp-read: $note" >&2
  exit 1
}

if [ "${1:-}" = "--chats" ]; then
  exec "$SQLITE" -readonly "$DB" "SELECT COUNT(m.Z_PK), s.ZPARTNERNAME FROM ZWACHATSESSION s LEFT JOIN ZWAMESSAGE m ON m.ZCHATSESSION = s.Z_PK GROUP BY s.Z_PK ORDER BY 1 DESC LIMIT 40"
fi

err=$("$SQLITE" -readonly -json -cmd ".timeout 5000" "$DB" "$(python3 -m persona.whatsapp schema-sql)" 2>&1 > "$STATE/schema.json") || fail "$err"
python3 -m persona.whatsapp plan "$STATE/schema.json" > "$STATE/query.sql" || exit 1
err=$("$SQLITE" -readonly -json -cmd ".timeout 5000" "$DB" < "$STATE/query.sql" 2>&1 > "$STATE/rows.json") || fail "$err"
python3 -m persona.whatsapp ingest "$STATE/rows.json" > /dev/null
