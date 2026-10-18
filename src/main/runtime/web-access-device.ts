import { mintDeviceCredential } from './device-credential'
import type { DeviceEntry, TokenDeviceEntry } from './device-entry'

/** Fork (web server): the one runtime row behind `http://host:port/?token=…`, found by name. */
export const WEB_ACCESS_DEVICE_NAME = 'Web access token'

/**
 * `token` (ORCA_TOKEN / --token) replaces the row's bearer; null keeps the existing one, or
 * mints one. `nextDevices` is null when nothing needs writing.
 */
export function planWebAccessDevice(
  devices: readonly DeviceEntry[],
  token: string | null,
  now: number
): { entry: TokenDeviceEntry; nextDevices: DeviceEntry[] | null } {
  const existing = devices.find(
    (d): d is TokenDeviceEntry =>
      d.name === WEB_ACCESS_DEVICE_NAME && d.token !== undefined && d.credentialKind === undefined
  )
  if (existing && (token === null || existing.token === token)) {
    return { entry: existing, nextDevices: null }
  }
  if (existing && token !== null) {
    // Why bump: sockets authenticated with the old token must not outlive the change.
    const entry: TokenDeviceEntry = {
      ...existing,
      token,
      credentialRevision: (existing.credentialRevision ?? 0) + 1
    }
    return { entry, nextDevices: devices.map((d) => (d === existing ? entry : d)) }
  }
  const minted = mintDeviceCredential()
  const entry: TokenDeviceEntry = {
    deviceId: minted.deviceId,
    token: token ?? minted.token,
    name: WEB_ACCESS_DEVICE_NAME,
    scope: 'runtime',
    pairedAt: now,
    // Why non-zero: a never-seen row is a pending offer that rotation may drop.
    lastSeenAt: now,
    pairingReach: 'network'
  }
  return { entry, nextDevices: [...devices, entry] }
}
