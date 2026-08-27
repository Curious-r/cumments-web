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

  @state() private loading = true
  @state() private error: string | null = null
  @state() private draft = ""

  private client: CummentsClient | null = null
  private store = new CommentStore()
  private sse: SseClient | null = null
  private identity: Identity | null = null

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
  `

  connectedCallback(): void {
    super.connectedCallback()
    this.init()
    this.store.subscribe(() => this.requestUpdate())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.sse?.close()
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
    this.loading = true
    this.error = null
    try {
      const res = await this.client.comments.list({ page: 1, per_page: 20 })
      this.store.loadPage(res)
      this.sse = new SseClient({
        endpoint: this.endpoint,
        siteId: this.siteId,
        pageSlug: this.pageId,
        onEvent: (data) => this.store.mergeRealtime(data),
        onStatus: () => this.requestUpdate(),
      })
      this.sse.connect()
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
      // refresh after short delay to allow projection
      setTimeout(() => this.refresh(), 800)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  private async refresh(): Promise<void> {
    if (!this.client) return
    try {
      const res = await this.client.comments.list({ page: 1, per_page: 20 })
      this.store.loadPage(res)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  render() {
    const ordered = this.store.getOrdered()
    return html`
      <div class="wrap" part="wrap">
        <div class="header" part="header">
          <span>${this.lang === "en" ? "Comments" : "评论"} · ${this.store.snapshot.meta?.total ?? ordered.length}</span>
          <span style="font-size:12px;color:${this.sse?.connected ? "#16a34a" : "#94a3b8"}">${this.sse?.connected ? (this.lang === "en" ? "Live" : "实时") : this.lang === "en" ? "Offline" : "未连接"}</span>
        </div>
        ${this.loading ? html`<div class="empty">${this.lang === "en" ? "Loading..." : "加载中..."}</div>` : ""}
        ${this.error ? html`<div class="error" part="error">${this.error}</div>` : ""}
        ${!this.loading && ordered.length === 0 ? html`<div class="empty">${this.lang === "en" ? "No comments yet" : "还没有评论"}</div>` : ""}
        <div class="list" part="list">
          ${ordered.map(
            (c) => html`
              <div class="comment" part="comment">
                <div class="meta" part="meta">${(c.author as unknown as { display_name?: string })?.display_name ?? "Anonymous"} · ${new Date(c.timestamp).toLocaleString()}</div>
                <div part="body">${(c.content as unknown as { body?: string })?.body ?? ""}</div>
              </div>
            `,
          )}
        </div>
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
