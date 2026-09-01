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
  const base = endpoint.replace(/\/$/, "")
  const url = `${base}/api/v1/sites/${encodeURIComponent(siteId)}/stickers`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`failed to load stickers ${res.status}`)
  }
  const data = (await res.json()) as { packs: StickerPack[] }
  return data.packs ?? []
}
