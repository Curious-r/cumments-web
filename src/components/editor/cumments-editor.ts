import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../../api/contract/query"
import type { StickerPack } from "../../api/stickers"
import { resolveLocale } from "../../i18n/locale"
import { messages } from "../../i18n/messages"
import { validatePoll } from "../../utils/poll"

export type PollDraft = {
  question: string
  options: string[]
  maxSelections?: number
}

export interface CummentsSubmitDetail {
  content: string
  replyToId: string | null
  displayName: string
  media?: { url: string; kind: string } | null
  geoUri?: string | null
  poll?: { question: string; options: string[]; maxSelections?: number } | null
}

/**
 * <cumments-editor>
 * Light DOM editor inside parent ShadowRoot. Owns draft, replyToId,
 * file input, sticker picker, location and upload presentation state.
 * Must not call fetch, MediaApi, SigningPipeline, HttpTransport directly.
 */
@customElement("cumments-editor")
export class CummentsEditor extends LitElement {
  // Light DOM - no shadow
  createRenderRoot() {
    return this
  }

  @property() lang = "en"
  @property() profileName = ""
  @property() profileAvatar: string | null = null
  @property({ attribute: false }) stickerPacks: StickerPack[] | null = null
  @property({ attribute: false }) stickerLoading = false

  // Injected capabilities (wired by AppRuntime via parent)
  @property({ attribute: false }) getMessage?: (id: string) => Message | undefined
  @property({ attribute: false }) uploadMedia?: (
    file: File,
    opts?: { signal?: AbortSignal },
  ) => Promise<{
    url: string
    filename: string | null
    mimetype: string | null
    size: number | null
    voice: boolean
  }>
  @property({ attribute: false }) onProfileClick?: () => void
  @state() private draft = ""
  @state() private replyToId: string | null = null
  @state() private showStickers = false
  @state() private pendingSticker: { url: string; kind: string; shortcode: string } | null = null
  @state() private pendingMedia: { url: string; kind: string; filename: string | null } | null =
    null
  @state() private mediaUploading = false
  @state() private mediaError: string | null = null
  @state() private locationSharing = false
  @state() private locationError: string | null = null
  @state() private pendingLocation: string | null = null
  @state() private focused = false
  @state() private pollDraft: PollDraft | null = null
  @state() private pollErrors: {
    question?: string
    options: (string | null)[]
    general?: string
  } | null = null

  // For testing / parent imperative access
  get currentDraft(): string {
    return this.draft
  }
  get currentReplyToId(): string | null {
    return this.replyToId
  }
  get currentPollDraft(): PollDraft | null {
    return this.pollDraft ? { ...this.pollDraft, options: [...this.pollDraft.options] } : null
  }

  setReplyToId(id: string | null) {
    this.replyToId = id
    this.requestUpdate()
  }

  private boundWindowClick: ((e: MouseEvent) => void) | null = null

  private addWindowListeners(): void {
    if (this.boundWindowClick) return
    this.boundWindowClick = (e: MouseEvent) => {
      if (!this.showStickers) return
      const path = e.composedPath() as EventTarget[]
      let inside = false
      for (const t of path) {
        if (!(t instanceof HTMLElement)) continue
        if (
          t.closest('[role="dialog"][aria-label="Stickers"]') ||
          t.closest('button[aria-label="Stickers"]')
        )
          inside = true
      }
      if (inside) return
      this.showStickers = false
      this.requestUpdate()
      this.updateComplete.then(() => {
        const btn = this.querySelector('button[aria-label="Stickers"]') as HTMLElement | null
        btn?.focus()
      })
    }
    window.addEventListener("click", this.boundWindowClick, true)
  }

  private removeWindowListeners(): void {
    if (this.boundWindowClick) {
      window.removeEventListener("click", this.boundWindowClick, true)
      this.boundWindowClick = null
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("showStickers")) {
      if (this.showStickers) this.addWindowListeners()
      else this.removeWindowListeners()
    }
  }

  disconnectedCallback(): void {
    this.removeWindowListeners()
    super.disconnectedCallback()
  }

  private handleDraftInput = (e: Event) => {
    this.draft = (e.target as HTMLInputElement).value
  }

  private handleFocus = () => {
    this.focused = true
  }

