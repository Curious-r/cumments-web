import type { Message } from "../api/contract/query"

export interface CommentsSubmitPort {
  submit(
    content: string,
    opts: {
      displayName: string
      replyTo: string | null
      threadRoot: string | null
      media?: { url: string; kind: string } | null
    },
  ): Promise<void>
  getMessage(eventId: string): Message | undefined
}

export interface MediaUploadPort {
  upload(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<{
    url: string
    filename: string | null
    mimetype: string | null
    size: number | null
    voice: boolean
  }>
}

export interface StickersPort {
  packs: unknown[] | null
  loading: boolean
  ensureLoaded(): Promise<void>
}

export class EditorFeature {
  constructor(
    private readonly submitPort: CommentsSubmitPort,
    private readonly mediaPort?: MediaUploadPort,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for future sticker port
    private readonly stickersPort?: StickersPort,
  ) {}

  deriveThreadRoot(target: Message | null): string | null {
    if (!target) return null
    return (
      (target.thread_root as string | null) ?? (target.reply_to as string | null) ?? target.event_id
    )
  }

  deriveThreadRootFor(replyToId: string | null): string | null {
    if (!replyToId) return null
    const target = this.submitPort.getMessage(replyToId) ?? null
    return this.deriveThreadRoot(target)
  }

  async submitFromIntent(
    content: string,
    replyToId: string | null,
    displayName: string | null,
  ): Promise<void> {
    const trimmedContent = content.trim()
    if (!trimmedContent) return
    const normalizedDisplayName = displayName?.trim() ? displayName.trim() : "Anonymous"
    const threadRoot = this.deriveThreadRootFor(replyToId)
    await this.submitPort.submit(trimmedContent, {
      displayName: normalizedDisplayName,
      replyTo: replyToId,
      threadRoot,
      media: null,
    })
  }

  async uploadMedia(
    file: File,
    signal?: AbortSignal,
  ): Promise<{
    url: string
    filename: string | null
    mimetype: string | null
    size: number | null
    voice: boolean
  } | null> {
    if (!this.mediaPort) throw new Error("media upload not available")
    return this.mediaPort.upload(file, { signal })
  }
}
