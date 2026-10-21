#!/bin/bash
# <xbar.title>AcadKit</xbar.title>
# <xbar.desc>The day, the next class, the sync and Autopilot, from AcadKit on this Mac.</xbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
#
# SwiftBar runs this every minute (the "1m" in its name); npm run mac:install puts it in
# SwiftBar's plugin folder. It reads the same .env.local as the sync, from the repo the Mac syncs.
REPO="__REPO__"
# A menu action runs it again with the action's name (sync, pause, resume).
exec /opt/homebrew/opt/node@24/bin/node --env-file-if-exists="$REPO/.env.local" "$REPO/scripts/mac/menubar.mjs" "$@"
