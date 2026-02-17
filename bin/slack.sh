#!/usr/bin/env bash
# Slack CLI — global entry point
# Resolves back to the repo's cli.ts regardless of where it's symlinked.
# Reads .env from the caller's working directory.

# Follow symlinks to find the real script location
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

exec npx tsx "$SCRIPT_DIR/../src/cli.ts" "$@"
