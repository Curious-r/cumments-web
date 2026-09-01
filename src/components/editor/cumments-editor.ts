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
  @state() private mediaUploading = false
  @state() private mediaError: string | null = null
  @state() private locationSharing = false
  @state() private locationError: string | null = null
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

  // Initialize displayName from hint if not yet edited
  updated(changed: Map<string, unknown>) {
    if (changed.has("displayNameHint") && this.displayName === "" && this.displayNameHint) {
      this.displayName = this.displayNameHint
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    if (this.displayName === "" && this.displayNameHint) {
      this.displayName = this.displayNameHint
    }
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
    if (!content) return
    const replyToId = this.replyToId
    const displayName = this.displayName
    const detail: CummentsSubmitDetail = {
      content,
      replyToId,
      displayName,
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
      // cancellation - do not submit, just reset
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
      // After successful upload, submit via cumments:submit with media payload
      const detail: CummentsSubmitDetail = {
        content: result.filename ?? file.name,
        replyToId: this.replyToId,
        displayName: this.displayName,
        media: { url: result.url, kind: result.mimetype ?? "image" },
      }
      this.dispatchEvent(
        new CustomEvent("cumments:submit", {
          detail,
          bubbles: true,
          composed: true,
        }),
      )
      this.replyToId = null
      this.draft = ""
    } catch (err) {
      this.mediaError = err instanceof Error ? err.message : String(err)
    } finally {
      this.mediaUploading = false
      input.value = ""
    }
  }

  private handleStickerToggle = () => {
    this.showStickers = !this.showStickers
  }

  private handleStickerPick = async (e: Event) => {
    const target = e.currentTarget as HTMLElement
    const url = target.dataset.stickerUrl
    const kind = target.dataset.stickerKind ?? "sticker"
    if (!url) return
    const detail: CummentsSubmitDetail = {
      content: url,
      replyToId: this.replyToId,
      displayName: this.displayName,
      media: { url, kind },
    }
    this.dispatchEvent(
      new CustomEvent("cumments:submit", {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
    this.replyToId = null
    this.showStickers = false
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
      if (this.shareLocation) {
        // Prefer injected shareLocation (AppRuntime wiring) for LOCATE path
        const replyTo = this.replyToId
        // threadRoot will be derived by EditorFeature via parent, but we pass replyTo for now
        // For direct share, we need threadRoot; parent will compute via EditorFeature if needed
        await this.shareLocation(geoUri, {
          replyTo,
          threadRoot: replyTo,
          displayName: this.displayName,
        })
        this.replyToId = null
      } else {
        // Fallback: emit as submit with geo content (parent can handle as location)
        const detail: CummentsSubmitDetail = {
          content: geoUri,
          replyToId: this.replyToId,
          displayName: this.displayName,
        }
        this.dispatchEvent(
          new CustomEvent("cumments:submit", {
            detail: { ...detail, geoUri },
            bubbles: true,
            composed: true,
          }),
        )
        this.replyToId = null
      }
    } catch (err) {
      const msg =
        err instanceof GeolocationPositionError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      this.locationError = msg || "Failed to share location"
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

    return html`<div class="editor" part="editor" style="flex-direction:column;gap:8px" @focusin=${this.handleFocus} @focusout=${this.handleBlur}>
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
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
        <span style="font-size:11px;color:#64748b">as ${this.displayName || this.displayNameHint || "Anonymous"}</span>
        <input
          placeholder="Display name"
          aria-label="Display name"
          .value=${this.displayName}
          @input=${this.handleDisplayNameInput}
          @keydown=${this.handleDisplayNameKeydown}
          style="border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:12px;max-width:140px;flex:1"
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
        <button part="button" aria-label="${t.postAriaLabel}" @click=${() => void this.handleSubmit()} ?disabled=${!this.draft.trim() || this.mediaUploading || this.locationSharing} style="opacity:${!this.draft.trim() ? "0.5" : "1"}">${t.postLabel}</button>
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
        <button style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer" @click=${this.handleStickerToggle}>⭐ Sticker</button>
      </div>
      ${
        this.showStickers
          ? html`<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;max-height:160px;overflow-y:auto">
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
