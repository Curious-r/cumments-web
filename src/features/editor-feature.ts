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

/**
 * Canonical composer context: which discussion the composer participates in
 * (`threadRootId`) and which message it directly responds to (`replyToId`).
 * The two fields are independent — neither implies the other:
 *
 * | threadRootId | replyToId | Context                  |
 * | ------------ | --------- | ------------------------ |
 * | null         | null      | main, new comment        |
 * | null         | A         | main, reply to A         |
 * | A            | null      | thread A, general reply  |
 * | A            | B         | thread A, reply to B     |
 */
export interface ComposerContext {
  threadRootId: string | null
  replyToId: string | null
}

export class EditorFeature {
  private composerContext: ComposerContext = { threadRootId: null, replyToId: null }

  constructor(
    private readonly submitPort: CommentsSubmitPort,
    private readonly mediaPort?: MediaUploadPort,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for future sticker port
    private readonly stickersPort?: StickersPort,
  ) {}

  /** Current composer context (copy). */
  getComposerContext(): ComposerContext {
    return { ...this.composerContext }
  }

  /**
   * Explicit whole-context assignment. Values are stored as given — neither
   * field is derived from, rewritten to, or cleared by the other.
   */
  setComposerContext(ctx: ComposerContext): void {
    this.composerContext = {
      threadRootId: ctx.threadRootId ?? null,
      replyToId: ctx.replyToId ?? null,
    }
  }

  /**
   * Updates only the reply target while preserving the active Thread scope.
   * Used by the editor's reply-draft lifecycle (set/cancel/clear-after-submit).
   */
  setReplyTarget(replyToId: string | null): void {
    this.composerContext = {
      threadRootId: this.composerContext.threadRootId,
      replyToId: replyToId ?? null,
    }
  }

  /**
   * Submits a plain text message using the current ComposerContext as the
   * single source of the relation fields. The context is captured before any
   * await so post-submit composer resets cannot alter the submitted relations.
   */
  async submitFromIntent(content: string, displayName: string | null): Promise<void> {
    const trimmedContent = content.trim()
    if (!trimmedContent) return
    const { replyToId, threadRootId } = this.composerContext
    const normalizedDisplayName = displayName?.trim() ? displayName.trim() : "Anonymous"
    await this.submitPort.submit(trimmedContent, {
      displayName: normalizedDisplayName,
      replyToId,
      threadRootId,
      media: null,
    })
  }

  /**
   * Submits a poll using the current ComposerContext as the single source of
   * the relation fields (captured before any await; see submitFromIntent).
   */
  async submitPollFromIntent(
    poll: { question: string; options: string[]; maxSelections?: number },
    displayName: string | null,
  ): Promise<void> {
    const q = poll.question.trim()
    if (!q) throw new Error("poll question required")
    const opts = poll.options.map((o) => o.trim()).filter((o) => o.length > 0)
    if (opts.length < 2) throw new Error("poll requires at least 2 options")
    const { replyToId, threadRootId } = this.composerContext
    const normalizedDisplayName = displayName?.trim() ? displayName.trim() : "Anonymous"
    await this.submitPort.createPoll(q, opts, {
      displayName: normalizedDisplayName,
      replyToId,
      threadRootId,
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
