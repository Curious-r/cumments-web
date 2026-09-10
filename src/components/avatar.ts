import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { firstGrapheme } from "../utils/grapheme"

/**
 * Whether an avatar URL can be handed straight to an `<img>`.
 *
 * Only http(s) is renderable by the browser. A raw Matrix `mxc://` URI (or any
 * other scheme) is NOT converted here: building a Matrix media endpoint is the
 * backend/media-contract's job, so those values fall back until the backend
 * supplies a browser-ready (proxied) URL.
 */
export function usableAvatarUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/**
 * Initial used by the fallback. Grapheme-aware so multibyte and combining
 * sequences are not split, and bounded to one grapheme so an uppercasing that
 * expands (e.g. "ß" → "SS") cannot overflow the avatar box.
 */
export function avatarInitial(displayName: string | null | undefined): string {
  const first = firstGrapheme(displayName ?? "")
  if (!first) return "?"
  return firstGrapheme(first.toUpperCase()) || "?"
}

/**
 * Reusable avatar presentation: URL → image when usable, otherwise a fallback
 * with the same box dimensions so layout never shifts.
 *
 * Rendered in the light DOM so consumers (and tests) can query the `<img>` in
 * place rather than reaching through a shadow root.
 *
 * Presentation only — it never fetches, caches or mutates profile state.
 */
@customElement("cumments-avatar")
export class CummentsAvatar extends LitElement {
  @property({ attribute: "display-name" }) displayName = ""
  @property({ attribute: "avatar-url" }) avatarUrl: string | null = null
  @property({ type: Number }) size = 32
  /** Set once the browser reports a load failure, so the icon is never shown. */
  @state() private failed = false

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    // A new URL deserves a fresh attempt even if the previous one failed.
    if (changed.has("avatarUrl")) this.failed = false
  }

  private get boxStyle(): string {
    return `width:${this.size}px;height:${this.size}px;border-radius:50%;box-sizing:border-box;flex:0 0 auto;overflow:hidden`
  }

  render() {
    const url = usableAvatarUrl(this.avatarUrl)
    if (url && !this.failed) {
      return html`<img
        class="avatar-image"
        src=${url}
        alt=""
        width=${this.size}
        height=${this.size}
        style="${this.boxStyle};display:block;object-fit:cover;background:#f1f5f9"
        @error=${() => {
          this.failed = true
        }}
      />`
    }
    // Decorative: the adjacent visible name already identifies the user, so
    // the initial must not be announced separately.
    return html`<span
      class="avatar-fallback"
      aria-hidden="true"
      style="${this.boxStyle};display:inline-flex;align-items:center;justify-content:center;background:#e2e8f0;color:#64748b;font-weight:500;line-height:1;user-select:none;font-size:${Math.max(
        10,
        Math.round(this.size * 0.42),
      )}px"
      >${avatarInitial(this.displayName)}</span
    >`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-avatar": CummentsAvatar
  }
}
