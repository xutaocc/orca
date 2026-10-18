import type { IncomingMessage, ServerResponse } from 'node:http'
import { WEB_ACCESS_INFO_PATH, type WebAccessInfo } from '../../../shared/web-access-info'

/**
 * Fork (web server): the public half of a pairing offer, so a browser holding only a token
 * (`/?token=…` or typed in) can build the offer itself. Carries no credential.
 */
export function handleWebAccessInfoRequest(
  request: IncomingMessage,
  response: ServerResponse,
  readInfo: () => WebAccessInfo | null
): boolean {
  if (request.method !== 'GET' || pathnameOf(request.url) !== WEB_ACCESS_INFO_PATH) {
    return false
  }
  const info = readInfo()
  response.statusCode = info ? 200 : 503
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(info ? JSON.stringify(info) : '{}')
  return true
}

function pathnameOf(rawUrl: string | undefined): string | null {
  try {
    return new URL(rawUrl ?? '/', 'http://127.0.0.1').pathname
  } catch {
    return null
  }
}
