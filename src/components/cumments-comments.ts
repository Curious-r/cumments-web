import { css, html, LitElement } from "lit"
import { customElement, property, query, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../api/contract/query"
import { resolveLocale } from "../i18n/locale"
import { messages } from "../i18n/messages"
import { AppRuntime } from "../runtime/app-runtime"
import {
  renderComment,
  renderContent,
  renderIdentityVault,
  renderPagination,
  renderProfileBar,
  renderQuickReactions,
  renderReactionBar,
} from "./render"
import "./editor/cumments-editor"
import { RuntimeController } from "../runtime/runtime-controller"
import type { CummentsEditor } from "./editor/cumments-editor"
import { toViewModel } from "./view-model"

let nextComponentInstanceId = 0

/**
 * <cumments-comments>
 * Thin View — AppRuntime owns composition, Features own state.
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

  private storeUnsub: (() => void) | null = null

  private runtime: AppRuntime | null = null
  private runtimeController: RuntimeController | null = null
  @query("cumments-editor") private editorEl!: CummentsEditor | null
  private get commentsFeature() {
    return this.runtime?.comments ?? null
  }

  @state() private openKey: string | null = null
  @state() private tooltipPos: { top: number; left: number } | null = null
  @state() private editingId: string | null = null
  @state() private editingDraft: string = ""
  @state() private deletingId: string | null = null
  @state() private savingId: string | null = null
  @state() private deletingSaving: string | null = null
  @state() private showMnemonic: string | null = null
  @state() private showBackup: string | null = null
  @state() private importError: string | null = null
  @state() private vaultOpen = false

  private hoverShowTimer: ReturnType<typeof setTimeout> | null = null
  private hoverHideTimer: ReturnType<typeof setTimeout> | null = null
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressStart: { x: number; y: number } | null = null
  private longPressed = false
  private gestureId = 0
  private suppressClickForGesture: number | null = null
  private readonly instanceId = `c${nextComponentInstanceId++}`
  private tooltipIds = new Map<string, string>()
  private touchActive = false
  private escapeSuppressedKey: string | null = null
  private boundWindowClick: ((e: MouseEvent) => void) | null = null
  private boundWindowScroll: (() => void) | null = null
  private boundWindowResize: (() => void) | null = null
  private pendingLongPressScrollHandler: (() => void) | null = null
  private pendingPositionRaf: number | null = null

  // Stable handlers for render functions (avoid per-render closures)
  private readonly handleReactionClickBound = (e: Event) => {
    const t = e.currentTarget as HTMLElement
    const eventId = t.dataset.eventId
    const key = t.dataset.reactionKey
    const mine = t.dataset.reactionMine === "1"
    if (eventId && key) this.handleReactionClick(e as MouseEvent, eventId, key, mine)
  }
  private readonly handleQuickReactionBound = (e: Event) => {
    const t = e.currentTarget as HTMLElement
    const eventId = t.dataset.eventId
    const key = t.dataset.reactionKey
    if (eventId && key) {
      this.runtime?.comments.toggleReaction(eventId, key, false).catch(() => {})
    }
  }
  private readonly handleReactionMouseEnterBound = (e: Event) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handleMouseEnter(k)
  }
  private readonly handleReactionMouseLeaveBound = (e: Event) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handleMouseLeave(k)
    else
      this.handleMouseLeave((e.currentTarget as HTMLElement).getAttribute("data-reactor-key") ?? "")
  }
  private readonly handleReactionFocusBound = (e: Event) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handleFocus(k)
  }
  private readonly handleReactionBlurBound = (e: Event) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handleBlur(k)
  }
  private readonly handleReactionKeyDownBound = (e: KeyboardEvent) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handleKeyDown(e, k)
  }
  private readonly handleReactionPointerDownBound = (e: PointerEvent) => {
    const k = (e.currentTarget as HTMLElement).dataset.reactorKey
    if (k) this.handlePointerDown(e, k)
  }
  private readonly handlePointerMoveBound = (e: PointerEvent) => this.handlePointerMove(e)
  private readonly handlePointerUpBound = (e: PointerEvent) => this.handlePointerUp(e)
  private readonly handlePointerCancelBound = () => this.handlePointerCancel()
  private readonly handlePointerLeaveBound = () => this.handlePointerLeave()
  private readonly handleTouchContextMenuBound = (e: Event) => this.handleTouchContextMenu(e)
  private readonly handleEditorSubmit = async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      content: string
      replyToId: string | null
      displayName: string
      media?: { url: string; kind: string } | null
      geoUri?: string
    }
    if (!detail || !this.runtime) return
    try {
      await this.runtime.handleEditorSubmit(detail)
    } catch {}
  }

  private readonly handleEditorUploadMedia = async (
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<{
    url: string
    filename: string | null
    mimetype: string | null
    size: number | null
    voice: boolean
  }> => {
    if (!this.runtime) throw new Error("runtime not ready")
    return this.runtime.uploadMedia(file, opts)
  }

  private readonly handleEditorLocationShare = async (
    geoUri: string,
    opts: { replyTo: string | null; threadRoot: string | null; displayName?: string },
  ): Promise<void> => {
    if (!this.runtime) throw new Error("runtime not ready")
    await this.runtime.shareLocation(geoUri, opts)
    await this.runtime.comments.refresh().catch(() => {})
  }

  private readonly handlePagePrevBound = () => {
    this.runtime?.comments.changePage(-1)
  }
  private readonly handlePageNextBound = () => {
    this.runtime?.comments.changePage(1)
  }

  private readonly reactionHandlers: import("./render").ReactionBarHandlers = {
    onReactionClick: this.handleReactionClickBound,
    onReactionMouseEnter: this.handleReactionMouseEnterBound,
    onReactionMouseLeave: this.handleReactionMouseLeaveBound,
    onReactionFocus: this.handleReactionFocusBound,
    onReactionBlur: this.handleReactionBlurBound,
    onReactionKeyDown: this.handleReactionKeyDownBound,
    onReactionPointerDown: this.handleReactionPointerDownBound,
    onReactionPointerMove: this.handlePointerMoveBound,
    onReactionPointerUp: this.handlePointerUpBound,
    onReactionPointerCancel: this.handlePointerCancelBound,
    onReactionPointerLeave: this.handlePointerLeaveBound,
    onReactionContextMenu: this.handleTouchContextMenuBound,
  }

  // Edit/Delete/Reply stable handlers
  private readonly handleEditBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const cf = this.commentsFeature
    if (!cf) return
    const msg = cf.getMessage(id)
    if (!msg) return
    // Only text content can be edited
    const body = (msg.content as unknown as Record<string, unknown>).body as string | undefined
    this.editingId = id
    this.editingDraft = body ?? ""
    this.deletingId = null
    this.requestUpdate()
    // focus will be handled by render
  }
  private readonly handleDeleteBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    this.deletingId = id
    this.editingId = null
    this.requestUpdate()
  }
  private readonly handleReplyBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const editor =
      this.editorEl ?? (this.shadowRoot?.querySelector("cumments-editor") as CummentsEditor | null)
    if (editor) {
      editor.setReplyToId(id)
    }
  }
  private readonly handleSaveBound = async (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const draft = this.editingDraft.trim()
    if (!draft) return
    const cf = this.commentsFeature
    if (!cf) return
    this.savingId = id
    this.requestUpdate()
    try {
      await cf.editComment(id, draft)
      this.editingId = null
      this.editingDraft = ""
    } catch {
      // keep editing state
    } finally {
      this.savingId = null
      this.requestUpdate()
    }
  }
  private readonly handleCancelEditBound = () => {
    this.editingId = null
    this.editingDraft = ""
    this.requestUpdate()
  }
  private readonly handleEditInputBound2 = (e: Event) => {
    this.editingDraft = (e.target as HTMLInputElement).value
    this.requestUpdate()
  }
  private readonly handleEditKeydownBound = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.handleCancelEditBound()
    } else if (e.key === "Enter") {
      // Save on Enter (if not composing)
      const id = (e.currentTarget as HTMLElement).dataset.eventId
      if (id) this.handleSaveBound(e)
    }
  }
  private readonly handleConfirmDeleteBound = async (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const cf = this.commentsFeature
    if (!cf) return
    this.deletingSaving = id
    this.requestUpdate()
    try {
      await cf.deleteComment(id)
      this.deletingId = null
    } catch {
      // keep confirm state
    } finally {
      this.deletingSaving = null
      this.requestUpdate()
    }
  }
  private readonly handleCancelDeleteBound = () => {
    this.deletingId = null
    this.requestUpdate()
  }

  private readonly handleAvatarSelectBound = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file || !this.runtime) return
    try {
      await this.runtime.profile.setAvatar(file)
      this.requestUpdate()
    } catch {
      this.requestUpdate()
    } finally {
      ;(e.target as HTMLInputElement).value = ""
    }
  }

  private readonly handleAvatarDeleteBound = async () => {
    if (!this.runtime) return
    try {
      await this.runtime.profile.deleteAvatar()
      this.requestUpdate()
    } catch {
      this.requestUpdate()
    }
  }

  private readonly handleSwitchIdentityBound = async (e: Event) => {
    const pk = (e.currentTarget as HTMLElement).dataset.publicKey
    if (!pk || !this.runtime) return
    try {
      this.runtime.identity.setActive(pk)
      await new Promise((r) => setTimeout(r, 50))
    } catch {}
    this.requestUpdate()
  }

  private readonly handleRemoveIdentityBound = async (e: Event) => {
    const pk = (e.currentTarget as HTMLElement).dataset.publicKey
    if (!pk || !this.runtime) return
    this.runtime.identity.removeIdentity(pk)
    const active = this.runtime.identity.active
    if (active) {
      this.runtime.identity.setActive(active.publicKey)
    }
    this.requestUpdate()
  }

  private readonly handleAddRandomIdentityBound = async () => {
    if (!this.runtime) return
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    this.runtime.identity.addIdentity(id)
    this.runtime.identity.setActive(id.publicKey)
    this.requestUpdate()
  }

  private readonly handleExportMnemonicBound = async (e: Event) => {
    const pk = (e.currentTarget as HTMLElement).dataset.publicKey
    if (!pk || !this.runtime) return
    try {
      const words = await this.runtime.identity.exportMnemonic(pk)
      this.showMnemonic = words
      this.showBackup = null
      this.importError = null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("not available")) {
        this.showMnemonic = `Mnemonic backup is only available for mnemonic-derived identities. Public key: ${pk.slice(0, 16)}...`
      } else {
        this.importError = msg
      }
    }
    this.requestUpdate()
  }

  private readonly handleExportBackupBound = async (e: Event) => {
    const pk = (e.currentTarget as HTMLElement).dataset.publicKey
    if (!pk || !this.runtime) return
    try {
      const json = await this.runtime.identity.exportIdentity(pk)
      this.showBackup = json
      this.showMnemonic = null
      this.importError = null
    } catch (err) {
      this.importError = err instanceof Error ? err.message : String(err)
    }
    this.requestUpdate()
  }

  private readonly handleCopyBackupBound = async () => {
    if (this.showBackup && navigator.clipboard) {
      await navigator.clipboard.writeText(this.showBackup)
    }
  }

  private readonly handleImportBackupBound = async (e: Event) => {
    const input = e.target as HTMLInputElement
    let raw = ""
    if (input.files && input.files[0]) {
      raw = await input.files[0].text()
    } else {
      raw = (input as unknown as HTMLTextAreaElement).value
    }
    if (!raw.trim() || !this.runtime) return
    try {
      const id = await this.runtime.identity.importIdentityBackup(raw)
      this.runtime.identity.setActive(id.publicKey)
      this.importError = null
      this.showBackup = null
      this.showMnemonic = null
    } catch (err) {
      this.importError = err instanceof Error ? err.message : String(err)
    }
    this.requestUpdate()
    if (input) input.value = ""
  }

  private readonly handleCopyMnemonicBound = async () => {
    if (this.showMnemonic && navigator.clipboard) {
      await navigator.clipboard.writeText(this.showMnemonic)
    }
  }

  private readonly handleImportMnemonicBound = async (e: Event) => {
    const input = e.target as HTMLInputElement
    let words = ""
    if (input.files && input.files[0]) {
      words = await input.files[0].text()
    } else {
      words = input.value
    }
    if (!words.trim() || !this.runtime) return
    try {
      const id = await this.runtime.identity.importMnemonic(words)
      this.runtime.identity.setActive(id.publicKey)
      this.importError = null
      this.showMnemonic = words.trim()
    } catch (err) {
      this.importError = err instanceof Error ? err.message : String(err)
    }
    this.requestUpdate()
    if (input) input.value = ""
  }

  private readonly handlePollVoteBound = async (e: Event) => {
    const detail = (e as CustomEvent).detail as { pollId: string; optionId: string }
    if (!detail?.pollId || !detail?.optionId || !this.runtime) return
    try {
      await this.runtime.comments.votePoll(detail.pollId, detail.optionId)
    } catch {}
    this.requestUpdate()
  }

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
    // Listen for editor submit events (bubbles + composed)
    this.addEventListener("cumments:submit", this.handleEditorSubmit as EventListener)
    void this.ensureRuntime()
  }

  disconnectedCallback(): void {
    this.clearAllTimers()
    this.removeWindowListeners()
    this.openKey = null
    this.tooltipPos = null
    this.storeUnsub?.()
    this.storeUnsub = null
    this.removeEventListener("cumments:submit", this.handleEditorSubmit as EventListener)
    // Runtime lifecycle is owned by RuntimeController
    super.disconnectedCallback()
  }

  updated(changed: Map<string, unknown>): void {
    if (
      changed.has("endpoint") ||
      changed.has("siteId") ||
      changed.has("pageSlug") ||
      changed.has("perPage")
    ) {
      void this.ensureRuntime(true)
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
    if (this.openKey && this.commentsFeature) {
      const valid = this.isOpenKeyValid(this.openKey)
      if (!valid) {
        this.openKey = null
      }
    }
  }

  private async ensureRuntime(force = false): Promise<void> {
    if (!this.endpoint || !this.siteId || !this.pageSlug) return
    if (this.runtime) {
      if (!force) return
      this.runtime.update({
        endpoint: this.endpoint,
        siteId: this.siteId,
        pageSlug: this.pageSlug,
        perPage: this.perPage,
      })
      this.bindStore()
      this.requestUpdate()
      return
    }
    this.runtime = new AppRuntime({
      endpoint: this.endpoint,
      siteId: this.siteId,
      pageSlug: this.pageSlug,
      perPage: this.perPage,
    })
    if (!this.runtimeController) {
      this.runtimeController = new RuntimeController(this, () => this.runtime)
      this.addController(this.runtimeController as unknown as import("lit").ReactiveController)
    }
    // Let RuntimeController handle start via hostConnected; if already connected, start now
    if (this.isConnected) {
      void this.runtime.start()
    }
    this.bindStore()
    this.requestUpdate()
  }

  private bindStore(): void {
    this.storeUnsub?.()
    const cf = this.commentsFeature
    if (cf) {
      this.storeUnsub = cf.subscribe(() => this.requestUpdate())
    } else {
      this.storeUnsub = null
    }
  }

  async reload(): Promise<void> {
    await this.runtime?.comments.refresh()
  }

  private getReactorKey(eventId: string, key: string): string {
    return `${eventId}::${key}`
  }

  private getTooltipId(key: string): string {
    let id = this.tooltipIds.get(key)
    if (!id) {
      // Use instance-local counter to avoid encoding event_id / mxid / public_key
      id = `reactor-tip-${this.instanceId}-${this.tooltipIds.size}`
      this.tooltipIds.set(key, id)
    }
    return id
  }

  private isOpenKeyValid(key: string): boolean {
    const cf = this.commentsFeature
    const runtime = this.runtime
    if (!cf || !runtime) return false
    const ordered: Message[] = cf.pageMessages
    for (const c of ordered) {
      const vm = toViewModel(c, runtime.identity.active?.publicKey ?? null)
      for (const r of vm.message.reactions ?? []) {
        if (this.getReactorKey(vm.message.event_id, r.key) === key) return true
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
    // Touch-generated focus (pointerdown touch still active) must not open disclosure
    // Short touch should only react, long-press will open via timer
    if (this.touchActive) return
    this.clearAllTimers()
    if (this.escapeSuppressedKey === key) return
    this.openDisclosure(key)
  }

  private handleBlur(key: string): void {
    this.escapeSuppressedKey = null
    this.touchActive = false
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
    this.touchActive = true
    this.gestureId += 1
    // Any pending suppression for a previous gesture is now stale — clear it
    if (this.suppressClickForGesture !== null && this.suppressClickForGesture !== this.gestureId) {
      this.suppressClickForGesture = null
    }
    const thisGesture = this.gestureId
    this.longPressStart = { x: e.clientX, y: e.clientY }
    this.longPressed = false
    if (this.longPressTimer) clearTimeout(this.longPressTimer)
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null
      this.longPressed = true
      this.suppressClickForGesture = thisGesture
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
      // keep touchActive true until after click/focus handling; clear on next tick
      // focus that occurs as part of this gesture has already been suppressed
      setTimeout(() => {
        this.touchActive = false
      }, 0)
      // allow normal click
      return
    }
    if (this.longPressed) {
      // long press activated, keep suppression until click
      this.longPressed = false
      this.longPressStart = null
      // keep touchActive until click is suppressed, then clear
      setTimeout(() => {
        this.touchActive = false
      }, 0)
      e.preventDefault()
    } else {
      // No long-press, clear touchActive shortly after gesture ends to allow next keyboard focus
      setTimeout(() => {
        this.touchActive = false
      }, 0)
    }
  }

  private handlePointerCancel(): void {
    this.touchActive = false
    this.cancelLongPress()
  }

  private handlePointerLeave(): void {
    this.touchActive = false
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
    if (this.longPressTimer || this.longPressed || this.suppressClickForGesture !== null) {
      e.preventDefault()
    }
  }

  private handleReactionClick(e: MouseEvent, eventId: string, key: string, mine: boolean): void {
    if (this.suppressClickForGesture !== null && this.suppressClickForGesture === this.gestureId) {
      this.suppressClickForGesture = null
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (this.suppressClickForGesture !== null) {
      this.suppressClickForGesture = null
    }
    this.runtime?.comments.toggleReaction(eventId, key, mine).catch(() => {})
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
    const runtime = this.runtime
    const cf = this.commentsFeature
    const t = messages[resolveLocale(this.lang)]
    if (!runtime || !cf) {
      return html`<div class="wrap" part="wrap"><div class="empty">${t.endpointRequired}</div></div>`
    }
    const snap = cf.snapshot()
    const ordered: Message[] = snap.messages
    const meta = snap.meta
    const pending = snap.pending
    // Reply target for editor
    const profile = runtime.profile.current
    const identities = [...runtime.identity.identities] as import("../identity/keypair").Identity[]
    const activePk = runtime.identity.active?.publicKey ?? null
    return html`
      <div class="wrap" part="wrap">
        <div class="header" part="header">
          <span>${t.comments} · ${meta?.total ?? ordered.length}</span>
          <span style="font-size:12px;color:${runtime.realtime.connected ? "#16a34a" : "#94a3b8"}"
            >${runtime.realtime.connected ? t.live : t.offline}</span
          >
        </div>
        ${renderProfileBar(profile, "", t, () => {}, this.handleAvatarSelectBound, this.handleAvatarDeleteBound)}
        ${renderIdentityVault(identities, activePk, t, this.handleSwitchIdentityBound, this.handleRemoveIdentityBound, this.handleAddRandomIdentityBound, this.handleImportMnemonicBound, this.showMnemonic, this.handleExportMnemonicBound, this.handleCopyMnemonicBound, this.importError, this.showBackup, this.handleExportBackupBound, this.handleImportBackupBound, this.handleCopyBackupBound)}
        ${snap.loading ? html`<div class="empty">${t.loading}</div>` : ""}
        ${snap.error ? html`<div class="error" part="error" role="alert" aria-live="assertive">${snap.error}</div>` : ""}
        ${pending ? html`<div class="pending">${t.waitingSync}</div>` : ""}
        ${!snap.loading && ordered.length === 0 ? html`<div class="empty">${t.noComments}</div>` : ""}
        <div class="list" part="list" role="feed" @poll-vote=${this.handlePollVoteBound}>
          ${repeat(
            ordered,
            (c: Message) => c.event_id,
            (c: Message) => {
              const vm = toViewModel(c, runtime.identity.active?.publicKey ?? null)
              const content = renderContent(vm.message)
              const reactionBar = renderReactionBar(
                vm,
                this.openKey,
                this.tooltipPos,
                this.getReactorKey.bind(this),
                this.getTooltipId.bind(this),
                this.getOthersText.bind(this),
                this.getAriaLabel.bind(this),
                this.getReactorDisplayName.bind(this),
                this.getInitials.bind(this),
                t,
                this.reactionHandlers,
              )
              const quickReactions = renderQuickReactions(vm, t, this.handleQuickReactionBound)
              const isEditing = this.editingId === vm.message.event_id
              const isDeleting = this.deletingId === vm.message.event_id
              const replyTarget = vm.message.reply_to
                ? (cf.getMessage(vm.message.reply_to) ?? null)
                : null
              // thread_root is preserved but not directly rendered beyond reply_to reference
              return renderComment(vm, t, content, reactionBar, quickReactions, {
                isEditing,
                editingDraft: this.editingDraft,
                isDeleting,
                replyTarget,
                actions: {
                  onEdit: this.handleEditBound,
                  onDelete: this.handleDeleteBound,
                  onReply: this.handleReplyBound,
                  onSave: this.handleSaveBound,
                  onCancelEdit: this.handleCancelEditBound,
                  onEditInput: this.handleEditInputBound2,
                  onEditKeydown: this.handleEditKeydownBound,
                  onConfirmDelete: this.handleConfirmDeleteBound,
                  onCancelDelete: this.handleCancelDeleteBound,
                },
              })
            },
          )}
        </div>
        ${renderPagination(snap.meta?.page ?? 1, meta?.total_pages ?? 1, t, this.handlePagePrevBound, this.handlePageNextBound)}
        <cumments-editor
          .lang=${this.lang}
          .displayNameHint=${this.runtime?.profile.current?.display_name ?? ""}
          .getMessage=${(id: string) => this.runtime?.comments.getMessage(id)}
          .uploadMedia=${this.handleEditorUploadMedia}
          .shareLocation=${this.handleEditorLocationShare}
          .stickerPacks=${null}
          .stickerLoading=${false}
          @cumments:submit=${this.handleEditorSubmit}
        ></cumments-editor>
      </div>
    `
  }

  private handleGlobalKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (this.editingId) {
        this.editingId = null
        this.editingDraft = ""
        this.requestUpdate()
      } else if (this.deletingId) {
        this.deletingId = null
        this.requestUpdate()
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-comments": CummentsComments
  }
}
