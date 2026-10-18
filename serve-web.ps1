# Windows counterpart of serve-web.sh: orcad on its pinned Node plus the browser client.
# Build first:  pnpm install --ignore-scripts && pnpm run build:web-server
#   $env:PORT          listen port            (default 6800)
#   $env:BIND          listen address         (default 0.0.0.0, reachable from the LAN)
#   $env:PAIRING_HOST  address clients dial   (default: this machine's LAN IP)
#   $env:ORCA_USER_DATA                       data dir (default ~/.orca-server-dev)
#   $env:ORCA_ALLOW_INSECURE_WEB_PAIRING      1 = allow pairing from http://<LAN IP> pages (default 1)
#   $env:ORCA_BROWSER_EXECUTABLE              Chromium for the agent browser (default: Chrome/Edge if installed)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$runtime = Get-ChildItem -Path 'out/runtimes/node-*/node.exe' -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $runtime -or -not (Test-Path 'out/orcad/orcad-server.js') -or -not (Test-Path 'out/web/web-index.html')) {
  Write-Error 'serve-web: not built yet; run: pnpm run build:web-server'
  exit 1
}

function Get-LanIp {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric | Select-Object -First 1
  if (-not $route) { return $null }
  (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Select-Object -First 1).IPAddress
}

$port = if ($env:PORT) { $env:PORT } else { '6800' }
$bind = if ($env:BIND) { $env:BIND } else { '0.0.0.0' }
$pairingHost = if ($env:PAIRING_HOST) { $env:PAIRING_HOST } else { Get-LanIp }
if (-not $pairingHost) { $pairingHost = '127.0.0.1' }

if (-not $env:ORCA_USER_DATA) { $env:ORCA_USER_DATA = Join-Path $HOME '.orca-server-dev' }
$env:ORCA_WEB_CLIENT_ROOT = Join-Path $PWD 'out/web'
if (-not $env:ORCA_ALLOW_INSECURE_WEB_PAIRING) { $env:ORCA_ALLOW_INSECURE_WEB_PAIRING = '1' }
$env:ORCA_ORCAD_NO_ELECTRON = '1'
$env:ORCA_VERSION = (Get-Content 'out/orcad/.version' -Raw).Trim()
if (-not $env:ORCA_BROWSER_EXECUTABLE) {
  foreach ($candidate in @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")) {
    if (Test-Path $candidate) { $env:ORCA_BROWSER_EXECUTABLE = $candidate; break }
  }
}
New-Item -ItemType Directory -Force -Path $env:ORCA_USER_DATA | Out-Null

& $runtime.FullName out/orcad/orcad-server.js --port $port --bind $bind --pairing-address $pairingHost @args
exit $LASTEXITCODE