  private handleBlur = (_e: FocusEvent) => {
    // Delay to allow click on tool row
    setTimeout(() => {
      if (!this.contains(document.activeElement)) {
        this.focused = false
      }
    }, 100)
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void this.handleSubmit()
    } else if (e.key === "Escape") {
      if (this.pollDraft) {
        e.preventDefault()
        e.stopPropagation()
        this.handleCancelPoll()
        return
      }
      if (this.replyToId) {
        this.replyToId = null
      }
    }
  }

  private handlePollQuestionInput = (e: Event) => {
    if (!this.pollDraft) return
    const val = (e.target as HTMLInputElement).value
    this.pollDraft = { ...this.pollDraft, question: val }
    this.pollErrors = null
  }

  private handlePollOptionInput = (idx: number, e: Event) => {
    if (!this.pollDraft) return
    const val = (e.target as HTMLInputElement).value
    const next = [...this.pollDraft.options]
    next[idx] = val
    this.pollDraft = { ...this.pollDraft, options: next }
    this.pollErrors = null
  }

  private handleAddOption = () => {
    if (!this.pollDraft) return
    if (this.pollDraft.options.length >= 20) return
    this.pollDraft = {
      ...this.pollDraft,
      options: [...this.pollDraft.options, ""],
    }
    this.pollErrors = null
    this.updateComplete.then(() => {
      const inputs = this.querySelectorAll('input[aria-label^="Option"]')
      const last = inputs[inputs.length - 1] as HTMLElement | null
      last?.focus()
    })
  }

  private handleRemoveOption = (idx: number) => {
    if (!this.pollDraft) return
    if (this.pollDraft.options.length <= 2) return
    const next = this.pollDraft.options.filter((_, i) => i !== idx)
    this.pollDraft = { ...this.pollDraft, options: next }
    this.pollErrors = null
  }

  private handlePollToggle = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    if (this.pollDraft) {
      this.handleCancelPoll()
      return
    }
    this.pendingSticker = null
    this.pendingMedia = null
    this.pendingLocation = null
    this.mediaError = null
    this.locationError = null
    this.pollDraft = { question: "", options: ["", ""] }
    this.pollErrors = null
    this.focused = true
    this.updateComplete.then(() => {
      const q = this.querySelector('input[aria-label="Poll question"]') as HTMLElement | null
      q?.focus()
    })
  }

  private handleCancelPoll = () => {
    const btn = this.querySelector(
      'button[aria-label="Create poll"], button[aria-label="Poll"]',
    ) as HTMLElement | null
    this.pollDraft = null
    this.pollErrors = null
    this.requestUpdate()
    this.updateComplete.then(() => btn?.focus())
  }

  private validatePoll(): boolean {
    if (!this.pollDraft) return true
    const { questionError, optionErrors, generalError } = validatePoll(
      this.pollDraft.question,
      this.pollDraft.options,
    )
    const hasOptionError = optionErrors.some((e) => e !== null)
    if (questionError || generalError || hasOptionError) {
      this.pollErrors = {
        question: questionError ?? undefined,
        options: optionErrors,
        general: generalError ?? undefined,
      }
      // Map backend messages to i18n keys where appropriate
      if (this.pollErrors.question === "Question is required")
        this.pollErrors.question = "Question is required"
      if (this.pollErrors.question === "Question is too long")
        this.pollErrors.question = "Question is too long"
      return false
    }
    this.pollErrors = null
    return true
  }

  private async handleSubmit(): Promise<void> {
    if (this.pollDraft) {
      const isValid = this.validatePoll()
      if (!isValid) return
      const replyToId = this.replyToId
      const displayName = this.profileName
      const question = this.pollDraft.question.trim()
      const options = this.pollDraft.options.map((o) => o.trim()).filter((o) => o.length > 0)
      const detail: CummentsSubmitDetail = {
        content: question,
        replyToId,
        displayName,
        poll: { question, options, maxSelections: 1 },
      }
      this.dispatchEvent(
        new CustomEvent("cumments:submit", {
          detail,
          bubbles: true,
          composed: true,
        }),
      )
      this.pollDraft = null
      this.pollErrors = null
      this.replyToId = null
      this.requestUpdate()
      return
    }
    const content = this.draft.trim()
    const hasSticker = !!this.pendingSticker
    const hasMedia = !!this.pendingMedia
    const hasLocation = !!this.pendingLocation
    if (!content && !hasSticker && !hasMedia && !hasLocation) return
    const replyToId = this.replyToId
    const displayName = this.profileName
    const pendingAttachment = this.pendingMedia ?? this.pendingSticker
    const media = pendingAttachment
      ? { url: pendingAttachment.url, kind: pendingAttachment.kind }
      : undefined
    const effectiveContent =
      content ||
      this.pendingSticker?.shortcode ||
      this.pendingMedia?.filename ||
      this.pendingSticker?.url ||
      this.pendingMedia?.url ||
      this.pendingLocation ||
      ""
    const detail: CummentsSubmitDetail = {
      content: effectiveContent,
      replyToId,
      displayName,
      ...(media ? { media } : {}),
      ...(this.pendingLocation ? { geoUri: this.pendingLocation } : {}),
    }
    this.dispatchEvent(
      new CustomEvent("cumments:submit", {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
    // Optimistic clear (parent will handle actual API; on failure parent could restore via event)
    this.draft = ""
    this.pendingSticker = null
    this.pendingMedia = null
    this.pendingLocation = null
    // Keep replyToId cleared after submit
    this.replyToId = null
  }

  private handleCancelReply = () => {
    this.replyToId = null
  }

  private handleMediaSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      input.value = ""
      return
    }
    if (this.pollDraft) {
      this.pollDraft = null
      this.pollErrors = null
    }
    if (!this.uploadMedia) {
      this.mediaError = "Upload not available"
      input.value = ""
      return
    }
    this.mediaUploading = true
    this.mediaError = null
    try {
      const result = await this.uploadMedia(file)
      this.pendingMedia = {
        url: result.url,
        kind: result.mimetype ?? "image",
        filename: result.filename ?? file.name,
      }
      this.pendingSticker = null
      this.focused = true
    } catch (err) {
      this.mediaError = err instanceof Error ? err.message : String(err)
      this.pendingMedia = null
    } finally {
      this.mediaUploading = false
      input.value = ""
    }
  }

  private handleStickerToggle = (e: Event) => {
    e.stopPropagation()
    const willOpen = !this.showStickers
    if (willOpen) {
      this.focused = true
      this.showStickers = true
      this.dispatchEvent(
        new CustomEvent("cumments:sticker-toggle", {
          detail: { open: true },
          bubbles: true,
          composed: true,
        }),
      )
      this.updateComplete.then(() => {
        const picker = this.querySelector(
          '[role="dialog"][aria-label="Stickers"]',
        ) as HTMLElement | null
        const first = picker?.querySelector("button") as HTMLElement | null
        first?.focus()
      })
    } else {
      this.showStickers = false
      this.updateComplete.then(() => {
        const btn = this.querySelector('button[aria-label="Stickers"]') as HTMLElement | null
        btn?.focus()
      })
    }
  }

  closeStickerPicker(): void {
    if (!this.showStickers) return
    this.showStickers = false
    this.requestUpdate()
  }

  private handleStickerPickerClose = () => {
    this.showStickers = false
    this.updateComplete.then(() => {
      const btn = this.querySelector('button[aria-label="Stickers"]') as HTMLElement | null
      btn?.focus()
    })
  }

  private handleStickerPickerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleStickerPickerClose()
    }
  }

  private handleStickerPick = (e: Event) => {
    const target = e.currentTarget as HTMLElement
    const url = target.dataset.stickerUrl
    const kind = target.dataset.stickerKind ?? "sticker"
    const shortcode = target.dataset.stickerShortcode ?? ""
    if (!url) return
    const trigger = this.querySelector('button[aria-label="Stickers"]') as HTMLElement | null
    if (this.pollDraft) {
      this.pollDraft = null
      this.pollErrors = null
    }
    this.pendingSticker = { url, kind, shortcode }
    this.showStickers = false
    this.updateComplete.then(() => {
      if (trigger) trigger.focus()
    })
  }

  private handleLocationShare = async () => {
    if (!navigator.geolocation) {
      this.locationError = "Geolocation not available"
      return
    }
    this.locationSharing = true
    this.locationError = null
    try {
      const pos: GeolocationPosition = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
        }),
      )
      const geoUri = `geo:${pos.coords.latitude},${pos.coords.longitude}`
      if (this.pollDraft) {
        this.pollDraft = null
        this.pollErrors = null
      }
      this.pendingLocation = geoUri
      this.focused = true
    } catch (err) {
      const msg = (err as { message?: string })?.message || String(err)
      this.locationError = msg || "Failed to share location"
      this.pendingLocation = null
    } finally {
      this.locationSharing = false
    }
  }

  render() {
    const t = messages[resolveLocale(this.lang)]
    let replyDisplayName = ""
    let hasReply = false
    if (this.replyToId) {
      hasReply = true
      if (this.getMessage) {
        const target = this.getMessage(this.replyToId)
        if (target) {
          replyDisplayName = target.author.display_name ?? t.reactorUnknown
        } else {
          replyDisplayName = t.reactorUnknown
        }
      } else {
        replyDisplayName = t.reactorUnknown
      }
    }

    const hasPoll = !!this.pollDraft
    const isCollapsed =
      !this.focused &&
      !this.draft &&
      !hasReply &&
      !this.mediaUploading &&
      !this.locationSharing &&
      !this.showStickers &&
      !this.pendingSticker &&
      !this.pendingMedia &&
      !this.pendingLocation &&
      !hasPoll
    return html`<style>
@media (max-width: 479px) {
  .editor-input-row {
    flex-wrap: wrap;
  }

  input[aria-label="Comment"] {
    flex: 1 1 120px;
    min-width: 0;
  }

  .editor-toolbar {
    flex-wrap: wrap;
  }
}
</style><div class="editor" part="editor" style="flex-direction:column;gap:8px" @focusin=${this.handleFocus} @focusout=${this.handleBlur}>
      ${
        isCollapsed
          ? html`<div @click=${() => {
              this.focused = true
              setTimeout(
                () =>
                  (
                    this.querySelector('input[aria-label="Comment"]') as HTMLElement | null
                  )?.focus(),
                0,
              )
            }} style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#94a3b8;cursor:text;font-size:14px;background:#f8fafc">${t.commentPlaceholder}</div>`
          : html``
      }
      <div style="display:${isCollapsed ? "none" : "flex"};flex-direction:column;gap:8px">
      ${
        hasReply
          ? html`<div style="font-size:12px;color:#4f46e5;display:flex;justify-content:space-between;align-items:center;background:#eef2ff;border-radius:8px;padding:6px 10px">
            <span>${t.replyingTo.replace("{name}", replyDisplayName)}</span>
            <button
              style="background:none;border:none;color:#4f46e5;cursor:pointer;font-size:12px"
              aria-label="${t.cancelReply}"
              @click=${this.handleCancelReply}
            >${t.cancelReply}</button>
          </div>`
          : ""
      }
      <div class="editor-display-name" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;margin-bottom:4px">
        <span>Commenting as</span>
        <button
          aria-label="Edit profile"
          @click=${() => this.onProfileClick?.()}
          style="display:flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:999px;padding:2px 6px;cursor:pointer"
        >
          ${this.profileAvatar ? html`<img src="${this.profileAvatar}" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover" />` : html`<span style="width:16px;height:16px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px">${(this.profileName?.[0] ?? "?").toUpperCase()}</span>`}
          <span>${this.profileName || "Anonymous"}</span>
        </button>
      </div>
      <div class="editor-input-row" style="display:flex;gap:8px;width:100%">
        <input
          part="input"
          aria-label="${t.commentAriaLabel}"
          placeholder="${t.commentPlaceholder}"
          .value=${this.draft}
          @input=${this.handleDraftInput}
          @keydown=${this.handleKeydown}
        />
        <button part="button" aria-label="${t.postAriaLabel}" @click=${() => void this.handleSubmit()} ?disabled=${(hasPoll ? false : !this.draft.trim() && !this.pendingSticker && !this.pendingMedia && !this.pendingLocation) || this.mediaUploading || this.locationSharing} style="opacity:${(hasPoll ? false : !this.draft.trim() && !this.pendingSticker && !this.pendingMedia && !this.pendingLocation) ? "0.5" : "1"}">${t.postLabel}</button>
      </div>
      <div class="editor-toolbar" style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.mediaUploading ? "0.5" : "1"}">
          📎 <span class="tool-label-text">Attach</span>
          <input type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip" style="display:none" @change=${this.handleMediaSelect} ?disabled=${this.mediaUploading} />
        </label>
        ${this.mediaUploading ? html`<span style="font-size:11px;color:#64748b">Uploading…</span>` : ""}
        ${this.mediaError ? html`<span style="font-size:11px;color:#ef4444">${this.mediaError}</span>` : ""}
        <button style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.locationSharing ? "0.5" : "1"}" @click=${() => void this.handleLocationShare()} ?disabled=${this.locationSharing}>
          ${this.locationSharing ? "Sharing…" : html`📍 <span class="tool-label-text">Location</span>`}
        </button>
        ${this.locationError ? html`<span style="font-size:11px;color:#ef4444">${this.locationError}</span>` : ""}
        <button
          style="font-size:12px;background:${hasPoll ? "#e0e7ff" : "#f1f5f9"};border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="${hasPoll ? t.removePoll : t.createPoll}"
          aria-pressed=${hasPoll ? "true" : "false"}
          @click=${this.handlePollToggle}
        >📊 <span class="tool-label-text">${t.poll}</span></button>
        ${hasPoll ? html`<span style="font-size:11px;color:#64748b">${t.pollMutualExclusive}</span>` : ""}
      <span style="position:relative;display:inline-block">
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="Stickers"
          aria-haspopup="dialog"
          aria-expanded=${this.showStickers ? "true" : "false"}
          @click=${this.handleStickerToggle}
        >⭐ <span class="tool-label-text">Sticker</span></button>
        ${
          this.showStickers
            ? html`<div
              role="dialog"
              aria-label="Stickers"
              @keydown=${this.handleStickerPickerKeyDown}
              @click=${(e: Event) => e.stopPropagation()}
              style="position:absolute;top:100%;left:0;margin-top:6px;min-width:240px;max-width:min(320px, 90vw);background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:8px;max-height:200px;overflow-y:auto;z-index:10"
            >
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:12px;font-weight:600">Stickers</span>
                <button
                  aria-label="Close"
                  @click=${this.handleStickerPickerClose}
                  style="background:none;border:none;cursor:pointer;font-size:16px;color:#64748b"
                >×</button>
              </div>
              ${
                this.stickerLoading
                  ? html`<span style="font-size:12px;color:#64748b">Loading stickers…</span>`
                  : this.stickerPacks && this.stickerPacks.length > 0
                    ? html`${repeat(
                        this.stickerPacks,
                        (pack) => pack.pack_id,
                        (pack) => html`<div style="margin-bottom:8px">
                      <div style="font-size:12px;font-weight:600;margin-bottom:4px">${pack.display_name ?? pack.pack_id}</div>
                      <div style="display:flex;flex-wrap:wrap;gap:6px">
                        ${repeat(
                          pack.images,
                          (img) => img.shortcode,
                          (img) => html`<button
                            style="border:1px solid #e2e8f0;border-radius:6px;padding:4px;background:white;cursor:pointer"
                            data-sticker-url="${img.url}"
                            data-sticker-shortcode="${img.shortcode}"
                            data-sticker-kind="sticker"
                            @click=${this.handleStickerPick}
                            title="${img.shortcode}"
                          >
                            <img src="${img.proxy_url ?? img.url}" alt="${img.shortcode}" loading="lazy" style="width:32px;height:32px;object-fit:cover;border-radius:4px" />
                          </button>`,
                        )}
                      </div>
                    </div>`,
                      )}`
                    : html`<span style="font-size:12px;color:#64748b">No stickers</span>`
              }
            </div>`
            : ""
        }
      </span>
      ${
        hasPoll
          ? html`<div class="poll-editor" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;max-width:100%;box-sizing:border-box">
            <div style="font-size:13px;font-weight:600">${t.poll}</div>
            <label for="poll-question-input" style="font-size:12px;font-weight:500">${t.pollQuestionLabel}</label>
            <input
              id="poll-question-input"
              aria-label="${t.pollQuestionLabel}"
              placeholder="${t.pollQuestionPlaceholder}"
              .value=${this.pollDraft?.question ?? ""}
              @input=${this.handlePollQuestionInput}
              style="border:1px solid ${this.pollErrors?.question ? "#ef4444" : "#e2e8f0"};border-radius:6px;padding:6px 8px;font-size:14px;min-width:0;width:100%;box-sizing:border-box"
            />
            ${this.pollErrors?.question ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.question === "Question is required" ? t.pollQuestionRequired : this.pollErrors.question === "Question is too long" ? t.pollQuestionTooLong : this.pollErrors.question}</span>` : ""}
            <div style="font-size:12px;font-weight:500;margin-top:4px">Options</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${repeat(
                this.pollDraft?.options ?? [],
                (_opt, idx) => idx,
                (
                  opt,
                  idx,
                ) => html`<div style="display:flex;gap:6px;align-items:center;max-width:100%">
                  <label for="poll-option-${idx}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">${t.pollOptionLabel.replace("{n}", String(idx + 1))}</label>
                  <input
                    id="poll-option-${idx}"
                    aria-label="${t.pollOptionLabel.replace("{n}", String(idx + 1))}"
                    placeholder="${t.pollOptionLabel.replace("{n}", String(idx + 1))}"
                    .value=${opt}
                    @input=${(e: Event) => this.handlePollOptionInput(idx, e)}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") e.stopPropagation()
                    }}
                    style="flex:1;min-width:0;border:1px solid ${this.pollErrors?.options[idx] ? "#ef4444" : "#e2e8f0"};border-radius:6px;padding:6px 8px;font-size:14px;box-sizing:border-box"
                  />
                  <button
                    aria-label="${t.removeOption.replace("{n}", String(idx + 1))}"
                    @click=${() => this.handleRemoveOption(idx)}
                    ?disabled=${(this.pollDraft?.options.length ?? 0) <= 2}
                    style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${(this.pollDraft?.options.length ?? 0) <= 2 ? "0.5" : "1"};flex-shrink:0"
                  >×</button>
                </div>`,
              )}
            </div>
            ${this.pollErrors?.general ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.general === "At least 2 options required" ? t.pollTooFewOptions : this.pollErrors.general === "Too many options" ? t.pollTooManyOptions : this.pollErrors.general}</span>` : ""}
            ${this.pollErrors?.options.some((e) => e) ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.options.find((e) => e) === "Option cannot be empty" ? t.pollOptionRequired : this.pollErrors.options.find((e) => e) === "Option is too long" ? t.pollOptionTooLong : (this.pollErrors.options.find((e) => e) ?? "")}</span>` : ""}
            <div style="display:flex;gap:6px;margin-top:4px">
              <button
                aria-label="${t.addOption}"
                @click=${this.handleAddOption}
                ?disabled=${(this.pollDraft?.options.length ?? 0) >= 20}
                style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;opacity:${(this.pollDraft?.options.length ?? 0) >= 20 ? "0.5" : "1"}"
              >${t.addOption}</button>
              <button
                aria-label="${t.cancelPoll}"
                @click=${this.handleCancelPoll}
                style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"
              >${t.cancelPoll}</button>
            </div>
          </div>`
          : ""
      }
      ${
        this.pendingSticker
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">
            <span style="font-size:12px">${this.pendingSticker.shortcode || "⭐"}</span>
            <span style="font-size:11px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.pendingSticker.url}</span>
            <button
              aria-label="Remove sticker"
              @click=${() => {
                this.pendingSticker = null
              }}
              style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px"
            >×</button>
          </div>`
          : ""
      }
      ${
        this.pendingMedia
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">
            <span style="font-size:12px">📎</span>
            <span style="font-size:11px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.pendingMedia.filename ?? this.pendingMedia.url}</span>
            <button
              aria-label="Remove attachment"
              @click=${() => {
                this.pendingMedia = null
              }}
              style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px"
            >×</button>
          </div>`
          : ""
      }
      ${
        this.pendingLocation
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">
            <span style="font-size:12px">📍</span>
            <span style="font-size:11px;color:#64748b;flex:1">Location attached</span>
            <button
              aria-label="Remove location"
              @click=${() => {
                this.pendingLocation = null
              }}
              style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px"
            >×</button>
          </div>`
          : ""
      }

    </div>`
  }
}

// Idempotent registration guard
if (!customElements.get("cumments-editor")) {
  customElements.define("cumments-editor", CummentsEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-editor": CummentsEditor
  }
}
