import { css, html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { CommentController } from "./comment-controller"
import { toViewModel } from "./view-model"

/**
 * <cumments-comments>
 * Thin View — all orchestration lives in CommentController.
 * Attributes:
 *  - endpoint  (required)
 *  - site-id   (required)
 *  - page-id   (required)
 *  - lang      (optional, default zh)
 *  - per-page  (optional, default 20)
 */
@customElement("cumments-comments")
export class CummentsComments extends LitElement {
  @property({ attribute: "endpoint" }) endpoint = ""
  @property({ attribute: "site-id" }) siteId = ""
  @property({ attribute: "page-id" }) pageId = ""
  @property() lang: "zh" | "en" = "zh"
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
      changed.has("pageId") ||
      changed.has("perPage")
    ) {
      this.ensureController(true)
    }
  }

  private ensureController(force = false): void {
    if (!this.endpoint || !this.siteId || !this.pageId) return
    if (this.controller && !force) return
    if (force) {
      this.controller = null
    }
    this.controller = new CommentController(this, {
      endpoint: this.endpoint,
      siteId: this.siteId,
      pageSlug: this.pageId,
      perPage: this.perPage,
    })
  }

  render() {
    const ctrl = this.controller
    if (!ctrl) {
      return html`<div class="wrap" part="wrap"><div class="empty">endpoint, site-id and page-id are required</div></div>`
    }
    const ordered = ctrl.store.getOrdered()
    const meta = ctrl.store.snapshot.meta
    const pending = ctrl.store.snapshot.pending
    return html`
      <div class="wrap" part="wrap">
        <div class="header" part="header">
          <span>${this.lang === "en" ? "Comments" : "评论"} · ${meta?.total ?? ordered.length}</span>
          <span style="font-size:12px;color:${ctrl.sse?.connected ? "#16a34a" : "#94a3b8"}"
            >${ctrl.sse?.connected ? (this.lang === "en" ? "Live" : "实时") : this.lang === "en" ? "Offline" : "未连接"}</span
          >
        </div>
        ${ctrl.loading ? html`<div class="empty">${this.lang === "en" ? "Loading..." : "加载中..."}</div>` : ""}
        ${ctrl.error ? html`<div class="error" part="error" role="alert" aria-live="assertive">${ctrl.error}</div>` : ""}
        ${pending ? html`<div class="pending">${this.lang === "en" ? "Waiting for sync..." : "等待同步..."}</div>` : ""}
        ${!ctrl.loading && ordered.length === 0 ? html`<div class="empty">${this.lang === "en" ? "No comments yet" : "还没有评论"}</div>` : ""}
        <div class="list" part="list" role="feed">
          ${ordered.map((c) => {
            const vm = toViewModel(c, ctrl.context.identity?.publicKey ?? null)
            return html`
              <div class="comment" part="comment" role="article">
                <div class="meta" part="meta">
                  ${vm.displayName} · ${new Date(vm.timestamp).toLocaleString()}
                  ${vm.replyTo ? html` · <span>↩ ${this.lang === "en" ? "reply" : "回复"}</span>` : ""}
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
                            title=${r.mine ? (this.lang === "en" ? "Click to remove" : "点击移除") : this.lang === "en" ? "Click to add" : "点击添加"}
                          >
                            ${r.key} ${r.count}
                          </button>
                        `,
                      )}
                    </div>`
                    : ""
                }
                <div class="reactions" style="opacity:0.7">
                  <span style="font-size:11px;color:#94a3b8;margin-right:4px;">${this.lang === "en" ? "React:" : "回应:"}</span>
                  ${["👍", "❤️", "😂"].map(
                    (k) =>
                      html`<button class="reaction" part="reaction" style="background:#f1f5f9" title="${this.lang === "en" ? "Add " : "添加"}${k}" @click=${() => ctrl.toggleReaction(vm.eventId, k, false)}>+ ${k}</button>`,
                  )}
                </div>
              </div>
            `
          })}
        </div>
        ${
          meta && meta.total_pages > 1
            ? html`<div class="pagination" part="pagination">
              <button ?disabled=${ctrl.page <= 1} @click=${() => ctrl.changePage(-1)} aria-label="${this.lang === "en" ? "Previous page" : "上一页"}">${this.lang === "en" ? "Prev" : "上一页"}</button>
              <span>${ctrl.page} / ${meta.total_pages}</span>
              <button ?disabled=${ctrl.page >= meta.total_pages} @click=${() => ctrl.changePage(1)} aria-label="${this.lang === "en" ? "Next page" : "下一页"}">${this.lang === "en" ? "Next" : "下一页"}</button>
            </div>`
            : ""
        }
        <div class="editor" part="editor">
          <input
            part="input"
            aria-label="${this.lang === "en" ? "Comment" : "评论"}"
            placeholder="${this.lang === "en" ? "Write a comment..." : "写下你的评论..."}"
            .value=${ctrl.draft}
            @input=${(e: Event) => {
              ctrl.draft = (e.target as HTMLInputElement).value
              this.requestUpdate()
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this.submit()
            }}
          />
          <button part="button" aria-label="${this.lang === "en" ? "Post comment" : "发布评论"}" @click=${() => this.submit()}>${this.lang === "en" ? "Post" : "发布"}</button>
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
