import { RuntimeHostDescriptorSchema } from '../../../shared/runtime-host-descriptor'
import { WEB_ACCESS_INFO_PATH } from '../../../shared/web-access-info'
import type { WebPairingOffer } from './web-pairing'

/**
 * Fork (web server): pair from a bare token. orcad serves the offer's public half at
 * WEB_ACCESS_INFO_PATH; the endpoint is the page's own host, so any address of the server works.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,256}$/

export function isWebAccessToken(input: string): boolean {
  return TOKEN_PATTERN.test(input.trim())
}

/** `?token=` (or `#token=`) on the page URL; removed by the caller once read. */
export function readWebAccessTokenFromLocation(location: Pick<Location, 'search' | 'hash'>): string | null {
  for (const params of [
    new URLSearchParams(location.search),
    new URLSearchParams(location.hash.replace(/^#/, ''))
  ]) {
    const token = params.get('token')?.trim()
    if (token && isWebAccessToken(token)) {
      return token
    }
  }
  return null
}

export function webAccessEndpointForPage(page: Pick<Location, 'protocol' | 'host'>): string {
  return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}`
}

export async function resolveWebAccessTokenOffer(
  token: string,
  page: Pick<Location, 'protocol' | 'host'> = window.location,
  fetchInfo: typeof fetch = fetch
): Promise<WebPairingOffer> {
  const response = await fetchInfo(WEB_ACCESS_INFO_PATH, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('This Orca server does not accept token access.')
  }
  const info: unknown = await response.json()
  const publicKeyB64 =
    typeof info === 'object' && info !== null && 'publicKeyB64' in info
      ? info.publicKeyB64
      : undefined
  if (typeof publicKeyB64 !== 'string' || publicKeyB64.length === 0) {
    throw new Error('This Orca server does not accept token access.')
  }
  const hostDescriptor = RuntimeHostDescriptorSchema.safeParse(
    typeof info === 'object' && info !== null && 'hostDescriptor' in info
      ? info.hostDescriptor
      : undefined
  ).data
  return {
    v: 2,
    endpoint: webAccessEndpointForPage(page),
    deviceToken: token.trim(),
    publicKeyB64,
    scope: 'runtime',
    ...(hostDescriptor ? { hostDescriptor } : {})
  }
}
