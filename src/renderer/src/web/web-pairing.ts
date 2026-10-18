import {
  RuntimeHostDescriptorSchema,
  type RuntimeHostDescriptor
} from '../../../shared/runtime-host-descriptor'
import type { DeviceScope } from '../../../shared/runtime-types'

const PAIRING_OFFER_VERSION = 2

export type WebPairingOffer = {
  v: typeof PAIRING_OFFER_VERSION
  endpoint: string
  deviceToken: string
  publicKeyB64: string
  pairedDeviceId?: string
  scope?: DeviceScope
  hostDescriptor?: RuntimeHostDescriptor
}

export type WebPairingStartupDecision =
  | { kind: 'auto-save-runtime-offer'; offer: WebPairingOffer }
  | { kind: 'show-connect'; initialPairingInput: string | null }
  | { kind: 'use-stored-environment' }

export function parseWebPairingInput(
  input: string,
  page: PageAddress | null = currentPageAddress()
): WebPairingOffer | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  try {
    const offer = trimmed.toLowerCase().startsWith('orca://')
      ? decodeCodeFromUrl(trimmed)
      : decodePairingPayload(trimmed)
    return offer && page ? followPageHost(offer, page) : offer
  } catch {
    return null
  }
}

function decodeCodeFromUrl(url: string): WebPairingOffer | null {
  const code = extractPairingCodeFromUrl(url)
  return code ? decodePairingPayload(code) : null
}

export type PageAddress = Pick<Location, 'protocol' | 'hostname' | 'port'>

function currentPageAddress(): PageAddress | null {
  return typeof window === 'undefined' ? null : window.location
}

/**
 * Fork note (web server): the offer names one host address, but the page may be reached through
 * any of the server's addresses (LAN, Tailscale, ZeroTier, a hostname) or an https proxy. When
 * orcad served this page itself (same port, http) or a proxy did (https), dial back the page host.
 */
export function followPageHost(offer: WebPairingOffer, page: PageAddress): WebPairingOffer {
  const endpoint = followPageHostEndpoint(offer.endpoint, page)
  return endpoint === offer.endpoint ? offer : { ...offer, endpoint }
}

export function followPageHostEndpoint(endpoint: string, page: PageAddress): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return endpoint
  }
  if (page.hostname.length === 0 || (url.pathname !== '/' && url.pathname !== '')) {
    return endpoint
  }
  // An https page (e.g. `tailscale serve`) can never dial ws://, so the proxy in front of it is the only route.
  if (page.protocol === 'https:' && url.protocol === 'ws:') {
    return `wss://${page.hostname}${page.port ? `:${page.port}` : ''}`
  }
  const servedByEndpoint = url.protocol === 'ws:' && page.protocol === 'http:' && url.port === page.port
  if (!servedByEndpoint || url.hostname === page.hostname) {
    return endpoint
  }
  url.hostname = page.hostname
  return url.toString().replace(/\/$/, '')
}

export function readPairingInputFromLocation(location: Location): string | null {
  const search = new URLSearchParams(location.search)
  for (const key of ['pairing', 'pair', 'code', 'token']) {
    const value = search.get(key)
    if (value?.trim()) {
      return value.trim()
    }
  }

  const hash = location.hash.replace(/^#/, '').trim()
  if (!hash) {
    return null
  }
  if (hash.startsWith('orca://pair')) {
    return hash
  }
  const hashParams = new URLSearchParams(hash)
  for (const key of ['pairing', 'pair', 'code', 'token']) {
    const value = hashParams.get(key)
    if (value?.trim()) {
      return value.trim()
    }
  }
  return hash
}

export function decideWebPairingStartup(args: {
  initialPairingInput: string | null
  hasStoredEnvironment: boolean
}): WebPairingStartupDecision {
  const offer = args.initialPairingInput ? parseWebPairingInput(args.initialPairingInput) : null
  if (offer?.scope === 'runtime') {
    return { kind: 'auto-save-runtime-offer', offer }
  }
  if (offer) {
    return { kind: 'show-connect', initialPairingInput: args.initialPairingInput }
  }
  return args.hasStoredEnvironment
    ? { kind: 'use-stored-environment' }
    : { kind: 'show-connect', initialPairingInput: null }
}

export function clearPairingInputFromAddressBar(): void {
  if (!window.location.hash && !window.location.search) {
    return
  }
  const cleanUrl = `${window.location.origin}${window.location.pathname}`
  // Why: pairing payloads include the runtime auth token. Clear them after
  // import so refresh/share/browser history no longer expose the secret.
  window.history.replaceState(null, document.title, cleanUrl)
}

function decodePairingPayload(base64url: string): WebPairingOffer | null {
  const json = new TextDecoder().decode(base64UrlToBytes(base64url))
  const parsed = JSON.parse(json) as Partial<WebPairingOffer>
  if (
    parsed.v !== PAIRING_OFFER_VERSION ||
    typeof parsed.endpoint !== 'string' ||
    parsed.endpoint.length === 0 ||
    typeof parsed.deviceToken !== 'string' ||
    parsed.deviceToken.length === 0 ||
    typeof parsed.publicKeyB64 !== 'string' ||
    parsed.publicKeyB64.length === 0
  ) {
    return null
  }
  const scope = parseWebPairingScope(parsed.scope)
  const pairedDeviceId =
    typeof parsed.pairedDeviceId === 'string' && parsed.pairedDeviceId.length > 0
      ? parsed.pairedDeviceId
      : null
  // Why safeParse: a descriptor this build cannot read is dropped, never a reason to refuse pairing.
  const hostDescriptor = RuntimeHostDescriptorSchema.safeParse(parsed.hostDescriptor).data
  return {
    v: PAIRING_OFFER_VERSION,
    endpoint: normalizeWebSocketEndpoint(parsed.endpoint),
    deviceToken: parsed.deviceToken,
    publicKeyB64: parsed.publicKeyB64,
    ...(pairedDeviceId ? { pairedDeviceId } : {}),
    ...(scope ? { scope } : {}),
    ...(hostDescriptor ? { hostDescriptor } : {})
  }
}

function parseWebPairingScope(value: unknown): DeviceScope | null {
  return value === 'mobile' || value === 'runtime' ? value : null
}

function extractPairingCodeFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // Why: prefix checks accepted routes like `orca://pairing?...`; only the
  // pairing deep-link host may carry runtime auth material.
  if (parsed.protocol !== 'orca:' || parsed.hostname !== 'pair') {
    return null
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return null
  }
  const code = parsed.searchParams.get('code')
  if (code) {
    return code
  }
  return parsed.hash ? parsed.hash.slice(1) || null : null
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function normalizeWebSocketEndpoint(endpoint: string): string {
  if (endpoint.startsWith('http://')) {
    return `ws://${endpoint.slice('http://'.length)}`
  }
  if (endpoint.startsWith('https://')) {
    return `wss://${endpoint.slice('https://'.length)}`
  }
  return endpoint
}
