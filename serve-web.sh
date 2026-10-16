#!/usr/bin/env bash
# Start the Orca server on plain Node (orcad) with the browser client — no Electron anywhere.
#   PORT          listen port            (default 6800; the desktop app uses 6768)
#   BIND          listen address         (default 0.0.0.0, reachable from the LAN)
#   PAIRING_HOST  address clients dial   (default: this Mac's en0 LAN IP)
#   ORCA_USER_DATA                       profile dir (default ~/.orca-server-dev)
#   ORCA_ALLOW_INSECURE_WEB_PAIRING      1 = allow pairing from http://<LAN IP> pages (default 1)
#   ORCA_BROWSER_EXECUTABLE              Chromium for the agent browser (default: Edge/Chrome if installed)
# Rebuild after code changes: corepack pnpm run build:cli && \
#   node config/scripts/build-orcad-template.mjs --targets darwin-arm64
set -euo pipefail
cd "$(dirname "$0")"

source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use 24 >/dev/null

PORT="${PORT:-6800}"
BIND="${BIND:-0.0.0.0}"
PAIRING_HOST="${PAIRING_HOST:-$(ipconfig getifaddr en0 || echo 127.0.0.1)}"

export ORCA_USER_DATA="${ORCA_USER_DATA:-$HOME/.orca-server-dev}"
export ORCA_WEB_CLIENT_ROOT="${ORCA_WEB_CLIENT_ROOT:-$PWD/out/web}"
export ORCA_ALLOW_INSECURE_WEB_PAIRING="${ORCA_ALLOW_INSECURE_WEB_PAIRING:-1}"
export ORCA_ORCAD_NO_ELECTRON=1
if [[ -z "${ORCA_BROWSER_EXECUTABLE:-}" ]]; then
  for candidate in \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [[ -x "$candidate" ]]; then
      export ORCA_BROWSER_EXECUTABLE="$candidate"
      break
    fi
  done
fi
mkdir -p "$ORCA_USER_DATA"

# Materialize the orcad slot (node-pty prebuilds + pinned Node) from out/orcad-template,
# the step `orca serve` normally runs under Electron; plain Node runs it the same way.
selection="$(ORCA_SERVE_RUNTIME=orcad node out/main/orcad/orcad-local-serve-selection-entry.js \
  --user-data "$ORCA_USER_DATA" --app-root "$PWD" | grep '^ORCA_SERVE_RUNTIME ')"
read -r runtime entry version < <(node -e '
  const s = JSON.parse(process.argv[1].replace(/^ORCA_SERVE_RUNTIME /, ""))
  if (s.kind !== "orcad") { console.error("orcad unavailable: " + s.reason); process.exit(1) }
  console.log(s.runtime, s.entry, s.version)' "$selection")
export ORCA_VERSION="$version"

# Why stay in the repo: orcad finds the agent-browser driver under ./node_modules.
exec "$runtime" "$entry" \
  --port "$PORT" --bind "$BIND" --pairing-address "$PAIRING_HOST" "$@"
