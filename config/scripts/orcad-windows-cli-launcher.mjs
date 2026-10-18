import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME } from '../../src/shared/orcad-artifacts.ts'

const { PE_MACHINE, describePeMachine, readPeMachine } = createRequire(import.meta.url)(
  './windows-pe-machine.cjs'
)

export function orcadWindowsCliLauncherSource(root, arch) {
  return join(root, '.build', 'windows-cli-launcher', arch, 'orca.exe')
}

/**
 * A Windows slot's `orca` command; a Windows build host compiles a missing one.
 *
 * Fork note (web server): a Windows host without Rust skips the launcher instead of failing.
 * orcad starts without it (prepareOrcadCliLauncher returns null), so the web UI and its
 * terminals work; only typing `orca ...` inside Orca terminals (and agent skills that call it:
 * orchestration, agent browser, worktree commands) is unavailable. Install Rust and rebuild to
 * restore it.
 */
export function stageOrcadWindowsCliLauncher(
  root,
  outputDir,
  target,
  host = { platform: process.platform, hasCargo: hostHasCargo },
  compile = compileOrcadWindowsCliLauncher
) {
  if (!target.startsWith('win32-')) {
    return
  }
  const arch = target.slice('win32-'.length)
  const source = orcadWindowsCliLauncherSource(root, arch)
  if (!existsSync(source)) {
    if (host.platform !== 'win32') {
      throw new Error(
        `Orcad ${target} requires the native CLI launcher. On Windows, run: ` +
          `node config/scripts/build-windows-cli-launcher.mjs --arch ${arch} --output ${source}`
      )
    }
    if (host.hasCargo && !host.hasCargo()) {
      console.warn(
        `[build-orcad] cargo not found: skipping the ${target} \`orca\` CLI launcher. ` +
          'The web UI and terminals work; `orca ...` inside Orca terminals will not. ' +
          'Install Rust (https://rustup.rs) and rebuild to include it.'
      )
      return
    }
    compile(root, arch, source)
  }
  const machine = readPeMachine(source)
  if (machine !== PE_MACHINE[arch]) {
    throw new Error(`Orcad ${target} CLI launcher has ${describePeMachine(machine)}`)
  }
  const destination = join(outputDir, ...ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME.split('/'))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}

function hostHasCargo() {
  try {
    return runProcessSync({ program: 'cargo', args: ['--version'], timeoutMs: 30_000 }).code === 0
  } catch {
    return false
  }
}

function compileOrcadWindowsCliLauncher(root, arch, output) {
  const result = runProcessSync({
    program: process.execPath,
    args: [
      join(root, 'config/scripts/build-windows-cli-launcher.mjs'),
      '--arch',
      arch,
      '--output',
      output
    ],
    cwd: root,
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(`Windows CLI launcher build for ${arch} failed with exit ${result.code}`)
  }
}
