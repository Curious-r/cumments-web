import { css, html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
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
 *  - lang      (optional, BCP 47 language tag, default zh-Hans)
 *  - per-page  (optional, default 20)
 *
 * lang accepts any BCP 47 tag; it is resolved to a supported UI locale
 * (zh-Hans, en) via resolveLocale(). Unsupported tags fall back to zh-Hans.
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
  @property() lang = "zh-Hans"
  @property({ attribute: "per-page", type: Number }) perPage = 20

  private controller: CommentController | null = null

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
  `

  connectedCallback(): void {
    super.connectedCallback()
    this.ensureController()
  }

  disconnectedCallback(): void {
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
                      ${vm.reactions.map(
                        (r) => html`
                          <button
                            class="reaction ${r.mine ? "mine" : ""}"
                            part="reaction"
                            @click=${() => ctrl.toggleReaction(vm.eventId, r.key, !!r.mine)}
                            title=${r.mine ? t.clickToRemove : t.clickToAdd}
                          >
                            ${r.key} ${r.count}
                          </button>
                        `,
                      )}
                    </div>`
                    : ""
                }
                <div class="reactions" style="opacity:0.7">
                  <span style="font-size:11px;color:#94a3b8;margin-right:4px;">${t.reactLabel}</span>
                  ${["👍", "❤️", "😂"].map(
                    (k) =>
                      html`<button class="reaction" part="reaction" style="background:#f1f5f9" title="${t.addReaction}${k}" @click=${() => ctrl.toggleReaction(vm.eventId, k, false)}>+ ${k}</button>`,
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
