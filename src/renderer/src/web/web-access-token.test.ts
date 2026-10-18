import { describe, expect, it, vi } from 'vitest'
import {
  isWebAccessToken,
  readWebAccessTokenFromLocation,
  resolveWebAccessTokenOffer
} from './web-access-token'

describe('web access token', () => {
  it('reads ?token= and #token= from the page URL', () => {
    expect(readWebAccessTokenFromLocation({ search: '?token=abcdef123456', hash: '' })).toBe(
      'abcdef123456'
    )
    expect(readWebAccessTokenFromLocation({ search: '', hash: '#token=abcdef123456' })).toBe(
      'abcdef123456'
    )
    expect(readWebAccessTokenFromLocation({ search: '?token=short', hash: '' })).toBeNull()
    expect(readWebAccessTokenFromLocation({ search: '', hash: '#pairing=orca%3A' })).toBeNull()
  })

  it('tells a token apart from a pairing URL', () => {
    expect(isWebAccessToken('05c423dba89928a9489d1e7ba2777038e40e1fa13c08ea1f')).toBe(true)
    expect(isWebAccessToken('orca://pair?code=abc')).toBe(false)
  })

  it('builds a runtime offer that dials the page host', async () => {
    const fetchInfo = vi.fn(
      async () =>
        new Response(JSON.stringify({ publicKeyB64: 'host-key' }), { status: 200 })
    )
    const offer = await resolveWebAccessTokenOffer(
      ' my-token-123 ',
      { protocol: 'http:', host: '100.64.0.7:6800' },
      fetchInfo
    )
    expect(offer).toEqual({
      v: 2,
      endpoint: 'ws://100.64.0.7:6800',
      deviceToken: 'my-token-123',
      publicKeyB64: 'host-key',
      scope: 'runtime'
    })
    const tls = await resolveWebAccessTokenOffer(
      'my-token-123',
      { protocol: 'https:', host: 'pc.tail1.ts.net' },
      fetchInfo
    )
    expect(tls.endpoint).toBe('wss://pc.tail1.ts.net')
  })

  it('refuses a server without token access', async () => {
    const fetchInfo = vi.fn(async () => new Response('', { status: 404 }))
    await expect(
      resolveWebAccessTokenOffer('my-token-123', { protocol: 'http:', host: 'h:1' }, fetchInfo)
    ).rejects.toThrow('does not accept token access')
  })
})
