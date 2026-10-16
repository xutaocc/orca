#!/usr/bin/env bash
# Start the pure-Node Orca server (orcad) with the browser client, isolated from the desktop app.
#   PORT          listen port            (default 6800; the desktop app uses 6768)
#   PAIRING_HOST  address clients dial   (default: this Mac's en0 LAN IP)
#   ORCA_DEV_USER_DATA_PATH  profile dir (default ~/.orca-server-dev)
set -euo pipefail
cd "$(dirname "$0")"

source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm use 24 >/dev/null

PORT="${PORT:-6800}"
PAIRING_HOST="${PAIRING_HOST:-$(ipconfig getifaddr en0 || echo 127.0.0.1)}"
export ORCA_DEV_USER_DATA_PATH="${ORCA_DEV_USER_DATA_PATH:-$HOME/.orca-server-dev}"
export ORCA_SERVE_RUNTIME=orcad
mkdir -p "$ORCA_DEV_USER_DATA_PATH"

exec node config/scripts/orca-dev.mjs serve --port "$PORT" --pairing-address "$PAIRING_HOST" "$@"
