import { css, html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { ChallengeManager } from "../api/challenge"
import { CummentsClient } from "../api/client"
import type { Identity } from "../identity/keypair"
import { getLocalStorage, loadIdentity } from "../identity/storage"
import { SseClient } from "../realtime/sse"
import { PowSolver } from "../security/pow"
import { CommentStore } from "../state/comment-store"

/**
 * <cumments-comments>
 * Attributes:
 *  - endpoint  (required) e.g. https://comments.example.com
 *  - site-id   (required)
 *  - page-id   (required) — page_slug
 *  - lang      (optional, default zh)
 *  - per-page  (optional, default 20)
 *
 * Usage:
 *   <cumments-comments endpoint="https://comments.example.com" site-id="my-blog" page-id="hello"></cumments-comments>
 *   <script type="module" src="/cumments-web.js"></script>
 */
@customElement("cumments-comments")
export class CummentsComments extends LitElement {
  @property({ attribute: "endpoint" }) endpoint = ""
  @property({ attribute: "site-id" }) siteId = ""
  @property({ attribute: "page-id" }) pageId = ""
  @property() lang: "zh" | "en" = "zh"
  @property({ attribute: "per-page", type: Number }) perPage = 20

  @state() private loading = true
  @state() private error: string | null = null
  @state() private draft = ""
  @state() private page = 1

  private client: CummentsClient | null = null
  private store = new CommentStore()
  private sse: SseClient | null = null
  private identity: Identity | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAttempts = 0

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
    this.init()
    this.store.subscribe(() => this.requestUpdate())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.sse?.close()
    this.clearPendingPoll()
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has("endpoint") || changed.has("siteId") || changed.has("pageId")) {
      this.page = 1
      this.sse?.close()
      this.sse = null
      this.init()
    }
    if (changed.has("page")) {
      this.refresh()
    }
  }

  private async init(): Promise<void> {
    if (!this.endpoint || !this.siteId || !this.pageId) {
      this.error = "endpoint, site-id and page-id are required"
      this.loading = false
      return
    }
    this.identity = loadIdentity(getLocalStorage())
    const challengeManager = new ChallengeManager(this.endpoint)
    const powSolver = new PowSolver()
    this.client = new CummentsClient({
      endpoint: this.endpoint,
      siteId: this.siteId,
      pageSlug: this.pageId,
      identity: this.identity,
      challengeManager,
      powSolver,
    })
    await this.refresh()
    this.sse = new SseClient({
      endpoint: this.endpoint,
      siteId: this.siteId,
      pageSlug: this.pageId,
      onEvent: (data) => this.store.mergeRealtime(data),
      onStatus: () => this.requestUpdate(),
    })
    this.sse.connect()
  }

  private async refresh(): Promise<void> {
    if (!this.client) return
    this.loading = true
    this.error = null
    try {
      const res = await this.client.comments.list({ page: this.page, per_page: this.perPage })
      this.store.loadPage(res)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.loading = false
    }
  }

  private async submit(): Promise<void> {
    const content = this.draft.trim()
    if (!content || !this.client) return
    try {
      const { submission_id } = await this.client.comments.create(content, {
        displayName: "Anonymous",
      })
      this.store.setPending({
        submissionId: submission_id,
        publicKey: this.identity?.publicKey ?? "",
        content,
        submittedAt: Date.now(),
      })
      this.draft = ""
      this.startPendingPoll()
      setTimeout(() => this.refresh(), 800)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  private startPendingPoll(): void {
    this.clearPendingPoll()
    this.pendingAttempts = 0
    const poll = async () => {
      if (!this.store.snapshot.pending) return
      this.pendingAttempts++
      await this.refresh()
      if (!this.store.snapshot.pending) return
      const delay = this.pendingAttempts < 15 ? 2000 : 10000
      this.pendingTimer = setTimeout(poll, delay)
    }
    this.pendingTimer = setTimeout(poll, 2000)
  }

  private clearPendingPoll(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }

  private async toggleReaction(commentId: string, key: string, mine: boolean): Promise<void> {
    if (!this.client) return
    try {
      if (mine) await this.client.reactions.remove(commentId, key)
      else await this.client.reactions.add(commentId, key)
      await this.refresh()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  private changePage(delta: number): void {
    const meta = this.store.snapshot.meta
    const totalPages = meta?.total_pages ?? 1
    const next = Math.min(Math.max(1, this.page + delta), Math.max(1, totalPages))
    if (next !== this.page) this.page = next
  }

  render() {
    const ordered = this.store.getOrdered()
    const meta = this.store.snapshot.meta
    const pending = this.store.snapshot.pending
    return html`
      <div class="wrap" part="wrap">
        <div class="header" part="header">
          <span>${this.lang === "en" ? "Comments" : "评论"} · ${meta?.total ?? ordered.length}</span>
          <span style="font-size:12px;color:${this.sse?.connected ? "#16a34a" : "#94a3b8"}"
            >${this.sse?.connected ? (this.lang === "en" ? "Live" : "实时") : this.lang === "en" ? "Offline" : "未连接"}</span
          >
        </div>
        ${this.loading ? html`<div class="empty">${this.lang === "en" ? "Loading..." : "加载中..."}</div>` : ""}
        ${this.error ? html`<div class="error" part="error">${this.error}</div>` : ""}
        ${pending ? html`<div class="pending">${this.lang === "en" ? "Waiting for sync..." : "等待同步..."}</div>` : ""}
        ${!this.loading && ordered.length === 0 ? html`<div class="empty">${this.lang === "en" ? "No comments yet" : "还没有评论"}</div>` : ""}
        <div class="list" part="list">
          ${ordered.map(
            (c) => html`
              <div class="comment" part="comment">
                <div class="meta" part="meta">
                  ${(c.author as unknown as { display_name?: string })?.display_name ?? "Anonymous"} ·
                  ${new Date(c.timestamp).toLocaleString()}
                  ${c.reply_to ? html` · <span>↩ ${this.lang === "en" ? "reply" : "回复"}</span>` : ""}
                </div>
                <div part="body">${(c.content as unknown as { body?: string })?.body ?? ""}</div>
                ${
                  c.reactions?.length
                    ? html`<div class="reactions" part="reactions">
                      ${c.reactions.map(
                        (r) => html`
                          <button
                            class="reaction ${r.mine ? "mine" : ""}"
                            part="reaction"
                            @click=${() => this.toggleReaction(c.event_id, r.key, !!r.mine)}
                            title=${r.mine ? (this.lang === "en" ? "Click to remove" : "点击移除") : this.lang === "en" ? "Click to add" : "点击添加"}
                          >
                            ${r.key} ${r.count}
                          </button>
                        `,
                      )}
                    </div>`
                    : ""
                }
                <div class="reactions">
                  ${["👍", "❤️", "😂"].map(
                    (k) =>
                      html`<button class="reaction" part="reaction" @click=${() => this.toggleReaction(c.event_id, k, false)}>${k}</button>`,
                  )}
                </div>
              </div>
            `,
          )}
        </div>
        ${
          meta && meta.total_pages > 1
            ? html`<div class="pagination" part="pagination">
              <button ?disabled=${this.page <= 1} @click=${() => this.changePage(-1)}>${this.lang === "en" ? "Prev" : "上一页"}</button>
              <span>${this.page} / ${meta.total_pages}</span>
              <button ?disabled=${this.page >= meta.total_pages} @click=${() => this.changePage(1)}>${this.lang === "en" ? "Next" : "下一页"}</button>
            </div>`
            : ""
        }
        <div class="editor" part="editor">
          <input
            part="input"
            placeholder="${this.lang === "en" ? "Write a comment..." : "写下你的评论..."}"
            .value=${this.draft}
            @input=${(e: Event) => {
              this.draft = (e.target as HTMLInputElement).value
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this.submit()
            }}
          />
          <button part="button" @click=${() => this.submit()}>${this.lang === "en" ? "Post" : "发布"}</button>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-comments": CummentsComments
  }
}
