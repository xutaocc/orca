import type { RuntimeHostDescriptor } from './runtime-host-descriptor'

/** Fork (web server): served by orcad so a token alone is enough to pair a browser. */
export const WEB_ACCESS_INFO_PATH = '/orca-web-access.json'

export type WebAccessInfo = {
  /** The host's E2EE public key; every pairing offer carries it. */
  publicKeyB64: string
  hostDescriptor?: RuntimeHostDescriptor
}
