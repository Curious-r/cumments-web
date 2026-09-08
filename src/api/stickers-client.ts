import type { ClientContext } from "./context"
import { fetchStickers, type StickerPack } from "./stickers"

export class StickersClient {
  constructor(private ctx: ClientContext) {}

  async fetchPacks(signal?: AbortSignal): Promise<StickerPack[]> {
    return fetchStickers(this.ctx.endpoint, this.ctx.siteId, signal)
  }
}
