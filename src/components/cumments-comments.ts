import { css, html, LitElement, nothing } from "lit"
import { customElement, property, query, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../api/contract/query"
import { resolveLocale } from "../i18n/locale"
import { messages } from "../i18n/messages"
import { AppRuntime } from "../runtime/app-runtime"
import {
  renderActionMenu,
  renderComment,
  renderContent,
  renderDeleteDialog,
  renderIdentityCapsule,
  renderIdentityDialog,
  renderIdentityPopover,
  renderPagination,
  renderReactionPicker,
  renderThreadDialog,
} from "./render"
import "./editor/cumments-editor"
import "./poll/poll-view"
import { RuntimeController } from "../runtime/runtime-controller"
import { graphemeLength } from "../utils/grapheme"
import type { CummentsEditor } from "./editor/cumments-editor"
import { toViewModel } from "./view-model"

/**
 * Pointer transit grace for the reactor panel: the panel is offset from its
 * reaction pill, so a pointer moving from one to the other briefly leaves both.
 * Short by design — it only bridges that gap, it does not keep the panel open.
 */
const REACTOR_PANEL_HIDE_GRACE_MS = 120

/**
 * Which rendered copy of a message owns a transient. The same message can be
 * on screen twice at once (main feed + Thread dialog), so a message identity
 * alone cannot address a single rendering surface.
 */
type ReactionPickerSurface = "main" | "thread"

interface ReactionPickerTarget {
  eventId: string
  surface: ReactionPickerSurface
}

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
  private threadUnsub: (() => void) | null = null
  private stickerUnsub: (() => void) | null = null
  private profileUnsub: (() => void) | null = null

  private runtime: AppRuntime | null = null
  private runtimeController: RuntimeController | null = null
  @query("cumments-editor") private editorEl!: CummentsEditor | null
  private get commentsFeature() {
    return this.runtime?.comments ?? null
  }
  private get threadFeature() {
    return this.runtime?.thread ?? null
  }

  @state() private openKey: string | null = null
  @state() private editingId: string | null = null
  @state() private editingDraft: string = ""
  @state() private deletingId: string | null = null
  @state() private showMnemonic: string | null = null
  @state() private showBackup: string | null = null
  @state() private importError: string | null = null
  @state() private identityPopoverOpen = false
  @state() private identityDialog: {
    type: "create" | "import" | "backup" | "mnemonic" | "manage" | null
  } | null = null
  @state() private profileDialogOpen = false
  @state() private profileDraftName = ""
  @state() private profileDisplayNameError: string | null = null
  @state() private profileAvatarError: string | null = null
  @state() private profileSaving = false
  private profileTrigger: HTMLElement | null = null
  @state() private pendingReactionKey: string | null = null
  /**
   * Reaction-picker target: message id *and* rendering surface. The same
   * message can appear in both the main feed and the Thread dialog, so keying
   * on the event id alone would open a picker in both copies.
   */
  @state() private reactionPickerFor: ReactionPickerTarget | null = null
  /**
   * Reactor-details panel target. Keyed by message event id *and* reaction key,
   * because several comments can carry the same emoji. Rendered only while it
   * is the active transient (`openKey === "reactor-panel"`).
   */
  @state() private reactorPanelFor: { eventId: string; key: string } | null = null
  /**
   * Deferred-hide handle for the reactor panel. Leaving the trigger or the
   * panel starts a short grace so the pointer can cross the gap between them;
   * entering either cancels it.
   */
  private reactorHideTimer: ReturnType<typeof setTimeout> | null = null
  private pendingDeleteTrigger: HTMLElement | null = null
  // Thread reader: the root this dialog is open for (null = closed)
  @state() private threadOpenFor: string | null = null
  private threadTrigger: HTMLElement | null = null
  private threadTriggerId: string | null = null

  private boundWindowClick: ((e: MouseEvent) => void) | null = null
  private boundWindowScroll: (() => void) | null = null
  private boundWindowResize: (() => void) | null = null
  private boundWindowKeydown: ((e: KeyboardEvent) => void) | null = null

  // Stable handlers for render functions (avoid per-render closures)
  private readonly handleReactionClickBound = (e: Event) => {
    const t = e.currentTarget as HTMLElement
    const eventId = t.dataset.eventId
    const key = t.dataset.reactionKey
    const mine = t.dataset.reactionMine === "1"
    if (eventId && key) this.handleReactionClick(e as MouseEvent, eventId, key, mine)
  }

  // Identity capsule/popover
  private readonly handleIdentityCapsuleClick = (e: Event) => {
    e.stopPropagation()
    this.editorEl?.closeStickerPicker()
    this.identityPopoverOpen = !this.identityPopoverOpen
    if (this.identityPopoverOpen) {
      this.openKey = "identity-popover"
      this.reactionPickerFor = null
    } else {
      this.openKey = null
    }
    this.requestUpdate()
  }

  private readonly handleIdentityPopoverClose = () => {
    this.identityPopoverOpen = false
    this.openKey = null
    this.requestUpdate()
    // focus return to capsule
    const btn = this.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement | null
    btn?.focus()
  }

  private readonly handleIdentityCreate = () => {
    this.identityPopoverOpen = false
    this.openKey = null
    this.identityDialog = { type: "create" }
    this.requestUpdate()
  }

  private readonly handleIdentityImport = () => {
    this.identityPopoverOpen = false
    this.openKey = null
    this.identityDialog = { type: "import" }
    this.requestUpdate()
  }

  private readonly handleIdentityManage = () => {
    this.identityPopoverOpen = false
    this.openKey = null
    this.identityDialog = { type: "manage" }
    this.requestUpdate()
  }

  private readonly handleProfileOpen = () => {
    this.profileTrigger = this.shadowRoot?.querySelector(
      '[part="identity-capsule"]',
    ) as HTMLElement | null
    this.identityPopoverOpen = false
    this.openKey = null
    this.profileDialogOpen = true
    this.profileDraftName = this.runtime?.profile.current?.display_name ?? ""
    this.profileDisplayNameError = null
    this.profileAvatarError = null
    this.requestUpdate()
    queueMicrotask(() => {
      const dlg = this.shadowRoot?.querySelector(
        '[role="dialog"][aria-modal="true"]',
      ) as HTMLElement | null
      const input = dlg?.querySelector(
        'input[aria-label="Profile display name"]',
      ) as HTMLElement | null
      input?.focus()
    })
  }

  private readonly handleProfileClose = () => {
    const trigger = this.profileTrigger
    this.profileDialogOpen = false
    this.profileDisplayNameError = null
    this.requestUpdate()
    if (trigger) queueMicrotask(() => trigger.focus())
    else {
      const btn = this.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement | null
      btn?.focus()
    }
  }

  private readonly handleProfileDisplayNameInput = (e: Event) => {
    this.profileDraftName = (e.target as HTMLInputElement).value
    if (this.profileDisplayNameError) {
      const trimmed = this.profileDraftName.trim()
      if (graphemeLength(trimmed) <= 50) this.profileDisplayNameError = null
    }
  }

  private readonly handleProfileDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleProfileClose()
      return
    }
    if (e.key === "Tab") {
      const dlg = e.currentTarget as HTMLElement
      const focusable = Array.from(
        dlg.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[]
      const visible = focusable.filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      )
      if (visible.length === 0) return
      const first = visible[0]
      const last = visible[visible.length - 1]
      const active = (this.shadowRoot?.activeElement ??
        document.activeElement) as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  private readonly handleProfileSave = () => {
    if (!this.runtime) return
    const trimmed = this.profileDraftName.trim()
    if (graphemeLength(trimmed) > 50) {
      this.profileDisplayNameError = "Display name must be 50 characters or fewer"
      this.requestUpdate()
      return
    }
    this.runtime.profile.setDisplayName(this.profileDraftName)
    const trigger = this.profileTrigger
    this.profileDialogOpen = false
    this.profileDisplayNameError = null
    this.requestUpdate()
    if (trigger) queueMicrotask(() => trigger.focus())
  }

  private readonly handleProfileAvatarSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !this.runtime) {
      if (input) input.value = ""
      return
    }
    this.profileAvatarError = null
    this.profileSaving = true
    this.requestUpdate()
    try {
      await this.runtime.profile.setAvatar(file)
    } catch (err) {
      this.profileAvatarError = err instanceof Error ? err.message : String(err)
    } finally {
      this.profileSaving = false
      input.value = ""
      this.requestUpdate()
    }
  }

  private readonly handleProfileAvatarRemove = async () => {
    if (!this.runtime) return
    this.profileAvatarError = null
    this.profileSaving = true
    this.requestUpdate()
    try {
      await this.runtime.profile.deleteAvatar()
    } catch (err) {
      this.profileAvatarError = err instanceof Error ? err.message : String(err)
    } finally {
      this.profileSaving = false
      this.requestUpdate()
    }
  }

  private readonly handleIdentityDialogClose = () => {
    this.identityDialog = null
    this.requestUpdate()
    const btn = this.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement | null
    btn?.focus()
  }

  // Action menu
  private readonly handleActionMenuToggle = (e: Event) => {
    this.editorEl?.closeStickerPicker()
    const trigger = e.currentTarget as HTMLElement
    const id = trigger.dataset.eventId
    if (!id) return
    const key = `action-menu:${id}`
    if (this.openKey === key) {
      const t = trigger
      this.openKey = null
      this.requestUpdate()
      queueMicrotask(() => t.focus())
    } else {
      this.openKey = key
      this.identityPopoverOpen = false
      this.reactionPickerFor = null
      this.requestUpdate()
      queueMicrotask(() => {
        const menu = this.shadowRoot?.querySelector('[role="menu"]') as HTMLElement | null
        const first = menu?.querySelector('[role="menuitem"]') as HTMLElement | null
        first?.focus()
      })
    }
  }

  private readonly handleActionMenuClose = () => {
    this.closeTransient(this.getTransientTrigger())
  }

  private readonly handleActionMenuKeyDown = (e: KeyboardEvent) => {
    const menu = e.currentTarget as HTMLElement
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[]
    if (items.length === 0) return
    const active = (this.shadowRoot?.activeElement ?? document.activeElement) as HTMLElement | null
    const currentIdx = items.indexOf(active as HTMLElement)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = items[(currentIdx + 1) % items.length]
      next?.focus()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = items[(currentIdx - 1 + items.length) % items.length]
      prev?.focus()
    } else if (e.key === "Home") {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === "End") {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.closeTransient(this.getTransientTrigger())
    }
  }

  private readonly handleCopyLink = async (e: Event) => {
    const trigger = this.getTransientTrigger()
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const url = `${location.origin}${location.pathname}#${id}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {}
    this.closeTransient(trigger)
  }

  // Reaction picker

  /**
   * Surface-aware identity for the transient. The event id alone collides when
   * a message is rendered in both the main feed and the Thread dialog.
   */
  private reactionPickerKey(target: ReactionPickerTarget): string {
    return `reaction-picker:${target.surface}:${target.eventId}`
  }

  private parseReactionPickerKey(key: string): ReactionPickerTarget | null {
    const rest = key.slice("reaction-picker:".length)
    const sep = rest.indexOf(":")
    if (sep === -1) return null
    const surface = rest.slice(0, sep)
    if (surface !== "main" && surface !== "thread") return null
    return { eventId: rest.slice(sep + 1), surface }
  }

  private isReactionPickerTarget(
    target: ReactionPickerTarget | null,
    candidate: ReactionPickerTarget,
  ): boolean {
    return target?.eventId === candidate.eventId && target.surface === candidate.surface
  }

  private readonly handleReactionPickerToggle = (e: Event) => {
    this.editorEl?.closeStickerPicker()
    const trigger = e.currentTarget as HTMLElement
    const id = trigger.dataset.eventId
    if (!id) return
    // The surface is carried on the trigger that was actually activated, so the
    // duplicate copy of the message never receives the picker.
    const target: ReactionPickerTarget = {
      eventId: id,
      surface: trigger.dataset.reactionSurface === "thread" ? "thread" : "main",
    }
    if (this.isReactionPickerTarget(this.reactionPickerFor, target)) {
      this.reactionPickerFor = null
      this.openKey = null
      this.requestUpdate()
      queueMicrotask(() => trigger.focus())
    } else {
      this.reactionPickerFor = target
      this.openKey = this.reactionPickerKey(target)
      this.identityPopoverOpen = false
      this.requestUpdate()
      queueMicrotask(() => {
        const picker = this.shadowRoot?.querySelector(
          '[role="dialog"][aria-label="Pick reaction"]',
        ) as HTMLElement | null
        if (picker) {
          this.positionPalette(trigger, picker)
          const first = picker.querySelector("button") as HTMLElement | null
          first?.focus()
        }
      })
    }
  }

  /**
   * Calculates and applies viewport-aware positioning for the quick reaction
   * palette. Prefers placing above the trigger whenever there is sufficient
   * space; only places below when above does not fit. Clamps horizontally
   * inside the viewport.
   */
  private positionPalette(trigger: HTMLElement, picker: HTMLElement): void {
    const triggerRect = trigger.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    const margin = 8
    const gap = 4

    const spaceAbove = triggerRect.top
    const pickerH = pickerRect.height
    const pickerW = pickerRect.width

    // Prefer above whenever it fits; only place below when above is insufficient
    const placeAbove = spaceAbove >= pickerH
    const top = placeAbove ? triggerRect.top - pickerH - gap : triggerRect.bottom + gap

    // Clamp horizontally inside viewport
    let left = triggerRect.left
    const maxLeft = window.innerWidth - pickerW - margin
    if (left > maxLeft) left = maxLeft
    if (left < margin) left = margin

    picker.style.top = `${top}px`
    picker.style.left = `${left}px`
  }

  private readonly handleReactionSelect = (e: Event) => {
    const key = (e.currentTarget as HTMLElement).dataset.reactionKey
    // The surface is presentation only; the mutation still targets the message.
    const eventId = this.reactionPickerFor?.eventId
    if (!key || !eventId) return
    const trigger = this.getTransientTrigger()
    // Do not fabricate count; set pending and call toggle
    this.pendingReactionKey = key
    this.reactionPickerFor = null
    this.openKey = null
    this.requestUpdate()
    if (trigger) queueMicrotask(() => trigger.focus())
    this.runtime?.comments
      .toggleReaction(eventId, key, false)
      .finally(() => {
        this.pendingReactionKey = null
        this.requestUpdate()
      })
      .catch(() => {
        this.pendingReactionKey = null
        this.requestUpdate()
      })
  }
  private readonly handleEditorSubmit = async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      content: string
      displayName: string
      media?: { url: string; kind: string } | null
      geoUri?: string
    }
    if (!detail || !this.runtime) return
    try {
      await this.runtime.handleEditorSubmit(detail)
    } catch {
      // On failure, restore the Location draft so the user can retry.
      // The canonical error state lives in CommentsFeature._error and is
      // already surfaced via the existing alert rendering — do not rethrow.
      if (detail.geoUri) {
        this.editorEl?.restoreDraft(detail.content)
      }
      return
    }
    // On success, clear the location draft from the editor.
    if (detail.geoUri) {
      this.editorEl?.clearPendingLocation()
    }
  }

  /** Reply draft lifecycle → canonical ComposerContext (partial update). */
  private readonly handleReplyDraftChange = (replyToId: string | null) => {
    this.runtime?.editor.setReplyTarget(replyToId)
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

  private readonly handlePagePrevBound = () => {
    this.runtime?.comments.changePage(-1)
  }
  private readonly handlePageNextBound = () => {
    this.runtime?.comments.changePage(1)
  }

  // Edit/Delete/Reply stable handlers
  private readonly handleEditBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const cf = this.commentsFeature
    if (!cf) return
    const msg = cf.getMessage(id)
    if (!msg) return
    const body = (msg.content as unknown as Record<string, unknown>).body as string | undefined
    this.editingId = id
    this.editingDraft = body ?? ""
    this.deletingId = null
    this.openKey = null
    this.reactionPickerFor = null
    this.requestUpdate()
    queueMicrotask(() => {
      const input = this.shadowRoot?.querySelector(
        'input[aria-label="Edit comment"]',
      ) as HTMLElement | null
      input?.focus()
    })
  }
  private readonly handleDeleteBound = (e: Event) => {
    const trigger = this.getTransientTrigger() ?? (e.currentTarget as HTMLElement)
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    this.pendingDeleteTrigger = trigger as HTMLElement
    this.openKey = null
    this.reactionPickerFor = null
    this.identityPopoverOpen = false
    this.deletingId = id
    this.editingId = null
    this.requestUpdate()
    queueMicrotask(() => {
      const dlg = this.shadowRoot?.querySelector(
        '[role="dialog"][aria-labelledby="delete-title"]',
      ) as HTMLElement | null
      const cancelBtn = dlg?.querySelector("button") as HTMLElement | null
      cancelBtn?.focus()
    })
  }
  private readonly handleReplyBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    // Main-feed Reply is always main context: { threadRootId: null, replyToId }.
    // Thread membership is never inferred from the reply target.
    this.runtime?.editor.setComposerContext({ threadRootId: null, replyToId: id })
    const editor =
      this.editorEl ?? (this.shadowRoot?.querySelector("cumments-editor") as CummentsEditor | null)
    if (editor) {
      editor.setReplyToId(id)
    }
  }

  /**
   * Reply on a Thread reader message (root or member): the active Thread scope
   * is preserved from ThreadFeature and the selected message becomes the direct
   * reply target — { threadRootId: A, replyToId: B }, never { B, B }.
   */
  private readonly handleThreadReplyBound = (e: Event) => {
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    const tf = this.threadFeature
    if (!id || !tf) return
    const rootId = tf.snapshot().rootId
    if (!rootId) return
    this.runtime?.editor.setComposerContext({ threadRootId: rootId, replyToId: id })
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
    try {
      await cf.editComment(id, draft)
      this.editingId = null
      this.editingDraft = ""
    } catch {
      // keep editing state
    } finally {
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
    const trigger = this.pendingDeleteTrigger
    const id = (e.currentTarget as HTMLElement).dataset.eventId
    if (!id) return
    const cf = this.commentsFeature
    if (!cf) return
    try {
      await cf.deleteComment(id)
      this.deletingId = null
      this.pendingDeleteTrigger = null
      this.requestUpdate()
      if (trigger) queueMicrotask(() => trigger.focus())
    } catch {
      // keep confirm state
    } finally {
      this.requestUpdate()
    }
  }
  private readonly handleCancelDeleteBound = () => {
    const trigger = this.pendingDeleteTrigger
    this.deletingId = null
    this.pendingDeleteTrigger = null
    this.requestUpdate()
    if (trigger) queueMicrotask(() => trigger.focus())
  }

  private readonly handleDeleteDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleCancelDeleteBound()
      return
    }
    if (e.key === "Tab") {
      const dlg = e.currentTarget as HTMLElement
      const btns = Array.from(dlg.querySelectorAll("button")) as HTMLElement[]
      if (btns.length < 2) return
      const first = btns[0]
      const last = btns[btns.length - 1]
      const active = (this.shadowRoot?.activeElement ??
        document.activeElement) as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
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

  private readonly handleCopyBackupBound = async () => {
    if (this.showBackup && navigator.clipboard) {
      await navigator.clipboard.writeText(this.showBackup)
    }
  }

  private readonly handleImportBackupBound = async (e: Event) => {
    const input = e.target as HTMLInputElement
    let raw = ""
    if (input.files?.[0]) {
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
    if (input.files?.[0]) {
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

  private readonly handlePollVote = async (pollId: string, optionId: string): Promise<void> => {
    if (!this.runtime) throw new Error("runtime not ready")
    await this.runtime.comments.votePoll(pollId, optionId)
    this.requestUpdate()
  }

  // Thread reader
  private readonly handleViewThreadBound = (e: Event) => {
    const trigger = e.currentTarget as HTMLElement
    const id = trigger.dataset.eventId
    const tf = this.threadFeature
    if (!id || !tf) return
    this.threadTrigger = trigger
    this.threadTriggerId = id
    this.threadOpenFor = id
    // Close any transient popover behind the dialog
    this.openKey = null
    this.reactionPickerFor = null
    this.identityPopoverOpen = false
    void tf.open(id)
    // Entering Thread context resets the composer reply draft; the old
    // main-feed target must not leak into (or display alongside) the Thread.
    this.editorEl?.setReplyToId(null)
    this.requestUpdate()
    queueMicrotask(() => {
      const closeBtn = this.shadowRoot?.querySelector('[part="thread-close"]') as HTMLElement | null
      closeBtn?.focus()
    })
  }

  private readonly handleThreadClose = () => {
    const triggerId = this.threadTriggerId
    const stored = this.threadTrigger
    this.threadOpenFor = null
    this.threadTrigger = null
    this.threadTriggerId = null
    this.threadFeature?.close()
    // Leaving Thread context clears any selected member reply draft
    this.editorEl?.setReplyToId(null)
    // Reparent the composer back to the main feed before the dialog is removed
    // from the DOM — otherwise the shared editor element is destroyed with it.
    const editor = this.editorEl
    const mainSlot = this.shadowRoot?.querySelector('[part="main-composer"]')
    if (editor && mainSlot && editor.parentElement !== mainSlot) {
      mainSlot.appendChild(editor)
    }
    this.requestUpdate()
    // Focus returns to the opening control; re-query it since the feed may
    // have re-rendered while the dialog was open.
    queueMicrotask(() => {
      let btn: HTMLElement | null = stored
      if (triggerId) {
        const t = messages[resolveLocale(this.lang)]
        const found = this.shadowRoot?.querySelector(
          `button[aria-label="${t.viewThread}"][data-event-id="${CSS.escape(triggerId)}"]`,
        ) as HTMLElement | null
        if (found) btn = found
      }
      btn?.focus()
    })
  }

  private readonly handleThreadRetry = () => {
    const rootId = this.threadOpenFor
    const tf = this.threadFeature
    if (!rootId || !tf) return
    void tf.open(rootId)
    this.requestUpdate()
  }

  private readonly handleThreadLoadMore = () => {
    void this.threadFeature?.loadNextPage()
    this.requestUpdate()
  }

  private readonly handleThreadDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleThreadClose()
      return
    }
    if (e.key === "Tab") {
      const dlg = e.currentTarget as HTMLElement
      const focusable = Array.from(
        dlg.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[]
      const visible = focusable.filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      )
      if (visible.length === 0) return
      const first = visible[0]
      const last = visible[visible.length - 1]
      const active = (this.shadowRoot?.activeElement ??
        document.activeElement) as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
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
    }
    /* Formatted text typography — scoped to comment body */
    .body p {
      margin: 0 0 0.5em 0;
    }
    .body p:last-child {
      margin-bottom: 0;
    }
    .body a {
      color: var(--cumments-primary);
      text-decoration: underline;
    }
    .body a:focus-visible {
      outline: 2px solid var(--cumments-primary);
      outline-offset: 2px;
    }
    .body code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.875em;
      background: #f1f5f9;
      padding: 0.125em 0.375em;
      border-radius: 4px;
    }
    .body pre {
      margin: 0.5em 0;
      padding: 0.75em;
      background: #f8fafc;
      border: 1px solid var(--cumments-border);
      border-radius: 6px;
      overflow-x: auto;
    }
    .body pre code {
      background: none;
      padding: 0;
    }
    .body blockquote {
      margin: 0.5em 0;
      padding-left: 0.75em;
      border-left: 3px solid var(--cumments-border);
      color: #64748b;
    }
    .body ul,
    .body ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
    .body li {
      margin: 0.25em 0;
    }
    .body img {
      max-width: 100%;
      height: auto;
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
      /* Must receive pointer events: the pointer moves from the reaction pill
         into the panel, and the panel keeps itself open while hovered. */
      pointer-events: auto;
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .reactor-panel {
        transition: opacity 120ms ease-out;
      }
    }
    .reactor-panel-title {
      font-weight: 600;
      margin-bottom: 4px;
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
    .thread-dialog {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: inherit;
    }
    .thread-panel {
      background: var(--cumments-bg);
      color: var(--cumments-text);
      border: 1px solid var(--cumments-border);
      border-radius: 12px;
      width: 100%;
      max-width: 560px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    .thread-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--cumments-border);
      flex-shrink: 0;
    }
    .thread-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    .thread-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: #64748b;
      line-height: 1;
      padding: 4px;
    }
    .thread-body {
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .thread-root {
      border: 1px solid var(--cumments-primary);
      border-radius: 8px;
    }
    .thread-section {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .thread-status {
      color: #64748b;
      font-size: 14px;
      text-align: center;
      padding: 12px;
    }
    .thread-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .thread-actions button {
      border-radius: 8px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 14px;
    }
    .thread-load-more {
      display: flex;
      justify-content: center;
    }
    .thread-load-more button {
      border: 1px solid var(--cumments-border);
      background: white;
      border-radius: 8px;
      padding: 6px 14px;
      cursor: pointer;
    }
    .thread-load-more button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .thread-composer {
      border-top: 1px solid var(--cumments-border);
      padding: 12px 16px;
      flex-shrink: 0;
      background: var(--cumments-bg);
    }
    @media (max-width: 640px) {
      .thread-dialog {
        padding: 0;
        align-items: stretch;
      }
      .thread-panel {
        max-width: none;
        max-height: none;
        height: 100%;
        border: none;
        border-radius: 0;
      }
    }
  `

  private readonly handleStickerToggle = (e: Event) => {
    const detail = (e as CustomEvent).detail as { open?: boolean }
    if (detail?.open) {
      this.openKey = null
      this.identityPopoverOpen = false
      this.reactionPickerFor = null
      this.requestUpdate()
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    // Listen for editor submit events (bubbles + composed)
    this.addEventListener("cumments:submit", this.handleEditorSubmit as EventListener)
    this.addEventListener("cumments:sticker-toggle", this.handleStickerToggle as EventListener)
    void this.ensureRuntime()
  }

  disconnectedCallback(): void {
    this.removeWindowListeners()
    this.clearReactorHideTimer()
    this.openKey = null
    this.storeUnsub?.()
    this.storeUnsub = null
    this.threadUnsub?.()
    this.threadUnsub = null
    this.stickerUnsub?.()
    this.stickerUnsub = null
    this.profileUnsub?.()
    this.profileUnsub = null
    this.removeEventListener("cumments:submit", this.handleEditorSubmit as EventListener)
    this.removeEventListener("cumments:sticker-toggle", this.handleStickerToggle as EventListener)
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
    if (changed.has("openKey")) {
      if (this.openKey) {
        this.editorEl?.closeStickerPicker()
        this.addWindowListeners()
      } else {
        this.removeWindowListeners()
      }
    }
    // Close if anchor no longer valid (message deleted or reaction removed)
    if (this.openKey && this.commentsFeature) {
      const valid = this.isOpenKeyValid(this.openKey)
      if (!valid) {
        this.openKey = null
      }
    }
    // Opening another transient replaces openKey directly in places, so drop a
    // reactor target that is no longer the active transient.
    if (this.reactorPanelFor && this.openKey !== "reactor-panel") {
      this.reactorPanelFor = null
    }
    this.placeComposer()
  }

  /**
   * Reparents the single shared composer element so the user-visible composer
   * belongs to the active surface: inside the Thread panel while a Thread is
   * open, back in the main feed when closed. One <cumments-editor> instance is
   * moved between slots — its state, context binding, and event wiring are
   * never duplicated.
   */
  private placeComposer(): void {
    const editor = this.editorEl
    if (!editor) return
    const threadSlot = this.shadowRoot?.querySelector('[part="thread-composer"]')
    const mainSlot = this.shadowRoot?.querySelector('[part="main-composer"]')
    if (threadSlot && editor.parentElement !== threadSlot) {
      threadSlot.appendChild(editor)
    } else if (!threadSlot && mainSlot && editor.parentElement !== mainSlot) {
      mainSlot.appendChild(editor)
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
    this.threadUnsub?.()
    const tf = this.threadFeature
    if (tf) {
      this.threadUnsub = tf.subscribe(() => this.requestUpdate())
    } else {
      this.threadUnsub = null
    }
    this.stickerUnsub?.()
    const rt = this.runtime
    if (rt) {
      this.stickerUnsub = rt.subscribeStickers(() => this.requestUpdate())
    } else {
      this.stickerUnsub = null
    }
    this.profileUnsub?.()
    if (rt) {
      this.profileUnsub = rt.profile.subscribe(() => this.requestUpdate())
    } else {
      this.profileUnsub = null
    }
  }

  async reload(): Promise<void> {
    await this.runtime?.comments.refresh()
  }

  private isOpenKeyValid(key: string): boolean {
    if (key === "identity-popover") return true
    if (key.startsWith("action-menu:")) {
      const id = key.slice("action-menu:".length)
      return !!this.commentsFeature?.getMessage(id)
    }
    if (key.startsWith("reaction-picker:")) {
      const target = this.parseReactionPickerKey(key)
      return !!target && !!this.commentsFeature?.getMessage(target.eventId)
    }
    if (key === "reactor-panel") {
      // Closes when the anchor message leaves the visible list, the reaction is
      // gone, or the page was replaced.
      const target = this.reactorPanelFor
      if (!target) return false
      const message = this.visibleMessage(target.eventId)
      if (!message) return false
      return !!message.reactions?.some((r) => r.key === target.key)
    }
    return false
  }

  private closeTransient(returnFocusTo: HTMLElement | null = null): void {
    const prevKey = this.openKey
    this.openKey = null
    this.clearReactorHideTimer()
    if (prevKey === "identity-popover") this.identityPopoverOpen = false
    if (prevKey?.startsWith("reaction-picker:")) this.reactionPickerFor = null
    if (prevKey === "reactor-panel") this.reactorPanelFor = null
    this.requestUpdate()
    if (returnFocusTo) queueMicrotask(() => returnFocusTo.focus())
  }

  private getTransientTrigger(): HTMLElement | null {
    const key = this.openKey
    if (!key) return null
    if (key === "identity-popover")
      return this.shadowRoot?.querySelector('[part="identity-capsule"]') as HTMLElement | null
    if (key.startsWith("action-menu:")) {
      const id = key.slice("action-menu:".length)
      return this.shadowRoot?.querySelector(
        `button[aria-label="More actions"][data-event-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null
    }
    if (key.startsWith("reaction-picker:")) {
      const target = this.parseReactionPickerKey(key)
      if (!target) return null
      // Scope by surface: the same message's Add reaction button exists in both
      // the main feed and the Thread dialog, and only one owns the picker.
      return this.shadowRoot?.querySelector(
        `button[aria-label="Add reaction"][data-event-id="${CSS.escape(target.eventId)}"][data-reaction-surface="${target.surface}"]`,
      ) as HTMLElement | null
    }
    if (key === "reactor-panel") {
      const target = this.reactorPanelFor
      if (!target) return null
      // Match on dataset rather than an attribute selector: reaction keys are
      // emoji and must not be interpolated into a CSS selector.
      const buttons = this.shadowRoot?.querySelectorAll("button[data-reaction-key]") ?? []
      for (const button of Array.from(buttons)) {
        const el = button as HTMLElement
        if (el.dataset.eventId === target.eventId && el.dataset.reactionKey === target.key) {
          return el
        }
      }
      return null
    }
    return null
  }

  private addWindowListeners(): void {
    if (this.boundWindowClick) return
    this.boundWindowClick = (e: MouseEvent) => {
      if (!this.openKey) return
      const path = e.composedPath() as EventTarget[]
      let inside = false
      for (const t of path) {
        if (!(t instanceof HTMLElement)) continue
        if (
          t.closest('[role="menu"]') ||
          t.closest('[role="dialog"]') ||
          t.getAttribute("aria-haspopup") === "menu" ||
          t.getAttribute("aria-haspopup") === "dialog"
        )
          inside = true
        // The hovered reaction pill is the panel's anchor: clicking it toggles
        // the reaction without dismissing the details it is showing.
        if (
          this.openKey === "reactor-panel" &&
          (t.closest("[data-reaction-key]") || t.closest(".reactor-panel"))
        )
          inside = true
      }
      if (inside) return
      this.closeTransient(this.getTransientTrigger())
    }
    this.boundWindowScroll = () => {
      if (this.openKey) this.closeTransient(this.getTransientTrigger())
    }
    this.boundWindowResize = () => {
      if (this.openKey !== null && this.reactionPickerFor !== null) {
        const trigger = this.getTransientTrigger()
        const picker = this.shadowRoot?.querySelector(
          '[role="dialog"][aria-label="Pick reaction"]',
        ) as HTMLElement | null
        if (trigger && picker) this.positionPalette(trigger, picker)
      }
      if (this.openKey === "reactor-panel") {
        const trigger = this.getTransientTrigger()
        const panel = this.shadowRoot?.querySelector(".reactor-panel") as HTMLElement | null
        if (trigger && panel) this.positionReactorPanel(trigger, panel)
      }
    }
    this.boundWindowKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (this.deletingId) {
          const trigger = this.pendingDeleteTrigger
          this.deletingId = null
          this.pendingDeleteTrigger = null
          this.requestUpdate()
          if (trigger) queueMicrotask(() => trigger.focus())
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (this.openKey) {
          this.closeTransient(this.getTransientTrigger())
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }
    window.addEventListener("click", this.boundWindowClick, true)
    window.addEventListener("scroll", this.boundWindowScroll, true)
    window.addEventListener("resize", this.boundWindowResize)
    window.addEventListener("keydown", this.boundWindowKeydown, true)
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
    if (this.boundWindowKeydown) {
      window.removeEventListener("keydown", this.boundWindowKeydown, true)
      this.boundWindowKeydown = null
    }
  }

  private handleReactionClick(_e: MouseEvent, eventId: string, key: string, mine: boolean): void {
    this.runtime?.comments.toggleReaction(eventId, key, mine).catch(() => {})
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

  // Reactor details — hover/focus disclosure of the bounded reactor sample
  // already present on the message. No extra request is made.

  private reactorPanelId(target: { eventId: string; key: string }): string {
    return `reactor-panel-${target.eventId}-${target.key}`
  }

  /**
   * The visible message for an event id. The reactor panel is anchored to a
   * rendered pill, so it must track the current page rather than the session
   * entity cache (which keeps messages after they leave the list).
   */
  private visibleMessage(eventId: string): Message | undefined {
    return this.commentsFeature?.pageMessages.find((m) => m.event_id === eventId)
  }

  private readonly handleReactionReveal = (e: Event) => {
    const el = e.currentTarget as HTMLElement
    const eventId = el.dataset.eventId
    const key = el.dataset.reactionKey
    if (eventId && key) this.showReactorPanel(eventId, key, el)
  }

  private readonly handleReactionConceal = (e: Event) => {
    const el = e.currentTarget as HTMLElement
    const target = this.reactorPanelFor
    if (!target) return
    if (target.eventId === el.dataset.eventId && target.key === el.dataset.reactionKey) {
      this.scheduleHideReactorPanel()
    }
  }

  // The trigger and the panel are one pointer interaction region: the panel is
  // fixed-positioned with a gap, so the pointer must cross non-panel space to
  // reach it. Leaving either edge defers the hide by a short transit grace, and
  // entering either edge cancels it. This is deliberately a bounded grace, not
  // a sticky panel — once the pointer settles outside both, it closes.
  private readonly handleReactorPanelEnter = () => {
    this.clearReactorHideTimer()
  }

  private readonly handleReactorPanelLeave = () => {
    this.scheduleHideReactorPanel()
  }

  private scheduleHideReactorPanel(): void {
    this.clearReactorHideTimer()
    this.reactorHideTimer = setTimeout(() => {
      this.reactorHideTimer = null
      this.hideReactorPanel()
    }, REACTOR_PANEL_HIDE_GRACE_MS)
  }

  private clearReactorHideTimer(): void {
    if (this.reactorHideTimer !== null) {
      clearTimeout(this.reactorHideTimer)
      this.reactorHideTimer = null
    }
  }

  private showReactorPanel(eventId: string, key: string, trigger: HTMLElement): void {
    const reaction = this.visibleMessage(eventId)?.reactions?.find((r) => r.key === key)
    // Never present a people list we cannot back with data.
    if (!reaction || reaction.reactors.length === 0) {
      this.hideReactorPanel()
      return
    }
    // A pending hide from the trigger or a previously shown panel must not fire
    // against the panel we are about to show.
    this.clearReactorHideTimer()
    const current = this.reactorPanelFor
    if (this.openKey === "reactor-panel" && current?.eventId === eventId && current.key === key) {
      return
    }
    // Only one transient may be open: this closes the picker, action menu, or
    // identity popover if one was showing.
    this.closeTransient()
    this.reactorPanelFor = { eventId, key }
    this.openKey = "reactor-panel"
    this.requestUpdate()
    void this.updateComplete.then(() => {
      const panel = this.shadowRoot?.querySelector(".reactor-panel") as HTMLElement | null
      if (panel) this.positionReactorPanel(trigger, panel)
    })
  }

  private hideReactorPanel(): void {
    this.clearReactorHideTimer()
    if (this.openKey !== "reactor-panel" && !this.reactorPanelFor) return
    this.closeTransient()
  }

  /**
   * Viewport-aware placement for the reactor panel. Prefers above the pill so
   * the pill is not obscured, flips below when there is no room above, and
   * clamps on both axes so edge reactions stay readable.
   */
  private positionReactorPanel(trigger: HTMLElement, panel: HTMLElement): void {
    const triggerRect = trigger.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const margin = 8
    const gap = 4
    const panelH = panelRect.height
    const panelW = panelRect.width

    const placeAbove = triggerRect.top - margin >= panelH + gap
    let top = placeAbove ? triggerRect.top - panelH - gap : triggerRect.bottom + gap
    if (top + panelH > window.innerHeight - margin) top = window.innerHeight - panelH - margin
    if (top < margin) top = margin

    let left = triggerRect.left
    const maxLeft = window.innerWidth - panelW - margin
    if (left > maxLeft) left = maxLeft
    if (left < margin) left = margin

    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
  }

  private renderReactorPanel(t: import("../i18n/messages").Messages) {
    const target = this.reactorPanelFor
    if (this.openKey !== "reactor-panel" || !target) return html``
    const reaction = this.visibleMessage(target.eventId)?.reactions?.find(
      (r) => r.key === target.key,
    )
    if (!reaction || reaction.reactors.length === 0) return html``
    const known = reaction.reactors
    // `count` covers all reactors; the payload only carries a bounded sample.
    const remaining = Math.max(0, reaction.count - known.length)
    return html`<div
      class="reactor-panel"
      role="tooltip"
      id="${this.reactorPanelId(target)}"
      style="top:0;left:0"
      @mouseenter=${this.handleReactorPanelEnter}
      @mouseleave=${this.handleReactorPanelLeave}
    >
      <div class="reactor-panel-title">${target.key} ${reaction.count}</div>
      ${repeat(
        known,
        (_reactor, i) => i,
        (reactor) => {
          const name = (reactor.display_name ?? "").trim() || t.reactorUnknown
          const initial = (name[0] ?? "?").toUpperCase()
          return html`<div class="reactor">
            ${
              reactor.avatar_url
                ? html`<img class="reactor-avatar" src="${reactor.avatar_url}" alt="" />`
                : html`<span class="reactor-avatar" aria-hidden="true">${initial}</span>`
            }
            <span class="reactor-name">${name}</span>
          </div>`
        },
      )}
      ${
        remaining > 0
          ? html`<div class="reactor-others">${
              remaining === 1 ? t.andOneOther : t.andNOthers.replace("{n}", String(remaining))
            }</div>`
          : ""
      }
    </div>`
  }

  /**
   * One comment rendered through the canonical renderer. Used by both the
   * main feed and the Thread reader.
   *
   * `inThread` renders a Thread-reader comment: management (edit/delete/copy)
   * stays hidden per the reader policy, while Reply targets the active Thread
   * scope. Ordinary message interactions (reactions, poll voting) stay enabled.
   */
  private buildComment(
    vm: import("./view-model").CommentViewModel,
    t: import("../i18n/messages").Messages,
    opts: {
      votingPollId?: string | null
      inThread?: boolean
      withThreadAction?: boolean
    },
  ) {
    const cf = this.commentsFeature
    const inThread = opts.inThread ?? false
    // Which rendered copy this is. The same message may be built for both the
    // main feed and the Thread dialog, so picker state must include the surface.
    const surface: ReactionPickerSurface = inThread ? "thread" : "main"
    const pickerTarget: ReactionPickerTarget = { eventId: vm.message.event_id, surface }
    const pickerOpenHere = this.isReactionPickerTarget(this.reactionPickerFor, pickerTarget)
    const isPoll = (vm.message.content as unknown as { type: string }).type === "poll"
    const content = isPoll
      ? html`<cumments-poll-view
          .message=${vm.message}
          .voting=${(opts.votingPollId ?? null) === vm.message.event_id}
          .onVote=${this.handlePollVote}
        ></cumments-poll-view>`
      : renderContent(vm.message)
    // New: summary + [+] picker, pending without count fabrication
    const reactionSummary = html`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
      ${repeat(
        vm.message.reactions ?? [],
        (r) => r.key,
        (r) => {
          const panelTarget = this.reactorPanelFor
          const describesPanel =
            this.openKey === "reactor-panel" &&
            panelTarget?.eventId === vm.message.event_id &&
            panelTarget.key === r.key
          return html`<button
          data-event-id="${vm.message.event_id}"
          data-reaction-key="${r.key}"
          data-reaction-mine="${r.mine ? "1" : "0"}"
          aria-label="${this.getAriaLabel(r, t)}"
          aria-describedby=${
            describesPanel
              ? this.reactorPanelId({ eventId: vm.message.event_id, key: r.key })
              : nothing
          }
          @click=${this.handleReactionClickBound}
          @mouseenter=${this.handleReactionReveal}
          @mouseleave=${this.handleReactionConceal}
          @focus=${this.handleReactionReveal}
          @blur=${this.handleReactionConceal}
          style="border:1px solid #e2e8f0;border-radius:16px;padding:2px 8px;font-size:12px;background:${r.mine ? "#e0e7ff" : "#f8fafc"};cursor:pointer;opacity:${this.pendingReactionKey === r.key ? "0.6" : "1"}"
        >${r.key} ${r.count}${this.pendingReactionKey === r.key ? html` <span style="font-size:10px;color:#64748b">[pending]</span>` : ""}</button>`
        },
      )}
      <button
        data-event-id="${vm.message.event_id}"
        data-reaction-surface="${surface}"
        aria-label="Add reaction"
        aria-haspopup="dialog"
        aria-expanded="${pickerOpenHere ? "true" : "false"}"
        @click=${this.handleReactionPickerToggle}
        style="width:28px;height:28px;border:1px dashed #e2e8f0;border-radius:16px;background:white;cursor:pointer;font-size:14px"
      >+</button>
      ${pickerOpenHere ? html`${renderReactionPicker(t, this.handleReactionSelect)}` : ""}
    </div>`
    const isEditing = !inThread && this.editingId === vm.message.event_id
    const replyTarget = vm.message.reply_to ? (cf?.getMessage(vm.message.reply_to) ?? null) : null
    const actionMenuKey = `action-menu:${vm.message.event_id}`
    const actionMenu =
      !inThread && this.openKey === actionMenuKey
        ? renderActionMenu(
            t,
            vm.isOwn,
            this.handleEditBound,
            this.handleCopyLink,
            this.handleDeleteBound,
            this.handleActionMenuClose,
            vm.message.event_id,
            this.handleActionMenuKeyDown,
          )
        : ""
    return renderComment(vm, t, content, html`${reactionSummary}`, {
      isEditing,
      editingDraft: this.editingDraft,
      replyTarget,
      hideManagement: inThread,
      viewThreadLabel: t.viewThread,
      actions: {
        onEdit: this.handleEditBound,
        onDelete: this.handleDeleteBound,
        onReply: inThread ? this.handleThreadReplyBound : this.handleReplyBound,
        onSave: this.handleSaveBound,
        onCancelEdit: this.handleCancelEditBound,
        onEditInput: this.handleEditInputBound2,
        onEditKeydown: this.handleEditKeydownBound,
        onMore: this.handleActionMenuToggle,
        ...(opts.withThreadAction ? { onViewThread: this.handleViewThreadBound } : {}),
      } as unknown as import("./render").CommentActions,
      actionMenu,
    } as unknown as {
      isEditing: boolean
      editingDraft: string
      replyTarget: Message | null
      actions: import("./render").CommentActions
      actionMenu?: unknown
      hideManagement?: boolean
      viewThreadLabel?: string
    })
  }

  /** Thread reader overlay: root + backend-ordered members from ThreadFeature. */
  private renderThreadReader(t: import("../i18n/messages").Messages) {
    const tf = this.threadFeature
    if (!tf) return ""
    const snap = tf.snapshot()
    const activePk = this.runtime?.identity.active?.publicKey ?? null
    // Same poll-voting in-flight context as the main feed
    const votingPollId = this.commentsFeature?.snapshot().votingPollId ?? null
    const rootMsg = tf.root
    const rootContent = rootMsg
      ? this.buildComment(toViewModel(rootMsg, activePk), t, { inThread: true, votingPollId })
      : html``
    const members = tf.members
    const membersContent = html`<div
      class="list"
      part="thread-members"
      role="feed"
      @poll-vote=${this.handlePollVoteBound}
    >
      ${repeat(
        members,
        (m: Message) => m.event_id,
        (m: Message) =>
          this.buildComment(toViewModel(m, activePk), t, { inThread: true, votingPollId }),
      )}
    </div>`
    return renderThreadDialog(
      t,
      {
        loading: snap.loading,
        error: snap.error,
        hasMembers: members.length > 0,
        hasNextPage: tf.hasNextPage,
        total: snap.pagination?.total ?? null,
      },
      rootContent,
      membersContent,
      // The single shared composer is reparented into this slot while the
      // Thread is open (see placeComposer).
      html``,
      this.handleThreadClose,
      this.handleThreadRetry,
      this.handleThreadLoadMore,
      this.handleThreadDialogKeyDown,
    )
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
        <div class="header" part="header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;position:relative">
          <span>${t.comments} · ${meta?.total ?? ordered.length}</span>
          <div style="display:flex;align-items:center;gap:8px;position:relative">
            <span style="font-size:12px;color:${runtime.realtime.connected ? "#16a34a" : "#94a3b8"};display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${runtime.realtime.connected ? "#16a34a" : "#94a3b8"};display:inline-block"></span>${runtime.realtime.connected ? t.live : t.offline}</span>
            ${renderIdentityCapsule(profile, t, this.identityPopoverOpen, this.handleIdentityCapsuleClick)}
            ${this.identityPopoverOpen ? renderIdentityPopover(identities, activePk, t, this.handleSwitchIdentityBound, this.handleIdentityCreate, this.handleIdentityImport, this.handleIdentityManage, this.handleIdentityPopoverClose, profile, this.handleProfileOpen) : ""}
          </div>
        </div>
        <!-- Legacy hidden removed for bundle; tests updated to new UI -->
        ${
          this.identityDialog
            ? renderIdentityDialog(
                this.identityDialog.type === "create"
                  ? "Create identity"
                  : this.identityDialog.type === "import"
                    ? "Import identity"
                    : this.identityDialog.type === "backup"
                      ? "Backup"
                      : this.identityDialog.type === "mnemonic"
                        ? "Mnemonic"
                        : "Manage identities",
                html`<div style="display:flex;flex-direction:column;gap:12px">
          ${
            this.identityDialog.type === "create"
              ? html`<button @click=${async () => {
                  await this.handleAddRandomIdentityBound()
                  this.handleIdentityDialogClose()
                }} style="background:#4f46e5;color:white;border:none;border-radius:8px;padding:10px;cursor:pointer">Create random identity</button>`
              : ""
          }
          ${
            this.identityDialog.type === "import"
              ? html`<div style="display:flex;flex-direction:column;gap:8px">
            <input placeholder="12 word mnemonic" aria-label="Mnemonic input" style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:13px" @change=${this.handleImportMnemonicBound} />
            <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:8px;cursor:pointer;text-align:center">Import backup JSON <input type="file" accept=".json" style="display:none" @change=${this.handleImportBackupBound} /></label>
            ${this.importError ? html`<div style="color:#ef4444;font-size:12px">${this.importError}</div>` : ""}
          </div>`
              : ""
          }
          ${this.identityDialog.type === "backup" && this.showBackup ? html`<div style="font-size:12px;font-family:monospace;background:#f1f5f9;padding:12px;border-radius:8px;word-break:break-all;max-height:200px;overflow:auto">${this.showBackup}</div><button @click=${this.handleCopyBackupBound} style="background:#4f46e5;color:white;border:none;border-radius:6px;padding:8px;cursor:pointer">Copy</button>` : ""}
          ${this.identityDialog.type === "mnemonic" && this.showMnemonic ? html`<div style="font-size:12px;font-family:monospace;background:#fef3c7;padding:12px;border-radius:8px;word-break:break-all">${this.showMnemonic}</div><button @click=${this.handleCopyMnemonicBound} style="background:#4f46e5;color:white;border:none;border-radius:6px;padding:8px;cursor:pointer">Copy</button><div style="font-size:11px;color:#94a3b8">Keep this secret. Copy on explicit gesture only.</div>` : ""}
          ${
            this.identityDialog.type === "manage"
              ? html`<div style="display:flex;flex-direction:column;gap:8px">
            ${repeat(
              identities,
              (id) => id.publicKey,
              (
                id,
              ) => html`<div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e2e8f0;border-radius:8px">
              <span style="font-size:11px;font-family:monospace">${id.publicKey.slice(0, 8)}</span>
              <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis">${id.publicKey.slice(0, 16)}…</span>
              <button data-public-key="${id.publicKey}" @click=${this.handleSwitchIdentityBound} style="font-size:11px;background:#4f46e5;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">Switch</button>
              <button data-public-key="${id.publicKey}" @click=${this.handleRemoveIdentityBound} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Remove</button>
              <button data-public-key="${id.publicKey}" @click=${(e: Event) => {
                const pk = (e.currentTarget as HTMLElement).dataset.publicKey
                if (pk) {
                  this.runtime?.identity
                    .exportIdentity(pk)
                    .then((j) => {
                      this.showBackup = j
                      this.identityDialog = { type: "backup" }
                    })
                    .catch(() => {})
                }
              }} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Backup</button>
              <button data-public-key="${id.publicKey}" @click=${(e: Event) => {
                const pk = (e.currentTarget as HTMLElement).dataset.publicKey
                if (pk) {
                  this.runtime?.identity
                    .exportMnemonic(pk)
                    .then((w) => {
                      this.showMnemonic = w
                      this.identityDialog = { type: "mnemonic" }
                    })
                    .catch(() => {})
                }
              }} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Mnemonic</button>
            </div>`,
            )}
            <div style="display:flex;gap:8px"><button @click=${this.handleAddRandomIdentityBound} style="flex:1;background:#4f46e5;color:white;border:none;border-radius:6px;padding:8px;cursor:pointer">Add random</button></div>
          </div>`
              : ""
          }
          <div style="display:flex;justify-content:flex-end"><button @click=${this.handleIdentityDialogClose} style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;cursor:pointer">Close</button></div>
        </div>`,
                t,
                this.handleIdentityDialogClose,
              )
            : ""
        }
        ${snap.loading ? html`<div class="empty">${t.loading}</div>` : ""}
        ${snap.error ? html`<div class="error" part="error" role="alert" aria-live="assertive">${snap.error}</div>` : ""}
        ${pending ? html`<div class="pending">${t.waitingSync}</div>` : ""}
        ${!snap.loading && ordered.length === 0 ? html`<div class="empty">${t.noComments}</div>` : ""}
        <div class="list" part="list" role="feed" @poll-vote=${this.handlePollVoteBound}>
          ${repeat(
            ordered,
            (c: Message) => c.event_id,
            (c: Message) =>
              this.buildComment(toViewModel(c, runtime.identity.active?.publicKey ?? null), t, {
                votingPollId: snap.votingPollId,
                withThreadAction: true,
              }),
          )}
        </div>
        ${renderPagination(snap.meta?.page ?? 1, meta?.total_pages ?? 1, t, this.handlePagePrevBound, this.handlePageNextBound)}
        ${
          this.deletingId
            ? renderDeleteDialog(
                t,
                this.handleCancelDeleteBound,
                this.handleConfirmDeleteBound,
                this.deletingId,
                this.handleDeleteDialogKeyDown,
              )
            : ""
        }
        ${this.threadOpenFor ? this.renderThreadReader(t) : ""}
        ${
          this.profileDialogOpen
            ? renderIdentityDialog(
                "Profile",
                html`<div style="display:flex;flex-direction:column;gap:16px">
                  <div style="display:flex;align-items:center;gap:12px">
                    ${
                      profile?.avatar_url
                        ? html`<img src="${profile.avatar_url}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0" />`
                        : html`<span style="width:48px;height:48px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:18px;color:#64748b">${(profile?.display_name?.[0] ?? "?").toUpperCase()}</span>`
                    }
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600">${profile?.display_name ?? "Anonymous"}</div>
                      <div style="font-size:11px;color:#64748b">Visible to others when you comment</div>
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px">
                    <label style="font-size:12px;font-weight:600">Display name</label>
                    <input aria-label="Profile display name" placeholder="Anonymous" maxlength="50" .value=${this.profileDraftName} @input=${this.handleProfileDisplayNameInput} style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:14px" />
                    ${this.profileDisplayNameError ? html`<div style="font-size:12px;color:#ef4444" role="alert">${this.profileDisplayNameError}</div>` : ""}
                    <div style="font-size:11px;color:#64748b">This changes who you appear as. Saved locally and sent with your next comment.</div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px">
                    <label style="font-size:12px;font-weight:600">Avatar</label>
                    ${
                      profile?.avatar_url
                        ? html`<div style="display:flex;align-items:center;gap:8px"><img src="${profile.avatar_url}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover" /><button @click=${this.handleProfileAvatarRemove} style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px" ?disabled=${this.profileSaving}>Remove</button></div>`
                        : html`<span style="font-size:12px;color:#64748b">No avatar</span>`
                    }
                    <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;text-align:center;opacity:${this.profileSaving ? "0.5" : "1"}">Choose image<input type="file" accept="image/*" style="display:none" @change=${this.handleProfileAvatarSelect} ?disabled=${this.profileSaving} /></label>
                    ${this.profileAvatarError ? html`<div style="font-size:12px;color:#ef4444">${this.profileAvatarError}</div>` : ""}
                  </div>
                  <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button @click=${this.handleProfileClose} style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;cursor:pointer">Cancel</button>
                    <button @click=${this.handleProfileSave} ?disabled=${this.profileSaving} style="background:#4f46e5;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;opacity:${this.profileSaving ? "0.5" : "1"}">Save</button>
                  </div>
                </div>`,
                t,
                this.handleProfileClose,
                this.handleProfileDialogKeyDown,
              )
            : ""
        }
        <div class="main-composer" part="main-composer">
          <cumments-editor
            .lang=${this.lang}
            .profileName=${this.runtime?.profile.current?.display_name ?? ""}
            .profileAvatar=${this.runtime?.profile.current?.avatar_url ?? null}
            .onProfileClick=${this.handleProfileOpen}
            .onReplyDraftChange=${this.handleReplyDraftChange}
            .threadRootId=${runtime.thread.snapshot().rootId}
            .getMessage=${(id: string) => this.runtime?.comments.getMessage(id)}
            .uploadMedia=${this.handleEditorUploadMedia}
            .stickerPacks=${runtime.stickerPacks}
            .stickerLoading=${runtime.stickerLoading}
            @cumments:submit=${this.handleEditorSubmit}
          ></cumments-editor>
        </div>
        ${this.renderReactorPanel(t)}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-comments": CummentsComments
  }
}
