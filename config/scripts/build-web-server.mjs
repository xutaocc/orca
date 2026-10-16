#!/usr/bin/env node
/**
 * Build the Electron-free Orca web server for this machine: the browser client (out/web) and
 * an orcad package with its pinned Node (out/orcad + out/runtimes). `serve-web.sh` runs it.
 *
 * node-pty comes from the committed prebuilds in prebuilds/orcad, so no C/C++ toolchain is
 * needed for those targets; any other target compiles its slot through build-orcad-node.
 */
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { runProcessSync } from '@orca/process-host'
import { currentTarget } from './server-build-target.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const COMMITTED_PREBUILDS = join(ROOT, 'prebuilds', 'orcad')
const PREBUILDS_DIR = join(ROOT, 'out', 'orcad-prebuilds')

function run(script, args = []) {
  const result = runProcessSync({
    program: process.execPath,
    args: [join(ROOT, script), ...args],
    cwd: ROOT,
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(`${script} failed with exit ${result.code}`)
  }
}

function hasSlot(dir, target) {
  const manifest = join(dir, 'manifest.json')
  return existsSync(manifest) && target in JSON.parse(readFileSync(manifest, 'utf8')).slots
}

const target = currentTarget()
run('config/scripts/run-vite-web-build.mjs')
run('config/scripts/verify-web-build.mjs')
if (!hasSlot(PREBUILDS_DIR, target) && hasSlot(COMMITTED_PREBUILDS, target)) {
  cpSync(COMMITTED_PREBUILDS, PREBUILDS_DIR, { recursive: true })
}
run('config/scripts/build-orcad-node.mjs', ['--target', target])
console.log(`[build-web-server] ok — ${target}; start it with ./serve-web.sh`)
