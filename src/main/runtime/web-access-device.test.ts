import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceRegistry } from './device-registry'
import { WEB_ACCESS_DEVICE_NAME } from './web-access-device'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function registryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-web-access-'))
  dirs.push(dir)
  return dir
}

describe('web access token (fork: http://host:port/?token=…)', () => {
  it('mints one runtime token row and keeps it across restarts', () => {
    const dir = registryDir()
    const first = new DeviceRegistry(dir).ensureWebAccessDevice(null)
    const reloaded = new DeviceRegistry(dir)
    expect(reloaded.ensureWebAccessDevice(null).token).toBe(first.token)
    expect(reloaded.validateToken(first.token)).toMatchObject({
      name: WEB_ACCESS_DEVICE_NAME,
      scope: 'runtime'
    })
    expect(reloaded.listDevices()).toHaveLength(1)
  })

  it('uses the operator token and revokes the previous one when it changes', () => {
    const registry = new DeviceRegistry(registryDir())
    const generated = registry.ensureWebAccessDevice(null)
    const fixed = registry.ensureWebAccessDevice('my-fixed-token-123')
    expect(fixed.token).toBe('my-fixed-token-123')
    expect(fixed.deviceId).toBe(generated.deviceId)
    expect(fixed.credentialRevision).toBe(1)
    expect(registry.validateToken(generated.token)).toBeNull()
    expect(registry.ensureWebAccessDevice('my-fixed-token-123').credentialRevision).toBe(1)
  })

  it('is never a pending pairing offer that rotation could drop', () => {
    const registry = new DeviceRegistry(registryDir())
    const access = registry.ensureWebAccessDevice(null)
    registry.rotatePendingDevice('CLI', 'runtime')
    expect(registry.validateToken(access.token)).not.toBeNull()
  })
})
