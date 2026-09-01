import { HttpTransport } from "./transport"

export interface StickerImage {
  shortcode: string
  url: string
  proxy_url?: string | null
  body?: string | null
  info?: Record<string, unknown> | null
}

export interface StickerPack {
  pack_id: string
  display_name?: string | null
  avatar_url?: string | null
  avatar_proxy_url?: string | null
  images: StickerImage[]
}

export async function fetchStickers(
  endpoint: string,
  siteId: string,
  signal?: AbortSignal,
): Promise<StickerPack[]> {
  const transport = new HttpTransport(endpoint)
  const path = `/api/v1/sites/${encodeURIComponent(siteId)}/stickers`
  try {
    const res = await transport.request<{ packs: StickerPack[] }>("GET", path, {
      signal,
    })
    return res.data.packs ?? []
  } catch (e) {
    // Preserve 404 -> empty array behavior
    const err = e as { status?: number }
    if (err && err.status === 404) return []
    throw e
  }
}
