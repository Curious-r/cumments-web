import type { Message } from "../api/contract/query"

export interface CommentsSubmitPort {
  createPoll(
    question: string,
    options: string[],
    opts: {
      displayName: string
      replyToId: string | null
      threadRootId: string | null
    },
  ): Promise<void>
  submit(
    content: string,
    opts: {
      displayName: string
      replyToId: string | null
      threadRootId: string | null
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
      replyToId: replyToId,
      threadRootId: threadRoot,
      media: null,
    })
  }

  async submitPollFromIntent(
    poll: { question: string; options: string[]; maxSelections?: number },
    replyToId: string | null,
    displayName: string | null,
  ): Promise<void> {
    const q = poll.question.trim()
    if (!q) throw new Error("poll question required")
    const opts = poll.options.map((o) => o.trim()).filter((o) => o.length > 0)
    if (opts.length < 2) throw new Error("poll requires at least 2 options")
    const normalizedDisplayName = displayName?.trim() ? displayName.trim() : "Anonymous"
    const threadRoot = this.deriveThreadRootFor(replyToId)
    await this.submitPort.createPoll(q, opts, {
      displayName: normalizedDisplayName,
      replyToId: replyToId,
      threadRootId: threadRoot,
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
