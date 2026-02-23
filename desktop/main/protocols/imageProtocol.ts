import { protocol } from 'electron'
import { DesktopProxyError, fetchImage } from '../services/network.js'

const IMAGE_SCHEME = 'rssive-image'

const buildJsonResponse = (status: number, message: string) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export const registerImageProtocol = () => {
  protocol.handle(IMAGE_SCHEME, async request => {
    let requestUrl: URL
    try {
      requestUrl = new URL(request.url)
    } catch {
      return buildJsonResponse(400, 'Invalid request url')
    }

    if (requestUrl.hostname !== 'proxy') {
      return buildJsonResponse(404, 'Unknown image endpoint')
    }

    const target = requestUrl.searchParams.get('url') || ''
    if (!target) {
      return buildJsonResponse(400, 'Missing url param')
    }

    try {
      const proxied = await fetchImage({ url: target })
      const bytes = Buffer.from(proxied.bodyBase64 || '', 'base64')
      return new Response(bytes, {
        status: proxied.status,
        headers: proxied.headers,
      })
    } catch (error) {
      const status = error instanceof DesktopProxyError ? error.status : 502
      const message = error instanceof Error ? error.message : 'Image proxy error'
      return buildJsonResponse(status, message)
    }
  })
}
