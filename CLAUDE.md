# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## This fork: Orca as a pure web server (no Electron)

This branch is a fork of upstream Orca (`stablyai/orca`) with Electron removed (`electron`, `electron-builder`, `electron-vite`, `@electron/rebuild`, `electron-updater` are gone). Orca runs as `orcad` — the runtime on plain Node — serving the React renderer as a browser client.

Consequences when reading upstream-derived scripts and docs:

- Scripts that call `electron-vite`, `electron-builder` or `ensure:electron-runtime` (`pnpm dev`, `pnpm start`, `build:electron-vite`, `build:mac`/`win`/`linux`, all `test:e2e*`, most `bench:*`) no longer work here. Upstream docs (README, `.github/CONTRIBUTING.md`) still describe the Electron desktop flow.
- node-pty is not compiled on install; prebuilt binaries are committed under `prebuilds/orcad/` (`darwin-arm64`, `darwin-x64`, `win32-x64`). Other targets fall back to compiling through `config/scripts/build-orcad-node.mjs`.
- The Windows addons `windows-process-tree.node` and `windows-security.node` are committed under `.build/<addon>/x64/`; the orcad build picks them up instead of compiling. Rebuild them (`config/scripts/build-windows-process-tree-addon.mjs`, `build-windows-security-addon.mjs`) only after changing their sources or patches.

## Commands

Toolchain: Node 24, pnpm (see `packageManager`), and the Bun version in `config/.bun-version` (`pnpm test` runs Vitest on Bun).

```bash
pnpm install                       # postinstall builds src/packages/process-host
pnpm run build:web-server          # web client -> out/web, orcad + pinned Node -> out/orcad, out/runtimes
./serve-web.sh                     # run it (PORT=6800, BIND=0.0.0.0, ORCA_USER_DATA=~/.orca-server-dev)
pnpm dev:web                       # Vite dev server for the browser client only (127.0.0.1)

pnpm tc                            # typecheck all projects (tc:node / tc:cli / tc:web for one)
pnpm test path/to/file.test.ts     # single test file (Vitest on Bun, Node workers for runtime contracts)
pnpm test:node path/to/file.test.ts  # same suites entirely on Node
pnpm run check:code-quality:changed  # changed-lines lint gate (full `pnpm lint` is slow)
pnpm format                        # oxfmt
```

`serve-web.sh` sets `ORCA_ORCAD_NO_ELECTRON=1`, `ORCA_WEB_CLIENT_ROOT=out/web` and `ORCA_ALLOW_INSECURE_WEB_PAIRING=1` (allows pairing from `http://<LAN IP>`), and auto-detects Chrome/Edge for the agent browser (`ORCA_BROWSER_EXECUTABLE`). It is a bash script with macOS/Linux LAN-IP detection; `serve-web.ps1` is the Windows equivalent.

### Token access (fork)

orcad prints `Web access: http://<host>:<port>/?token=<token>`. The token is a runtime device row named `Web access token` (`src/main/runtime/web-access-device.ts`), fixed via `--token` / `ORCA_TOKEN`, otherwise random and kept across restarts. Opening `http://<host>:<port>/` without a token shows the connect form, which accepts the token. The browser builds the pairing offer itself from `/orca-web-access.json` (host E2EE public key, no secrets; `src/main/runtime/rpc/web-access-info-handler.ts`) and dials the page's own host, so any address works. The `#pairing=` links still work.

orcad also prints a `Web client URL:` with a `#pairing=` fragment. The web client dials back whichever host served the page (`followPageHostEndpoint` in `src/renderer/src/web/web-pairing.ts`), so the same link works with any of the machine's addresses (LAN, Tailscale, ZeroTier) or behind an https proxy. Unlike upstream, a pairing opened over plain http from another machine is kept in localStorage (`isSessionOnlyBrowser` in `web-runtime-environment.ts`), so reloads and browser restarts stay connected.

### Building on Windows

With the committed win32-x64 prebuilds, a Windows x64 host needs no Python or MSVC: `pnpm install --ignore-scripts` then `pnpm run build:web-server`. The notes below apply only when recompiling natives.

- `pnpm install --ignore-scripts`: the `native/windows-*` workspace packages run `node-gyp` on install and fail without a configured Python.
- node-gyp must exist at `node_modules/node-gyp` (the orcad build scripts invoke it by that path), plus Python (`PYTHON` env) and MSVC.
- Build from a short path (e.g. `subst O: <repo>`): MSBuild fails with `DirectoryNotFoundException` on `.tlog` files under deep `node_modules/.pnpm` paths (MAX_PATH). Do not run vitest from a drive root — it fails with `Root path does not exist`.
- Without Rust/`cargo`, the `bin/orca.exe` CLI launcher is skipped with a warning (`config/scripts/orcad-windows-cli-launcher.mjs`) and is an optional artifact (`orcadOptionalArtifactFilenames` in `src/shared/orcad-artifacts.ts`). The web UI and terminals work; only `orca ...` inside Orca terminals (and agent skills using it) is unavailable.
- `pnpm tc:node` fails on missing `electron-vite/node` types (left over from the Electron removal).

## Architecture

- **`src/main/`** — the host runtime (`OrcaRuntimeService`): terminals/PTYs, agents and agent hooks, git/worktrees, SSH, provider integrations (GitHub, GitLab, Bitbucket, Azure DevOps…). Originally Electron main; most of it is Electron-agnostic.
- **`src/main/orcad/`** — the Electron-free entry point. `main.ts` → `orcad-entry.ts` installs Node host adapters (`orcad-host-adapters.ts`), builds the same runtime service the desktop uses, registers a headless PTY controller, and serves runtime RPC plus the static web client. Browser automation uses an external Chromium (`external-chromium-*`).
- **`src/main/runtime/rpc/`** — the RPC surface clients talk to: `dispatcher.ts`, E2EE channel (`e2ee-*`), device-key auth, and one module per method group in `methods/`. Params are catalogued and checked (`generate:rpc-params-catalog` / `verify:rpc-params-catalog`); see "Remote Wire Compatibility" in AGENTS.md before changing them.
- **`src/renderer/`** — React + Zustand UI (`src/renderer/src/store`, `components`, shadcn primitives in `components/ui`). Two entries: `index.html` (desktop) and `web-index.html` (browser).
- **`src/renderer/src/web/`** — browser bootstrap: pairing (`WebConnect.tsx`, `web-pairing.ts`), device keys, and `web-preload-api.ts` + `preload-api/` which re-implement the Electron `window.api` preload surface (`src/preload/api-types.ts`) over runtime RPC. A feature that worked through Electron IPC needs a counterpart here to work in the web build.
- **`src/renderer/src/runtime/`** — client-side runtime/host session logic (host session mirroring, host-routed calls, capability checks).
- **`src/shared/`** — code and types shared between host, renderer and CLI.
- **`src/cli/`** — the `orca` CLI (`pnpm run build:cli` → `out/cli`).
- **`src/packages/process-host`** — `@orca/process-host`, the required way to spawn child processes (`runProcess` / `spawnProcess`); must be built before typecheck/test (scripts do this automatically).
- **`config/`** — tsconfigs per project, vitest/oxlint configs, and `config/scripts/` build/verify scripts (`build-web-server.mjs`, `run-vite-web-build.mjs`, `build-orcad-node.mjs`).
- **`mobile/`** and **`cloud/`** — the mobile companion app and the pairing relay; separate workspaces.
