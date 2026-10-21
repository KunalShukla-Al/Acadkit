#!/bin/bash
# AcadKit auto-sync tick, installed to ~/Library/Application Support/AcadKit by npm run mac:install.
# The folder watcher (scripts/mac/watch.mjs) runs it 10 s after the study folder goes quiet, with
# AUTO_SYNC_QUIET=1, and every 3 minutes for what the app asks of the Mac. It syncs only when
# something changed since the last good sync, and, on the 3-minute tick, only once nothing has been
# written for 60 s (so half-copied files aren't uploaded).
# Node 24, the version in .nvmrc that CI and Vercel build with (brew install node@24).
export PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
REPO="${ACADKIT_REPO:-$HOME/Acadkit}"
# The study folder is STUDY_DIR in the repo's .env.local: npm run semester:switch moves it on.
DIR="$(sed -n 's/^STUDY_DIR=//p' "$REPO/.env.local" | tail -1)"
DIR="${DIR/#\~/$HOME}"
DIR="${DIR:-$HOME/Documents/SRM_Sem3}"
# Next semester's folder, filed ahead (STUDY_NEXT_DIR): watched and rendered too.
NEXT="$(sed -n 's/^STUDY_NEXT_DIR=//p' "$REPO/.env.local" | tail -1)"
NEXT="${NEXT/#\~/$HOME}"
WATCH=("$DIR"); [ -n "$NEXT" ] && [ "$NEXT" != "$DIR" ] && [ -d "$NEXT" ] && WATCH+=("$NEXT")
STATE="$HOME/Library/Application Support/AcadKit"
STAMP="$STATE/last-sync"
LOCK="$STATE/sync.lock"

log() { echo "$(date '+%F %T') $*"; }

# One run at a time; a lock older than 3 hours is stale (a big batch of PDF renders can take a while).
if ! mkdir "$LOCK" 2>/dev/null; then
    [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ] || exit 0
    rm -rf "$LOCK"; mkdir "$LOCK" || exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# The Mac idles to sleep after a minute (pmset sleep 1), which froze long syncs half-way. Hold an
# idle-sleep assertion for as long as this tick runs: caffeinate exits when this script does.
caffeinate -i -w $$ &

if ! ls "$DIR" >/dev/null 2>&1; then
    log "cannot read $DIR (macOS privacy: give /bin/bash Full Disk Access)"
    # Say so on screen too, but not every 3 minutes: once per 6 hours.
    if [ -z "$(find "$STATE/warned-access" -mmin -360 2>/dev/null)" ]; then
        osascript -e 'display notification "AcadKit can no longer read your study folder. Give /bin/bash Full Disk Access again." with title "AcadKit sync"' 2>/dev/null
        touch "$STATE/warned-access"
    fi
    exit 1
fi

# Just after the Mac wakes, the network takes a few seconds to come back: wait up to 30 s for
# Supabase to answer (any HTTP reply will do) instead of failing the tick with "fetch failed".
SUPABASE="${VITE_SUPABASE_URL:-$(sed -n 's/^VITE_SUPABASE_URL=//p' "$REPO/.env.local" | tail -1)}"
online() { curl -s -o /dev/null --max-time 3 "$SUPABASE/auth/v1/health"; }
if [ -n "$SUPABASE" ] && ! online; then
    start=$SECONDS
    until online; do
        [ $((SECONDS - start)) -ge 30 ] && { log "no network for 30 s; trying again next tick"; exit 0; }
        sleep 3
    done
    log "network back after $((SECONDS - start)) s"
fi

# What the app asked for: deletes go to the Trash, uploads are saved in, and a heartbeat.
cd "$REPO" || exit 1
req=$(npm run -s sync:app 2>&1)
[ -n "$req" ] && echo "$req" | sed "s/^/    /"
if echo "$req" | grep -qE "^(Moved|Saved) "; then
    log "changes from the app -> syncing"
    force=1
fi

# Notes edited in _src: render just those to PDF (python3 _src/render_changed.py).
for d in "${WATCH[@]}"; do
    if [ -f "$d/_src/render_changed.py" ] && [ -n "$(python3 "$d/_src/render_changed.py" "$d" --dry-run 2>/dev/null)" ]; then
        log "notes changed in $(basename "$d") -> rendering PDFs"
        ren=$(python3 "$d/_src/render_changed.py" "$d" 2>&1)
        echo "$ren" | sed "s/^/    /"
        echo "$ren" | grep -q "^Rendered " && force=1
    fi
done

# Changed since last sync? Directories count too, because deleting a file updates its folder's time.
if [ -n "$force" ]; then
    changed="(from the app or rendered notes)"
elif [ -f "$STAMP" ]; then
    changed=$(find "${WATCH[@]}" -newer "$STAMP" -not -name '.*' -not -name '~$*' 2>/dev/null | head -1)
    [ -z "$changed" ] && exit 0
else
    changed="(first run)"
fi

# Still being written? Wait for the next tick. The watcher has already seen 10 s of quiet.
if [ -z "$force" ] && [ -z "$AUTO_SYNC_QUIET" ]; then
    busy=$(find "${WATCH[@]}" -mmin -1 -not -name '.*' 2>/dev/null | head -1)
    [ -n "$busy" ] && { log "change seen ($changed) but files still being written; waiting"; exit 0; }
fi

touch "$STAMP.new"            # time the sync STARTED, so edits made during it are caught next time
log "change: $changed -> syncing"
out=$(npm run sync:files 2>&1); rc=$?
echo "$out" | grep -E "files,|Storage:|Upload|not uploaded|Exam prep|Notices:|Projects:|Run-up:|Search index:|Units and topics|Synced|rror|warning|no such" | sed "s/^/    /"
if [ $rc -eq 0 ] && echo "$out" | grep -q "^Synced"; then
    mv "$STAMP.new" "$STAMP"
    up=$(echo "$out" | sed -n 's/^Upload \([0-9]*\).*/\1/p')
    log "ok (uploaded ${up:-0})"
    if [ "${up:-0}" != "0" ]; then osascript -e "display notification \"Uploaded $up file(s) to AcadKit\" with title \"AcadKit sync\"" 2>/dev/null; fi
else
    rm -f "$STAMP.new"
    log "FAILED (exit $rc); will retry next tick"
    osascript -e 'display notification "Sync failed, see ~/Library/Logs/AcadKit/study-sync.log" with title "AcadKit sync"' 2>/dev/null
fi
exit 0
