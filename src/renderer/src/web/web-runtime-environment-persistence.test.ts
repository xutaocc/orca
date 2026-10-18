import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

import { setWebDeviceKeySupportForTests } from './web-device-key-support'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from './web-runtime-environment'

const offer = {
  v: 2 as const,
  endpoint: 'ws://192.168.66.192:6800',
  deviceToken: 'code',
  publicKeyB64: 'host-key'
}

describe('web pairing persistence (fork: survives reload on LAN/Tailscale http pages)', () => {
  let items: Map<string, string>
  beforeEach(() => {
    items = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key)
      }
    })
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' })
  })
  afterEach(() => {
    setWebDeviceKeySupportForTests(null)
    vi.unstubAllGlobals()
  })

  it('stores a plain-http remote pairing in localStorage', () => {
    setWebDeviceKeySupportForTests('session-insecure-origin')
    const environment = createStoredWebRuntimeEnvironment({ name: 'Server', offer })
    expect(environment.sessionOnly).toBeUndefined()
    saveStoredWebRuntimeEnvironment(environment)
    expect(items.size).toBe(1)
    expect(readStoredWebRuntimeEnvironment()?.endpoints[0]?.deviceToken).toBe('code')
  })

  it('still keeps a no-Ed25519 pairing in memory only', () => {
    setWebDeviceKeySupportForTests('session-no-ed25519')
    const environment = createStoredWebRuntimeEnvironment({ name: 'Server', offer })
    expect(environment.sessionOnly).toBe(true)
    saveStoredWebRuntimeEnvironment(environment)
    expect(items.size).toBe(0)
  })
})
