#!/bin/bash
# The Mac side of the study sync: the auto-sync tick, the launch agent that keeps the folder
# watcher running (scripts/mac/watch.mjs), the night shift's, and the Finder's Quick Action. Run
# from the repo the Mac syncs from, after pulling:
#   npm run mac:install
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$HOME/Library/Application Support/AcadKit"
AGENT="$HOME/Library/LaunchAgents/com.acadkit.studysync.plist"
mkdir -p "$STATE" "$HOME/Library/Logs/AcadKit" "$HOME/Library/LaunchAgents"

# A new file renamed into place: bash reads a running script as it goes.
cp "$REPO/scripts/mac/auto-sync.sh" "$STATE/auto-sync.sh.new"
chmod 755 "$STATE/auto-sync.sh.new"
mv "$STATE/auto-sync.sh.new" "$STATE/auto-sync.sh"

sed -e "s|__HOME__|$HOME|g" -e "s|__REPO__|$REPO|g" "$REPO/scripts/mac/com.acadkit.studysync.plist" > "$AGENT"
plutil -lint "$AGENT" >/dev/null
launchctl bootout "gui/$(id -u)/com.acadkit.studysync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT"
echo "Installed. The study folder syncs 10 s after it goes quiet, and the app's requests every 3 minutes."

# The night shift: from 23:00, awake on the charger for the 02:00 job (scripts/night-shift.mjs).
NIGHT="$HOME/Library/LaunchAgents/com.acadkit.nightshift.plist"
sed -e "s|__HOME__|$HOME|g" -e "s|__REPO__|$REPO|g" "$REPO/scripts/mac/com.acadkit.nightshift.plist" > "$NIGHT"
plutil -lint "$NIGHT" >/dev/null
launchctl bootout "gui/$(id -u)/com.acadkit.nightshift" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$NIGHT"
echo "Night shift: from 23:00, on the charger with the lid open."

# Continue from the Mac: "Send to AcadKit phone" in the Finder's Quick Actions (scripts/mac/send-to-phone.mjs).
SERVICE="$HOME/Library/Services/Send to AcadKit phone.workflow"
mkdir -p "$HOME/Library/Services"
rm -rf "$SERVICE"
cp -R "$REPO/scripts/mac/send-to-phone.workflow" "$SERVICE"
sed -i '' "s|__REPO__|$REPO|g" "$SERVICE/Contents/document.wflow"
plutil -lint "$SERVICE/Contents/document.wflow" >/dev/null
/System/Library/CoreServices/pbs -update 2>/dev/null || true
echo "Finder: right-click files → Quick Actions → Send to AcadKit phone."

# The menu bar: the plugin goes into SwiftBar's plugin folder (brew install --cask swiftbar, then pick one).
PLUGINS="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
if [ -n "$PLUGINS" ] && [ -d "$PLUGINS" ]; then
  sed "s|__REPO__|$REPO|g" "$REPO/scripts/mac/swiftbar/acadkit.1m.sh" > "$PLUGINS/acadkit.1m.sh"
  chmod 755 "$PLUGINS/acadkit.1m.sh"
  echo "Menu bar: in $PLUGINS."
else
  echo "Menu bar: install SwiftBar (brew install --cask swiftbar), pick its plugin folder, then run this again."
fi
echo "Log: ~/Library/Logs/AcadKit/study-sync.log"
