import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../../api/contract/query"
import type { StickerPack } from "../../api/stickers"
import { resolveLocale } from "../../i18n/locale"
import { messages } from "../../i18n/messages"

export interface CummentsSubmitDetail {
  content: string
  replyToId: string | null
  displayName: string
  media?: { url: string; kind: string } | null
}

/**
 * <cumments-editor>
 * Light DOM editor inside parent ShadowRoot. Owns draft, replyToId, displayName,
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
  @property() displayNameHint = ""
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
  @property({ attribute: false }) shareLocation?: (
    geoUri: string,
    opts: { replyTo: string | null; threadRoot: string | null; displayName?: string },
  ) => Promise<void>

  @state() private draft = ""
  @state() private displayName = ""
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

  // For testing / parent imperative access
  get currentDraft(): string {
    return this.draft
  }
  get currentDisplayName(): string {
    return this.displayName
  }
  get currentReplyToId(): string | null {
    return this.replyToId
  }

  setReplyToId(id: string | null) {
    this.replyToId = id
    this.requestUpdate()
  }

  // Display name is transient editor state; hint is only used to initialize an empty value.
  // An explicit editor value always wins over the hint and is not overwritten by later hint changes.
  private maybeApplyHint(): void {
    if (this.displayName === "" && this.displayNameHint) {
      this.displayName = this.displayNameHint
    }
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
    if (changed.has("displayNameHint")) {
      this.maybeApplyHint()
    }
    if (changed.has("showStickers")) {
      if (this.showStickers) this.addWindowListeners()
      else this.removeWindowListeners()
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.maybeApplyHint()
  }

  disconnectedCallback(): void {
    this.removeWindowListeners()
    super.disconnectedCallback()
  }

  private handleDraftInput = (e: Event) => {
    this.draft = (e.target as HTMLInputElement).value
  }

  private handleDisplayNameInput = (e: Event) => {
    this.displayName = (e.target as HTMLInputElement).value
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
      if (this.replyToId) {
        this.replyToId = null
      }
    }
  }

  private handleDisplayNameKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      void this.handleSubmit()
    } else if (e.key === "Escape" && this.replyToId) {
      this.replyToId = null
    }
  }

  private async handleSubmit(): Promise<void> {
    const content = this.draft.trim()
    const hasSticker = !!this.pendingSticker
    const hasMedia = !!this.pendingMedia
    const hasLocation = !!this.pendingLocation
    if (!content && !hasSticker && !hasMedia && !hasLocation) return
    const replyToId = this.replyToId
    const displayName = this.displayName
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

    const isCollapsed =
      !this.focused &&
      !this.draft &&
      !hasReply &&
      !this.mediaUploading &&
      !this.locationSharing &&
      !this.showStickers &&
      !this.pendingSticker &&
      !this.pendingMedia &&
      !this.pendingLocation
    const _showToolRow = !isCollapsed

    return html`<div class="editor" part="editor" style="flex-direction:column;gap:8px" @focusin=${this.handleFocus} @focusout=${this.handleBlur}>
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
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;margin-bottom:4px">
        <span>Commenting as</span>
        <input
          aria-label="Display name"
          placeholder="Anonymous"
          .value=${this.displayName}
          @input=${this.handleDisplayNameInput}
          @keydown=${this.handleDisplayNameKeydown}
          style="border:none;border-bottom:1px dashed #cbd5e1;background:transparent;font-size:11px;padding:2px 4px;max-width:100px;flex:0 1 auto"
        />
      </div>
      <div style="display:flex;gap:8px;width:100%">
        <input
          part="input"
          aria-label="${t.commentAriaLabel}"
          placeholder="${t.commentPlaceholder}"
          .value=${this.draft}
          @input=${this.handleDraftInput}
          @keydown=${this.handleKeydown}
        />
        <button part="button" aria-label="${t.postAriaLabel}" @click=${() => void this.handleSubmit()} ?disabled=${(!this.draft.trim() && !this.pendingSticker && !this.pendingMedia && !this.pendingLocation) || this.mediaUploading || this.locationSharing} style="opacity:${!this.draft.trim() && !this.pendingSticker && !this.pendingMedia && !this.pendingLocation ? "0.5" : "1"}">${t.postLabel}</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.mediaUploading ? "0.5" : "1"}">
          📎 Attach
          <input type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip" style="display:none" @change=${this.handleMediaSelect} ?disabled=${this.mediaUploading} />
        </label>
        ${this.mediaUploading ? html`<span style="font-size:11px;color:#64748b">Uploading…</span>` : ""}
        ${this.mediaError ? html`<span style="font-size:11px;color:#ef4444">${this.mediaError}</span>` : ""}
        <button style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.locationSharing ? "0.5" : "1"}" @click=${() => void this.handleLocationShare()} ?disabled=${this.locationSharing}>
          ${this.locationSharing ? "Sharing…" : "📍 Location"}
        </button>
        ${this.locationError ? html`<span style="font-size:11px;color:#ef4444">${this.locationError}</span>` : ""}
      <span style="position:relative;display:inline-block">
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="Stickers"
          aria-haspopup="dialog"
          aria-expanded=${this.showStickers ? "true" : "false"}
          @click=${this.handleStickerToggle}
        >⭐ Sticker</button>
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
