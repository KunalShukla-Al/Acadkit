#!/bin/bash
# Makes the hosted project's migration history match supabase/migrations, once, so that
# `supabase db push` (the deploy Action, .github/workflows/deploy.yml) applies only what is new.
#
#   SUPABASE_PROJECT_REF=<ref> bash scripts/repair-migration-history.sh 044
#
# The argument is the last migration already in effect on the project. Until the Action, every
# migration was applied by hand, and the history disagreed with the folder: on 19 Oct 2026,
# 001-044 were all in effect, but 001-036 were recorded under their numbers, 037-039 and 043
# under the timestamps the Supabase MCP gave them, and 040-042 and 044 not at all. The CLI may
# ask for the database password.
set -euo pipefail
cd "$(dirname "$0")/.."
LAST="${1:?which migration is the last one in effect on the project, e.g. 044}"
REF="${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"

# Recorded under timestamps; the folder names them 037, 038, 039 and 043.
supabase migration repair --project-ref "$REF" --status reverted 20260928172125 20260930161920 20260930171306 20261011163933

# Every file up to LAST, by its number.
versions=$(ls supabase/migrations | sed -n 's/^\([0-9]\{3\}\)_.*\.sql$/\1/p' | awk -v last="$LAST" '$1 <= last')
# shellcheck disable=SC2086
supabase migration repair --project-ref "$REF" --status applied $versions

supabase migration list --project-ref "$REF"
