import { css, html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { resolveLocale } from "../i18n/locale"
import { messages } from "../i18n/messages"
import { CommentController } from "./comment-controller"
import { toViewModel } from "./view-model"

/**
 * <cumments-comments>
 * Thin View — all orchestration lives in CommentController.
 * Attributes:
 *  - endpoint  (required)
 *  - site-id   (required)
 *  - page-slug (required)
 *  - lang      (optional, BCP 47 language tag, default en)
 *  - per-page  (optional, default 20)
 *
 * lang accepts any BCP 47 tag; it is resolved to a supported UI locale
 * (zh-Hans, en) via resolveLocale(). Unsupported tags fall back to en.
 */
@customElement("cumments-comments")
export class CummentsComments extends LitElement {
  @property({ attribute: "endpoint" }) endpoint = ""
  @property({ attribute: "site-id" }) siteId = ""
  @property({ attribute: "page-slug" }) pageSlug = ""
  /**
   * BCP 47 language tag. Examples: zh-Hans, en, en-GB, en-US, ja.
   * Resolved to a supported UI locale (zh-Hans / en) for rendering.
   */
  @property() lang = "en"
  @property({ attribute: "per-page", type: Number }) perPage = 20

  private controller: CommentController | null = null

  @state() private openKey: string | null = null
  @state() private tooltipPos: { top: number; left: number } | null = null

  private hoverShowTimer: ReturnType<typeof setTimeout> | null = null
  private hoverHideTimer: ReturnType<typeof setTimeout> | null = null
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressStart: { x: number; y: number } | null = null
  private longPressed = false
  private suppressNextClick = false
  private escapeSuppressedKey: string | null = null
  private boundWindowClick: ((e: MouseEvent) => void) | null = null
  private boundWindowScroll: (() => void) | null = null
  private boundWindowResize: (() => void) | null = null
  private pendingLongPressScrollHandler: (() => void) | null = null
  private pendingPositionRaf: number | null = null

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
      --cumments-primary: #4f46e5;
      --cumments-border: #e2e8f0;
      --cumments-bg: #ffffff;
      --cumments-text: #1e293b;
    }
    .wrap {
      border: 1px solid var(--cumments-border);
      border-radius: 12px;
      background: var(--cumments-bg);
      color: var(--cumments-text);
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .comment {
      border: 1px solid var(--cumments-border);
      border-radius: 8px;
      padding: 12px;
    }
    .meta {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .reactions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .reaction {
      border: 1px solid var(--cumments-border);
      border-radius: 16px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
      background: #f8fafc;
    }
    .reaction.mine {
      background: #e0e7ff;
      border-color: var(--cumments-primary);
    }
    .reaction:focus-visible {
      outline: 2px solid var(--cumments-primary);
      outline-offset: 2px;
    }
    .pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      font-size: 14px;
    }
    .pagination button {
      border: 1px solid var(--cumments-border);
      background: white;
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
    }
    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .editor {
      margin-top: 16px;
      display: flex;
      gap: 8px;
    }
    .editor input {
      flex: 1;
      border: 1px solid var(--cumments-border);
      border-radius: 8px;
      padding: 8px 12px;
    }
    .editor button {
      background: var(--cumments-primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      cursor: pointer;
    }
    .error {
      color: #dc2626;
      font-size: 14px;
      margin: 8px 0;
    }
    .empty {
      color: #64748b;
      text-align: center;
      padding: 24px;
      border: 1px dashed var(--cumments-border);
      border-radius: 8px;
    }
    .pending {
      font-size: 12px;
      color: #a16207;
      margin: 8px 0;
      text-align: center;
    }
    .reactor-panel {
      position: fixed;
      z-index: 999;
      max-width: min(280px, 90vw);
      min-width: 120px;
      background: var(--cumments-bg);
      color: var(--cumments-text);
      border: 1px solid var(--cumments-border);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      padding: 8px;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .reactor-panel {
        transition: opacity 120ms ease-out;
      }
    }
    .reactor {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
    }
    .reactor-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid var(--cumments-border);
      background: #f1f5f9;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #64748b;
      overflow: hidden;
      object-fit: cover;
    }
    .reactor-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reactor-others {
      color: #64748b;
      font-size: 11px;
      margin-top: 4px;
      border-top: 1px solid var(--cumments-border);
      padding-top: 4px;
    }
  `

  connectedCallback(): void {
    super.connectedCallback()
    this.ensureController()
  }

  disconnectedCallback(): void {
    this.clearAllTimers()
    this.removeWindowListeners()
    this.openKey = null
    this.tooltipPos = null
    super.disconnectedCallback()
  }

  updated(changed: Map<string, unknown>): void {
    if (
      changed.has("endpoint") ||
      changed.has("siteId") ||
      changed.has("pageSlug") ||
      changed.has("perPage")
    ) {
      this.ensureController(true)
    }
    if (changed.has("openKey") || changed.has("tooltipPos")) {
      if (this.openKey) {
        this.schedulePosition()
        this.addWindowListeners()
      } else {
        this.removeWindowListeners()
        this.tooltipPos = null
      }
    }
    // Close if anchor no longer valid (message deleted or reaction removed)
    if (this.openKey && this.controller) {
      const valid = this.isOpenKeyValid(this.openKey)
      if (!valid) {
        this.openKey = null
      }
    }
  }

  private ensureController(force = false): void {
    if (!this.endpoint || !this.siteId || !this.pageSlug) return
    if (this.controller) {
      if (!force) return
      this.controller.updateOpts({
        endpoint: this.endpoint,
        siteId: this.siteId,
        pageSlug: this.pageSlug,
        perPage: this.perPage,
      })
      return
    }
    this.controller = new CommentController(this, {
      endpoint: this.endpoint,
      siteId: this.siteId,
      pageSlug: this.pageSlug,
      perPage: this.perPage,
    })
  }

  /** Public API (preview): re-fetch current page */
  async reload(): Promise<void> {
    await this.controller?.refresh()
  }

  private getReactorKey(eventId: string, key: string): string {
    return `${eventId}::${key}`
  }

  private getTooltipId(key: string): string {
    // sanitize for id: replace non-alphanum with -
    return `reactor-tip-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  }

  private isOpenKeyValid(key: string): boolean {
    if (!this.controller) return false
    const ordered = this.controller.store.getOrdered()
    for (const c of ordered) {
      const vm = toViewModel(c, this.controller.context.identity?.publicKey ?? null)
      for (const r of vm.reactions) {
        if (this.getReactorKey(vm.eventId, r.key) === key) return true
      }
    }
    return false
  }

  private clearAllTimers(): void {
    if (this.hoverShowTimer) {
      clearTimeout(this.hoverShowTimer)
      this.hoverShowTimer = null
    }
    if (this.hoverHideTimer) {
      clearTimeout(this.hoverHideTimer)
      this.hoverHideTimer = null
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
    this.longPressStart = null
    this.longPressed = false
    if (this.pendingLongPressScrollHandler) {
      window.removeEventListener("scroll", this.pendingLongPressScrollHandler, true)
      this.pendingLongPressScrollHandler = null
    }
    if (this.pendingPositionRaf) {
      cancelAnimationFrame(this.pendingPositionRaf)
      this.pendingPositionRaf = null
    }
  }

  private addWindowListeners(): void {
    if (this.boundWindowClick) return
    this.boundWindowClick = (e: MouseEvent) => {
      const path = e.composedPath()
      // if click is on reaction button or tooltip, ignore
      const targetInReactions = path.some(
        (el) =>
          el instanceof HTMLElement &&
          (el.getAttribute("data-reactor-key") === this.openKey ||
            el.getAttribute("part") === "reactor-panel" ||
            el.closest("[data-reactor-key]") ||
            el.closest('[part="reactor-panel"]')),
      )
      if (targetInReactions) return
      this.openKey = null
    }
    this.boundWindowScroll = () => {
      // close immediately if anchor leaves viewport or on any scroll
      this.openKey = null
    }
    this.boundWindowResize = () => {
      if (this.openKey) this.schedulePosition()
    }
    window.addEventListener("click", this.boundWindowClick, true)
    window.addEventListener("scroll", this.boundWindowScroll, true)
    window.addEventListener("resize", this.boundWindowResize)
  }

  private removeWindowListeners(): void {
    if (this.boundWindowClick) {
      window.removeEventListener("click", this.boundWindowClick, true)
      this.boundWindowClick = null
    }
    if (this.boundWindowScroll) {
      window.removeEventListener("scroll", this.boundWindowScroll, true)
      this.boundWindowScroll = null
    }
    if (this.boundWindowResize) {
      window.removeEventListener("resize", this.boundWindowResize)
      this.boundWindowResize = null
    }
  }

  private schedulePosition(): void {
    if (this.pendingPositionRaf) cancelAnimationFrame(this.pendingPositionRaf)
    this.pendingPositionRaf = requestAnimationFrame(() => {
      this.pendingPositionRaf = null
      this.positionTooltip()
    })
  }

  private positionTooltip(): void {
    if (!this.openKey) return
    const id = this.getTooltipId(this.openKey)
    const tip = this.shadowRoot?.getElementById(id) as HTMLElement | null
    const anchor = this.shadowRoot?.querySelector(
      `[data-reactor-key="${CSS.escape(this.openKey)}"]`,
    ) as HTMLElement | null
    if (!tip || !anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    // close if anchor leaves viewport
    if (
      anchorRect.bottom < 0 ||
      anchorRect.top > window.innerHeight ||
      anchorRect.right < 0 ||
      anchorRect.left > window.innerWidth
    ) {
      this.openKey = null
      return
    }
    // ensure tip is measurable
    tip.style.visibility = "hidden"
    tip.style.display = "block"
    const tipRect = tip.getBoundingClientRect()
    tip.style.visibility = ""
    const margin = 8
    let top = anchorRect.top - tipRect.height - margin
    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2
    if (top < margin) {
      top = anchorRect.bottom + margin
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin))
    // clamp width already via css max-width, but ensure left adjustment respected
    this.tooltipPos = { top, left }
    // apply directly to tip for immediate positioning without waiting for Lit update (for tests we also rely on state)
    tip.style.top = `${top}px`
    tip.style.left = `${left}px`
  }

  private openDisclosure(key: string): void {
    if (this.escapeSuppressedKey === key) return
    this.openKey = key
  }

  private closeDisclosure(): void {
    this.openKey = null
    this.tooltipPos = null
  }

  private handleMouseEnter(key: string): void {
    if (this.longPressTimer) return
    if (this.hoverHideTimer) {
      clearTimeout(this.hoverHideTimer)
      this.hoverHideTimer = null
    }
    if (this.hoverShowTimer) clearTimeout(this.hoverShowTimer)
    this.hoverShowTimer = setTimeout(() => {
      this.hoverShowTimer = null
      if (this.escapeSuppressedKey === key) return
      this.openDisclosure(key)
    }, 300)
  }

  private handleMouseLeave(key: string): void {
    if (this.hoverShowTimer) {
      clearTimeout(this.hoverShowTimer)
      this.hoverShowTimer = null
    }
    if (this.hoverHideTimer) clearTimeout(this.hoverHideTimer)
    this.hoverHideTimer = setTimeout(() => {
      this.hoverHideTimer = null
      if (this.openKey === key) this.closeDisclosure()
    }, 150)
  }

  private handleFocus(key: string): void {
    this.clearAllTimers()
    if (this.escapeSuppressedKey === key) return
    this.openDisclosure(key)
  }

  private handleBlur(key: string): void {
    this.escapeSuppressedKey = null
    this.cancelLongPress()
    if (this.openKey === key) this.closeDisclosure()
  }

  private handleKeyDown(e: KeyboardEvent, _key: string): void {
    if (e.key === "Escape" && this.openKey) {
      this.escapeSuppressedKey = this.openKey
      this.closeDisclosure()
      e.stopPropagation()
      // keep focus on button, do not bubble
    }
  }

  private handlePointerDown(e: PointerEvent, key: string): void {
    if (e.pointerType !== "touch") return
    this.longPressStart = { x: e.clientX, y: e.clientY }
    this.longPressed = false
    if (this.longPressTimer) clearTimeout(this.longPressTimer)
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null
      this.longPressed = true
      this.suppressNextClick = true
      if (this.pendingLongPressScrollHandler) {
        window.removeEventListener("scroll", this.pendingLongPressScrollHandler, true)
        this.pendingLongPressScrollHandler = null
      }
      // toggle: if already open same key, close; else open
      if (this.openKey === key) this.closeDisclosure()
      else this.openDisclosure(key)
    }, 500)
    // Ensure scroll cancels pending long-press even before disclosure opens
    if (!this.pendingLongPressScrollHandler) {
      this.pendingLongPressScrollHandler = () => this.cancelLongPress()
      window.addEventListener("scroll", this.pendingLongPressScrollHandler, true)
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.longPressTimer || !this.longPressStart) return
    const dx = e.clientX - this.longPressStart.x
    const dy = e.clientY - this.longPressStart.y
    if (Math.hypot(dx, dy) > 10) {
      this.cancelLongPress()
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.longPressTimer) {
      // short tap - cancel before activation
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
      this.longPressStart = null
      if (this.pendingLongPressScrollHandler) {
        window.removeEventListener("scroll", this.pendingLongPressScrollHandler, true)
        this.pendingLongPressScrollHandler = null
      }
      // allow normal click
      return
    }
    if (this.longPressed) {
      // long press activated, keep suppression until click
      this.longPressed = false
      this.longPressStart = null
      // suppressNextClick remains true until consumed by click
      // prevent immediate close from pointerup
      e.preventDefault()
    }
  }

  private handlePointerCancel(): void {
    this.cancelLongPress()
  }

  private handlePointerLeave(): void {
    this.cancelLongPress()
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
    this.longPressStart = null
    this.longPressed = false
    if (this.pendingLongPressScrollHandler) {
      window.removeEventListener("scroll", this.pendingLongPressScrollHandler, true)
      this.pendingLongPressScrollHandler = null
    }
  }

  private handleTouchContextMenu(e: Event): void {
    if (this.longPressTimer || this.longPressed || this.suppressNextClick) {
      e.preventDefault()
    }
  }

  private handleReactionClick(e: MouseEvent, eventId: string, key: string, mine: boolean): void {
    if (this.suppressNextClick) {
      this.suppressNextClick = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // normal reaction toggle
    this.controller?.toggleReaction(eventId, key, mine)
  }

  private getOthersText(
    count: number,
    reactorsLength: number,
    t: import("../i18n/messages").Messages,
  ): string | null {
    const others = Math.max(0, count - reactorsLength)
    if (others <= 0) return null
    if (others === 1) return t.andOneOther
    return t.andNOthers.replace("{n}", String(others))
  }

  private getAriaLabel(
    r: { key: string; count: number; mine: boolean },
    t: import("../i18n/messages").Messages,
  ): string {
    const action = r.mine ? t.reactionRemoveLabel : t.reactionAddLabel
    // e.g. "👍 8 reactions, add reaction" — we include count and action
    // For i18n we use simple template: `${key} ${count} ${action}`
    return `${r.key} ${r.count} ${action}`
  }

  private getReactorDisplayName(
    reactor: import("./view-model").Reactor,
    t: import("../i18n/messages").Messages,
  ): string {
    return reactor.display_name ?? t.reactorUnknown
  }

  private getInitials(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return "?"
    // Use first grapheme cluster (approx via first codepoint)
    return Array.from(trimmed)[0] ?? "?"
  }

  render() {
    const ctrl = this.controller
    const t = messages[resolveLocale(this.lang)]
    if (!ctrl) {
      return html`<div class="wrap" part="wrap"><div class="empty">${t.endpointRequired}</div></div>`
    }
    const ordered = ctrl.store.getOrdered()
    const meta = ctrl.store.snapshot.meta
    const pending = ctrl.store.snapshot.pending
    return html`
      <div class="wrap" part="wrap">
        <div class="header" part="header">
          <span>${t.comments} · ${meta?.total ?? ordered.length}</span>
          <span style="font-size:12px;color:${ctrl.sse?.connected ? "#16a34a" : "#94a3b8"}"
            >${ctrl.sse?.connected ? t.live : t.offline}</span
          >
        </div>
        ${ctrl.loading ? html`<div class="empty">${t.loading}</div>` : ""}
        ${ctrl.error ? html`<div class="error" part="error" role="alert" aria-live="assertive">${ctrl.error}</div>` : ""}
        ${pending ? html`<div class="pending">${t.waitingSync}</div>` : ""}
        ${!ctrl.loading && ordered.length === 0 ? html`<div class="empty">${t.noComments}</div>` : ""}
        <div class="list" part="list" role="feed">
          ${ordered.map((c) => {
            const vm = toViewModel(c, ctrl.context.identity?.publicKey ?? null)
            return html`
              <div class="comment" part="comment" role="article">
                <div class="meta" part="meta">
                  ${vm.displayName} · ${new Date(vm.timestamp).toLocaleString()}
                  ${vm.replyTo ? html` · <span>↩ ${t.reply}</span>` : ""}
                </div>
                <div part="body">${vm.body}</div>
                ${
                  vm.reactions.length
                    ? html`<div class="reactions" part="reactions">
                      ${vm.reactions.map((r) => {
                        const key = this.getReactorKey(vm.eventId, r.key)
                        const isOpen = this.openKey === key
                        const tipId = this.getTooltipId(key)
                        const othersText = this.getOthersText(r.count, r.reactors.length, t)
                        const ariaLabel = this.getAriaLabel(r, t)
                        return html`
                          <button
                            class="reaction ${r.mine ? "mine" : ""}"
                            part="reaction"
                            data-reactor-key="${key}"
                            aria-label="${ariaLabel}"
                            aria-describedby="${isOpen ? tipId : ""}"
                            @click=${(e: MouseEvent) => this.handleReactionClick(e, vm.eventId, r.key, !!r.mine)}
                            @mouseenter=${() => this.handleMouseEnter(key)}
                            @mouseleave=${() => this.handleMouseLeave(key)}
                            @focus=${() => this.handleFocus(key)}
                            @blur=${() => this.handleBlur(key)}
                            @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, key)}
                            @pointerdown=${(e: PointerEvent) => this.handlePointerDown(e, key)}
                            @pointermove=${(e: PointerEvent) => this.handlePointerMove(e)}
                            @pointerup=${(e: PointerEvent) => this.handlePointerUp(e)}
                            @pointercancel=${() => this.handlePointerCancel()}
                            @pointerleave=${() => this.handlePointerLeave()}
                            @contextmenu=${(e: Event) => this.handleTouchContextMenu(e)}
                          >
                            ${r.key} ${r.count}
                          </button>
                          ${
                            isOpen
                              ? html`
                                <div
                                  id="${tipId}"
                                  role="tooltip"
                                  part="reactor-panel"
                                  class="reactor-panel"
                                  style="${
                                    this.tooltipPos
                                      ? `top:${this.tooltipPos.top}px;left:${this.tooltipPos.left}px;`
                                      : ""
                                  }"
                                  @click=${(e: Event) => e.stopPropagation()}
                                >
                                  ${r.reactors.slice(0, 5).map((reactor) => {
                                    const name = this.getReactorDisplayName(reactor, t)
                                    const avatar = reactor.avatar_url
                                    const initials = this.getInitials(name)
                                    return html`
                                        <div class="reactor" part="reactor">
                                          ${
                                            avatar
                                              ? html`<img
                                                class="reactor-avatar"
                                                part="reactor-avatar"
                                                src="${avatar}"
                                                alt=""
                                                loading="lazy"
                                              />`
                                              : html`<span class="reactor-avatar" part="reactor-avatar"
                                                >${initials}</span
                                              >`
                                          }
                                          <span class="reactor-name" part="reactor-name">${name}</span>
                                        </div>
                                      `
                                  })}
                                  ${
                                    othersText
                                      ? html`<div class="reactor-others" part="reactor-others">
                                        ${othersText}
                                      </div>`
                                      : ""
                                  }
                                </div>
                              `
                              : ""
                          }
                        `
                      })}
                    </div>`
                    : ""
                }
                <div class="reactions" style="opacity:0.7">
                  <span style="font-size:11px;color:#94a3b8;margin-right:4px;">${t.reactLabel}</span>
                  ${["👍", "❤️", "😂"].map(
                    (k) =>
                      html`<button
                        class="reaction"
                        part="reaction"
                        style="background:#f1f5f9"
                        aria-label="${k} ${t.reactionAddLabel}"
                        @click=${() => ctrl.toggleReaction(vm.eventId, k, false)}
                        >+ ${k}</button
                      >`,
                  )}
                </div>
              </div>
            `
          })}
        </div>
        ${
          meta && meta.total_pages > 1
            ? html`<div class="pagination" part="pagination">
              <button ?disabled=${ctrl.page <= 1} @click=${() => ctrl.changePage(-1)} aria-label="${t.prev}">${t.prev}</button>
              <span>${ctrl.page} / ${meta.total_pages}</span>
              <button ?disabled=${ctrl.page >= meta.total_pages} @click=${() => ctrl.changePage(1)} aria-label="${t.next}">${t.next}</button>
            </div>`
            : ""
        }
        <div class="editor" part="editor">
          <input
            part="input"
            aria-label="${t.commentAriaLabel}"
            placeholder="${t.commentPlaceholder}"
            .value=${ctrl.draft}
            @input=${(e: Event) => {
              ctrl.draft = (e.target as HTMLInputElement).value
              this.requestUpdate()
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this.submit()
            }}
          />
          <button part="button" aria-label="${t.postAriaLabel}" @click=${() => this.submit()}>${t.postLabel}</button>
        </div>
      </div>
    `
  }

  private async submit(): Promise<void> {
    const ctrl = this.controller
    if (!ctrl) return
    const content = ctrl.draft.trim()
    if (!content) return
    ctrl.draft = ""
    this.requestUpdate()
    try {
      await ctrl.submit(content)
      this.requestUpdate()
    } catch {
      ctrl.draft = content
      this.requestUpdate()
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-comments": CummentsComments
  }
}
