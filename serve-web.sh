#!/usr/bin/env bash
# Start the Orca web server: orcad on its pinned Node plus the browser client. No Electron.
# Build first:  corepack pnpm install && corepack pnpm run build:web-server
#   PORT          listen port            (default 6800)
#   BIND          listen address         (default 0.0.0.0, reachable from the LAN)
#   PAIRING_HOST  address clients dial   (default: this machine's LAN IP)
#   ORCA_USER_DATA                       data dir (default ~/.orca-server-dev)
#   ORCA_ALLOW_INSECURE_WEB_PAIRING      1 = allow pairing from http://<LAN IP> pages (default 1)
#   ORCA_BROWSER_EXECUTABLE              Chromium for the agent browser (default: Chrome/Edge if installed)
set -euo pipefail
cd "$(dirname "$0")"

runtime="$(ls out/runtimes/node-*/bin/node 2>/dev/null | head -n 1)"
if [[ -z "$runtime" || ! -f out/orcad/orcad-server.js || ! -f out/web/web-index.html ]]; then
  echo "serve-web: not built yet; run: corepack pnpm run build:web-server" >&2
  exit 1
fi

lan_ip() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  else
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

PORT="${PORT:-6800}"
BIND="${BIND:-0.0.0.0}"
PAIRING_HOST="${PAIRING_HOST:-$(lan_ip)}"
PAIRING_HOST="${PAIRING_HOST:-127.0.0.1}"

export ORCA_USER_DATA="${ORCA_USER_DATA:-$HOME/.orca-server-dev}"
export ORCA_WEB_CLIENT_ROOT="$PWD/out/web"
export ORCA_ALLOW_INSECURE_WEB_PAIRING="${ORCA_ALLOW_INSECURE_WEB_PAIRING:-1}"
export ORCA_ORCAD_NO_ELECTRON=1
export ORCA_VERSION="$(cat out/orcad/.version)"
if [[ -z "${ORCA_BROWSER_EXECUTABLE:-}" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      export ORCA_BROWSER_EXECUTABLE="$candidate"
      break
    fi
  done
fi
mkdir -p "$ORCA_USER_DATA"

exec "$runtime" out/orcad/orcad-server.js \
  --port "$PORT" --bind "$BIND" --pairing-address "$PAIRING_HOST" "$@"
