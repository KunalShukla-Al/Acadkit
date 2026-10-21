#!/bin/bash
# The edge functions a range of commits touched, one per line: a change under
# supabase/functions/<name>/, or in packages/core for a function that imports core.
#   bash scripts/changed-functions.sh <from-sha> <to-sha>
set -euo pipefail
cd "$(dirname "$0")/.."
changed=$(git diff --name-only "$1" "$2")
{
  echo "$changed" | sed -n 's#^supabase/functions/\([^/_][^/]*\)/.*#\1#p'
  if echo "$changed" | grep -q '^packages/core/'; then
    grep -l 'packages/core/' supabase/functions/*/*.ts 2>/dev/null | sed 's#^supabase/functions/\([^/]*\)/.*#\1#'
  fi
} | sort -u | while read -r f; do [ -f "supabase/functions/$f/index.ts" ] && echo "$f"; done
