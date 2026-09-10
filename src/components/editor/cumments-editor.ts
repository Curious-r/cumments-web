import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../../api/contract/query"
import type { StickerPack } from "../../api/stickers"
import { resolveLocale } from "../../i18n/locale"
import { messages } from "../../i18n/messages"
import { formatMarkdownSelection, type MarkdownFormat } from "../../utils/markdown-formatting"
import { mimeToMediaKind } from "../../utils/media"
import { validatePoll } from "../../utils/poll"

interface EmojiData {
  emoji: string
  name: string
  category: string
  keywords: string[]
}

const EMOJI_DATA: EmojiData[] = [
  // Smileys
  { emoji: "😀", name: "grinning face", category: "Smileys", keywords: ["happy", "smile", "joy"] },
  { emoji: "😁", name: "beaming face", category: "Smileys", keywords: ["grin", "happy"] },
  { emoji: "😂", name: "tears of joy", category: "Smileys", keywords: ["laugh", "funny", "cry"] },
  { emoji: "🤣", name: "rolling on the floor", category: "Smileys", keywords: ["laugh", "rofl"] },
  { emoji: "😃", name: "smiling face", category: "Smileys", keywords: ["happy", "smile"] },
  { emoji: "😄", name: "smiling face with open mouth", category: "Smileys", keywords: ["happy"] },
  { emoji: "😅", name: "sweating smile", category: "Smileys", keywords: ["nervous", "relief"] },
  { emoji: "😆", name: "squinting smile", category: "Smileys", keywords: ["laugh", "satisfied"] },
  { emoji: "😉", name: "winking face", category: "Smileys", keywords: ["wink", "flirt"] },
  {
    emoji: "😊",
    name: "smiling with rosy cheeks",
    category: "Smileys",
    keywords: ["blush", "shy"],
  },
  { emoji: "😋", name: "savoring food", category: "Smileys", keywords: ["yummy", "tongue"] },
  { emoji: "😎", name: "sunglasses", category: "Smileys", keywords: ["cool", "awesome"] },
  { emoji: "😍", name: "heart eyes", category: "Smileys", keywords: ["love", "crush"] },
  { emoji: "😘", name: "kiss mark", category: "Smileys", keywords: ["kiss", "love"] },
  { emoji: "🥰", name: "smiling with hearts", category: "Smileys", keywords: ["love", "adore"] },
  { emoji: "😗", name: "kissing face", category: "Smileys", keywords: ["kiss"] },
  // People
  { emoji: "👍", name: "thumbs up", category: "People", keywords: ["like", "approve", "yes"] },
  {
    emoji: "👎",
    name: "thumbs down",
    category: "People",
    keywords: ["dislike", "disapprove", "no"],
  },
  { emoji: "👏", name: "clapping hands", category: "People", keywords: ["applause", "bravo"] },
  { emoji: "🙌", name: "raising hands", category: "People", keywords: ["hooray", "celebration"] },
  { emoji: "🤝", name: "handshake", category: "People", keywords: ["deal", "agreement"] },
  { emoji: "🙏", name: "folded hands", category: "People", keywords: ["please", "thank", "pray"] },
  { emoji: "💪", name: "flexed biceps", category: "People", keywords: ["strong", "muscle"] },
  { emoji: "🤞", name: "crossed fingers", category: "People", keywords: ["luck", "hope"] },
  // Animals
  { emoji: "🐶", name: "dog face", category: "Animals", keywords: ["pet", "puppy"] },
  { emoji: "🐱", name: "cat face", category: "Animals", keywords: ["pet", "kitty"] },
  { emoji: "🐭", name: "mouse face", category: "Animals", keywords: ["rodent"] },
  { emoji: "🐹", name: "hamster", category: "Animals", keywords: ["pet"] },
  { emoji: "🐰", name: "rabbit face", category: "Animals", keywords: ["bunny"] },
  { emoji: "🦊", name: "fox", category: "Animals", keywords: ["cunning"] },
  { emoji: "🐻", name: "bear", category: "Animals", keywords: ["wild"] },
  { emoji: "🐼", name: "panda", category: "Animals", keywords: ["bamboo"] },
  { emoji: "🐨", name: "koala", category: "Animals", keywords: ["australia"] },
  { emoji: "🐯", name: "tiger face", category: "Animals", keywords: ["wild", "cat"] },
  // Food
  { emoji: "🍎", name: "red apple", category: "Food", keywords: ["fruit", "healthy"] },
  { emoji: "🍐", name: "pear", category: "Food", keywords: ["fruit"] },
  { emoji: "🍊", name: "tangerine", category: "Food", keywords: ["orange", "fruit"] },
  { emoji: "🍋", name: "lemon", category: "Food", keywords: ["citrus", "sour"] },
  { emoji: "🍌", name: "banana", category: "Food", keywords: ["fruit", "potassium"] },
  { emoji: "🍉", name: "watermelon", category: "Food", keywords: ["fruit", "summer"] },
  { emoji: "🍇", name: "grapes", category: "Food", keywords: ["fruit", "wine"] },
  { emoji: "🍓", name: "strawberry", category: "Food", keywords: ["fruit", "berry"] },
  { emoji: "🍒", name: "cherries", category: "Food", keywords: ["fruit", "cherry"] },
  { emoji: "🍑", name: "peach", category: "Food", keywords: ["fruit"] },
  // Activities
  { emoji: "⚽", name: "soccer ball", category: "Activities", keywords: ["football", "sport"] },
  { emoji: "🏀", name: "basketball", category: "Activities", keywords: ["sport", "nba"] },
  { emoji: "🏈", name: "american football", category: "Activities", keywords: ["sport", "nfl"] },
  { emoji: "⚾", name: "baseball", category: "Activities", keywords: ["sport", "mlb"] },
  { emoji: "🎾", name: "tennis", category: "Activities", keywords: ["sport", "ball"] },
  { emoji: "🏐", name: "volleyball", category: "Activities", keywords: ["sport", "ball"] },
  { emoji: "🎮", name: "video game", category: "Activities", keywords: ["controller", "gaming"] },
  { emoji: "🎲", name: "game die", category: "Activities", keywords: ["dice", "board game"] },
  // Travel
  { emoji: "🚗", name: "automobile", category: "Travel", keywords: ["car", "drive"] },
  { emoji: "🚕", name: "taxi", category: "Travel", keywords: ["cab", "uber"] },
  { emoji: "🚌", name: "bus", category: "Travel", keywords: ["transit", "transport"] },
  { emoji: "🚎", name: "trolleybus", category: "Travel", keywords: ["transit"] },
  { emoji: "🏎️", name: "racing car", category: "Travel", keywords: ["fast", "speed"] },
  { emoji: "🚓", name: "police car", category: "Travel", keywords: ["cop", "law"] },
  { emoji: "🚑", name: "ambulance", category: "Travel", keywords: ["hospital", "emergency"] },
  { emoji: "🚒", name: "fire engine", category: "Travel", keywords: ["firefighter"] },
  { emoji: "✈️", name: "airplane", category: "Travel", keywords: ["flight", "fly"] },
  { emoji: "🚀", name: "rocket", category: "Travel", keywords: ["space", "launch"] },
  // Objects
  { emoji: "💡", name: "light bulb", category: "Objects", keywords: ["idea", "bright"] },
  { emoji: "📱", name: "mobile phone", category: "Objects", keywords: ["phone", "cell"] },
  { emoji: "💻", name: "laptop", category: "Objects", keywords: ["computer", "work"] },
  { emoji: "⌨️", name: "keyboard", category: "Objects", keywords: ["type", "computer"] },
  { emoji: "🖥️", name: "desktop computer", category: "Objects", keywords: ["monitor", "work"] },
  { emoji: "📷", name: "camera", category: "Objects", keywords: ["photo", "picture"] },
  { emoji: "🔋", name: "battery", category: "Objects", keywords: ["power", "charge"] },
  { emoji: "🔑", name: "key", category: "Objects", keywords: ["lock", "password"] },
  { emoji: "📚", name: "books", category: "Objects", keywords: ["read", "study"] },
  { emoji: "✏️", name: "pencil", category: "Objects", keywords: ["write", "edit"] },
  // Symbols
  { emoji: "❤️", name: "red heart", category: "Symbols", keywords: ["love", "heart"] },
  { emoji: "🧡", name: "orange heart", category: "Symbols", keywords: ["love"] },
  { emoji: "💛", name: "yellow heart", category: "Symbols", keywords: ["love", "friendship"] },
  { emoji: "💚", name: "green heart", category: "Symbols", keywords: ["love", "nature"] },
  { emoji: "💙", name: "blue heart", category: "Symbols", keywords: ["love", "trust"] },
  { emoji: "💜", name: "purple heart", category: "Symbols", keywords: ["love", "luxury"] },
  { emoji: "🖤", name: "black heart", category: "Symbols", keywords: ["love", "dark"] },
  { emoji: "🤍", name: "white heart", category: "Symbols", keywords: ["love", "pure"] },
  { emoji: "💯", name: "hundred points", category: "Symbols", keywords: ["perfect", "score"] },
  { emoji: "✅", name: "check mark", category: "Symbols", keywords: ["done", "complete", "yes"] },
  // Flags
  { emoji: "🏁", name: "chequered flag", category: "Flags", keywords: ["finish", "race"] },
  { emoji: "🚩", name: "triangular flag", category: "Flags", keywords: ["warning"] },
  { emoji: "🎌", name: "crossed flags", category: "Flags", keywords: ["celebration", "japan"] },
  { emoji: "🏴", name: "black flag", category: "Flags", keywords: ["pirate"] },
  { emoji: "🏳️", name: "white flag", category: "Flags", keywords: ["surrender", "peace"] },
]

const EMOJI_CATEGORIES = [...new Set(EMOJI_DATA.map((e) => e.category))]

export type PollDraft = {
  question: string
  options: string[]
  maxSelections?: number
}

export interface CummentsSubmitDetail {
  content: string
  displayName: string
  media?: { url: string; kind: string } | null
  geoUri?: string | null
  poll?: { question: string; options: string[]; maxSelections?: number } | null
}

/**
 * <cumments-editor>
 * Light DOM editor inside parent ShadowRoot. Owns draft, replyToId,
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
  @property() profileName = ""
  @property() profileAvatar: string | null = null
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
  @property({ attribute: false }) onProfileClick?: () => void
  /**
   * Reply-draft lifecycle notification (set/cancel/clear-after-submit). The
   * runtime syncs the canonical ComposerContext reply target from it; relation
   * fields are NOT carried on the submit detail.
   */
  @property({ attribute: false }) onReplyDraftChange?: (replyToId: string | null) => void
  /**
   * Active Thread scope for the composer (bound from ThreadFeature lifecycle).
   * null = main composer; non-null = composer participates in that Thread.
   */
  @property({ attribute: false }) threadRootId: string | null = null
  @state() private draft = ""
  @state() private replyToId: string | null = null
  @state() private showStickers = false
  @state() private pendingSticker: { url: string; kind: string; shortcode: string } | null = null
  @state() private pendingMedia: {
    url: string | null
    kind: string
    mimetype: string | null
    filename: string | null
    state: "uploading" | "ready" | "failed"
  } | null = null
  @state() private dragOver = false
  private uploadGeneration = 0
  @state() private showEmoji = false
  @state() private emojiSearch = ""
  @state() private emojiCategory = "all"
  @state() private emojiActiveIndex = 0
  private recentEmojis: string[] = []
  @state() private showMore = false
  @state() private locationSharing = false
  @state() private locationError: string | null = null
  @state() private pendingLocation: string | null = null
  @state() private focused = false
  @state() private pollDraft: PollDraft | null = null
  @state() private showLinkInput = false
  private savedSelection: { start: number; end: number } | null = null
  @state() private pollErrors: {
    question?: string
    options: (string | null)[]
    general?: string
  } | null = null

  // For testing / parent imperative access
  get currentDraft(): string {
    return this.draft
  }
  get currentReplyToId(): string | null {
    return this.replyToId
  }
  get currentPollDraft(): PollDraft | null {
    return this.pollDraft ? { ...this.pollDraft, options: [...this.pollDraft.options] } : null
  }

  setReplyToId(id: string | null) {
    this.setReplyDraft(id)
  }

  /** Single mutation point for the reply draft: notifies the composer context. */
  private setReplyDraft(id: string | null) {
    this.replyToId = id
    this.onReplyDraftChange?.(id)
    this.requestUpdate()
  }

  private boundWindowClick: ((e: MouseEvent) => void) | null = null

  private addWindowListeners(): void {
    if (this.boundWindowClick) return
    this.boundWindowClick = (e: MouseEvent) => {
      if (!this.showStickers && !this.showEmoji && !this.showMore) return
      const path = e.composedPath() as EventTarget[]
      let inside = false
      for (const t of path) {
        if (!(t instanceof HTMLElement)) continue
        if (
          t.closest('[role="dialog"][aria-label="Stickers"]') ||
          t.closest('button[aria-label="Stickers"]') ||
          t.closest('[role="dialog"][aria-label="Emoji picker"]') ||
          t.closest('button[aria-label="Emoji"]') ||
          t.closest(".more-menu") ||
          t.closest('button[aria-label="More composer actions"]')
        )
          inside = true
      }
      if (inside) return
      if (this.showStickers) this.showStickers = false
      if (this.showEmoji) this.handleEmojiClose()
      if (this.showMore) this.handleMoreClose()
    }
    window.addEventListener("click", this.boundWindowClick, true)
    window.addEventListener("resize", this.handleResize)
  }

  private removeWindowListeners(): void {
    if (this.boundWindowClick) {
      window.removeEventListener("click", this.boundWindowClick, true)
      this.boundWindowClick = null
    }
    window.removeEventListener("resize", this.handleResize)
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("showStickers") || changed.has("showEmoji") || changed.has("showMore")) {
      if (this.showStickers || this.showEmoji || this.showMore) this.addWindowListeners()
      else this.removeWindowListeners()
    }
    this.autoGrow()
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.recentEmojis = this.getRecentEmojis()
  }

  private autoGrow(): void {
    const textarea = this.querySelector(
      'textarea[aria-label="Comment"]',
    ) as HTMLTextAreaElement | null
    if (!textarea) return
    const maxHeight = window.innerWidth < 480 ? 120 : 200
    textarea.style.height = "auto"
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }

  disconnectedCallback(): void {
    this.removeWindowListeners()
    super.disconnectedCallback()
  }

  private handleResize = () => {
    if (this.showEmoji) this.positionEmojiPicker()
    if (this.showStickers) this.positionStickerPicker()
    if (this.showMore) this.positionMoreMenu()
  }

  /**
   * Calculates viewport-aware position for a popup relative to its trigger.
   * Prefers above the trigger; flips below only if insufficient space above.
   * Clamps horizontally to stay within viewport bounds.
   * If neither side fits, clamps to viewport margin and reduces max-height.
   * Returns clear=true when the popup is in its normal (unconstrained) state
   * so callers can clear any previously set inline max-height/overflow.
   */
  private positionPopup(
    trigger: HTMLElement,
    popup: { w: number; h: number },
  ): { top: number; left: number; maxHeight?: number; clear: boolean } {
    const triggerRect = trigger.getBoundingClientRect()
    const margin = 8
    const gap = 4
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    const spaceAbove = triggerRect.top
    const spaceBelow = viewportH - triggerRect.bottom

    // Preferred: above; flip below only if insufficient above AND enough below
    let placeBelow = false
    if (spaceAbove < popup.h) {
      placeBelow = spaceBelow >= popup.h
    }

    let top = placeBelow ? triggerRect.bottom + gap : triggerRect.top - popup.h - gap
    let maxHeight: number | undefined
    let clear = false

    // If neither side fits, clamp to viewport margin
    if (spaceAbove < popup.h && spaceBelow < popup.h) {
      top = margin
      maxHeight = viewportH - margin * 2
    } else {
      // Clamp top to viewport margin
      if (top < margin) top = margin
      // Clamp bottom to viewport margin
      const bottom = top + popup.h
      if (bottom > viewportH - margin) {
        top = viewportH - popup.h - margin
        if (top < margin) {
          top = margin
          maxHeight = viewportH - margin * 2
        }
      }
      // Normal placement - clear any stale constraints
      if (maxHeight === undefined) clear = true
    }

    // Clamp horizontally
    let left = triggerRect.left
    const maxLeft = viewportW - popup.w - margin
    if (left > maxLeft) left = maxLeft
    if (left < margin) left = margin

    return { top, left, maxHeight, clear }
  }

  private positionEmojiPicker() {
    const trigger = this.querySelector('button[aria-label="Emoji"]') as HTMLElement | null
    const picker = this.querySelector(".emoji-picker") as HTMLElement | null
    if (!trigger || !picker) return
    const rect = picker.getBoundingClientRect()
    const pos = this.positionPopup(trigger, { w: rect.width || 280, h: rect.height || 280 })
    picker.style.top = `${pos.top}px`
    picker.style.left = `${pos.left}px`
    picker.style.position = "fixed"
    if (pos.maxHeight) {
      picker.style.maxHeight = `${pos.maxHeight}px`
      picker.style.overflowY = "auto"
    } else if (pos.clear) {
      picker.style.maxHeight = ""
      picker.style.overflowY = ""
    }
  }

  private positionStickerPicker() {
    const trigger = this.querySelector('button[aria-label="Stickers"]') as HTMLElement | null
    const picker = this.querySelector(
      '[role="dialog"][aria-label="Stickers"]',
    ) as HTMLElement | null
    if (!trigger || !picker) return
    const rect = picker.getBoundingClientRect()
    const pos = this.positionPopup(trigger, { w: rect.width || 320, h: rect.height || 200 })
    picker.style.top = `${pos.top}px`
    picker.style.left = `${pos.left}px`
    picker.style.position = "fixed"
    if (pos.maxHeight) {
      picker.style.maxHeight = `${pos.maxHeight}px`
      picker.style.overflowY = "auto"
    } else if (pos.clear) {
      picker.style.maxHeight = ""
      picker.style.overflowY = ""
    }
  }

  private positionMoreMenu() {
    const trigger = this.querySelector(
      'button[aria-label="More composer actions"]',
    ) as HTMLElement | null
    const menu = this.querySelector(".more-menu") as HTMLElement | null
    if (!trigger || !menu) return
    const rect = menu.getBoundingClientRect()
    const pos = this.positionPopup(trigger, { w: rect.width || 140, h: rect.height || 120 })
    menu.style.top = `${pos.top}px`
    menu.style.left = `${pos.left}px`
    menu.style.position = "fixed"
    if (pos.maxHeight) {
      menu.style.maxHeight = `${pos.maxHeight}px`
      menu.style.overflowY = "auto"
    } else if (pos.clear) {
      menu.style.maxHeight = ""
      menu.style.overflowY = ""
    }
  }

  private handleDraftInput = (e: Event) => {
    this.draft = (e.target as HTMLTextAreaElement).value
    this.autoGrow()
  }

  private handleFocus = () => {
    this.focused = true
  }

  private handleBlur = (e: FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    // If focus is moving to another element inside this editor, keep it expanded
    if (relatedTarget && this.contains(relatedTarget)) {
      return
    }
    // Focus is leaving the editor entirely
    this.focused = false
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void this.handleSubmit()
    } else if (e.key === "Escape") {
      if (this.showEmoji) {
        e.preventDefault()
        e.stopPropagation()
        this.handleEmojiClose()
        return
      }
      if (this.pollDraft) {
        e.preventDefault()
        e.stopPropagation()
        this.handleCancelPoll()
        return
      }
      // Escape does not implicitly clear Thread/reply context
    }
    // bare Enter inserts newline (default textarea behavior)
  }

  private handlePollQuestionInput = (e: Event) => {
    if (!this.pollDraft) return
    const val = (e.target as HTMLInputElement).value
    this.pollDraft = { ...this.pollDraft, question: val }
    this.pollErrors = null
  }

  private handlePollOptionInput = (idx: number, e: Event) => {
    if (!this.pollDraft) return
    const val = (e.target as HTMLInputElement).value
    const next = [...this.pollDraft.options]
    next[idx] = val
    this.pollDraft = { ...this.pollDraft, options: next }
    this.pollErrors = null
  }

  private handleAddOption = () => {
    if (!this.pollDraft) return
    if (this.pollDraft.options.length >= 20) return
    this.pollDraft = {
      ...this.pollDraft,
      options: [...this.pollDraft.options, ""],
    }
    this.pollErrors = null
    this.updateComplete.then(() => {
      const inputs = this.querySelectorAll('input[aria-label^="Option"]')
      const last = inputs[inputs.length - 1] as HTMLElement | null
      last?.focus()
    })
  }

  private handleRemoveOption = (idx: number) => {
    if (!this.pollDraft) return
    if (this.pollDraft.options.length <= 2) return
    const next = this.pollDraft.options.filter((_, i) => i !== idx)
    this.pollDraft = { ...this.pollDraft, options: next }
    this.pollErrors = null
  }

  private handlePollKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleCancelPoll()
    }
  }

  private handlePollToggle = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    if (this.pollDraft) {
      this.handleCancelPoll()
      return
    }
    // Enter Poll mode without clearing pending content, text draft, or context
    this.pollDraft = { question: "", options: ["", ""] }
    this.pollErrors = null
    this.focused = true
    this.updateComplete.then(() => {
      const q = this.querySelector('input[aria-label="Poll question"]') as HTMLElement | null
      q?.focus()
    })
  }

  private handleCancelPoll = () => {
    const btn = this.querySelector(
      'button[aria-label="Create poll"], button[aria-label="Poll"]',
    ) as HTMLElement | null
    this.pollDraft = null
    this.pollErrors = null
    this.requestUpdate()
    this.updateComplete.then(() => btn?.focus())
  }

  private validatePoll(): boolean {
    if (!this.pollDraft) return true
    const { questionError, optionErrors, generalError } = validatePoll(
      this.pollDraft.question,
      this.pollDraft.options,
    )
    const hasOptionError = optionErrors.some((e) => e !== null)
    if (questionError || generalError || hasOptionError) {
      this.pollErrors = {
        question: questionError ?? undefined,
        options: optionErrors,
        general: generalError ?? undefined,
      }
      // Map backend messages to i18n keys where appropriate
      if (this.pollErrors.question === "Question is required")
        this.pollErrors.question = "Question is required"
      if (this.pollErrors.question === "Question is too long")
        this.pollErrors.question = "Question is too long"
      return false
    }
    this.pollErrors = null
    return true
  }

  private isPollDraftValid(): boolean {
    if (!this.pollDraft) return false
    const { questionError, optionErrors, generalError } = validatePoll(
      this.pollDraft.question,
      this.pollDraft.options,
    )
    return !questionError && !generalError && !optionErrors.some((e) => e !== null)
  }

  private async handleSubmit(): Promise<void> {
    if (this.pollDraft) {
      const isValid = this.validatePoll()
      if (!isValid) return
      // Defensive guard: reject unsupported poll + pending content combination
      if (this.pendingMedia || this.pendingSticker || this.pendingLocation) return
      const displayName = this.profileName
      const question = this.pollDraft.question.trim()
      const options = this.pollDraft.options.map((o) => o.trim()).filter((o) => o.length > 0)
      const detail: CummentsSubmitDetail = {
        content: question,
        displayName,
        poll: { question, options, maxSelections: 1 },
      }
      this.dispatchEvent(
        new CustomEvent("cumments:submit", {
          detail,
          bubbles: true,
          composed: true,
        }),
      )
      this.pollDraft = null
      this.pollErrors = null
      this.setReplyDraft(null)
      this.requestUpdate()
      return
    }
    const content = this.draft.trim()
    const hasSticker = !!this.pendingSticker
    const hasMedia = this.pendingMedia?.state === "ready"
    const hasLocation = !!this.pendingLocation
    if (!content && !hasSticker && !hasMedia && !hasLocation) return
    const displayName = this.profileName
    const pendingAttachment =
      this.pendingMedia?.state === "ready" ? this.pendingMedia : this.pendingSticker
    const media = pendingAttachment
      ? { url: pendingAttachment.url ?? "", kind: pendingAttachment.kind }
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
    this.setReplyDraft(null)
  }

  private handleCancelReply = () => {
    this.setReplyDraft(null)
  }

  private handleMediaSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      input.value = ""
      return
    }
    input.value = ""
    await this.handleFileAccepted(file)
  }

  /**
   * Core attachment lifecycle used by file picker, paste, and drag-drop.
   * Shows pending state immediately, uploads via injected capability,
   * and transitions to ready/failed. Stale-upload guard prevents removed
   * attachments from reappearing.
   */
  private async handleFileAccepted(file: File) {
    if (this.pollDraft) {
      this.pollDraft = null
      this.pollErrors = null
    }
    const mime = file.type || "application/octet-stream"
    const kind = mimeToMediaKind(mime)
    if (!this.uploadMedia) {
      this.uploadGeneration++
      this.pendingMedia = {
        url: null,
        kind,
        mimetype: mime,
        filename: file.name,
        state: "failed",
      }
      return
    }
    const generation = ++this.uploadGeneration
    this.pendingMedia = {
      url: null,
      kind,
      mimetype: mime,
      filename: file.name,
      state: "uploading",
    }
    try {
      const result = await this.uploadMedia(file)
      if (generation !== this.uploadGeneration) return
      const resultMime = result.mimetype ?? mime
      this.pendingMedia = {
        url: result.url,
        kind: mimeToMediaKind(resultMime),
        mimetype: resultMime,
        filename: result.filename ?? file.name,
        state: "ready",
      }
      this.pendingSticker = null
      this.focused = true
    } catch (_err) {
      if (generation !== this.uploadGeneration) return
      this.pendingMedia = {
        url: null,
        kind,
        mimetype: mime,
        filename: file.name,
        state: "failed",
      }
    }
  }

  /**
   * Shared file acceptance rule used by file picker, paste, and drag-drop.
   * Mirrors the accept attribute on the file input:
   * image/*, video/*, audio/*, .pdf, .txt, .zip
   */
  private isFileSupported(file: File): boolean {
    const type = file.type
    if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) {
      return true
    }
    const name = file.name.toLowerCase()
    return name.endsWith(".pdf") || name.endsWith(".txt") || name.endsWith(".zip")
  }

  private handlePaste = (e: ClipboardEvent) => {
    const file = e.clipboardData?.files?.[0]
    if (!file || !this.isFileSupported(file)) return
    e.preventDefault()
    void this.handleFileAccepted(file)
  }

  private handleDragOver = (e: DragEvent) => {
    const dt = e.dataTransfer
    if (!dt) return
    // Only activate drop target if drag contains file data
    const hasFileData = dt.types?.includes("Files") || dt.files?.length
    if (!hasFileData) return
    e.preventDefault()
    this.dragOver = true
  }

  private handleDragLeave = () => {
    this.dragOver = false
  }

  private handleDrop = (e: DragEvent) => {
    this.dragOver = false
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    // Prevent browser default (opening file) for ANY file drop
    e.preventDefault()
    // Only process supported files as attachments
    if (!this.isFileSupported(file)) return
    void this.handleFileAccepted(file)
  }

  // --- Emoji picker ---

  private getRecentEmojis(): string[] {
    try {
      return JSON.parse(localStorage.getItem("cumments-recent-emoji") || "[]")
    } catch {
      return []
    }
  }

  private addRecentEmoji(emoji: string) {
    try {
      const recent = [emoji, ...this.getRecentEmojis().filter((e) => e !== emoji)].slice(0, 12)
      localStorage.setItem("cumments-recent-emoji", JSON.stringify(recent))
    } catch {
      // Storage unavailable - silently ignore
    }
  }

  private handleEmojiToggle = () => {
    this.showEmoji = !this.showEmoji
    if (this.showEmoji) {
      this.emojiCategory = "all"
      this.emojiSearch = ""
      this.emojiActiveIndex = 0
      this.updateComplete.then(() => {
        this.positionEmojiPicker()
        const searchInput = this.querySelector(
          '.emoji-picker input[type="search"]',
        ) as HTMLInputElement | null
        searchInput?.focus()
      })
    }
  }

  private handleEmojiClose = () => {
    this.showEmoji = false
    this.emojiSearch = ""
    this.emojiCategory = "all"
    this.emojiActiveIndex = 0
    this.updateComplete.then(() => {
      const btn = this.querySelector('button[aria-label="Emoji"]') as HTMLElement | null
      btn?.focus()
    })
  }

  private handleEmojiSearch = (e: Event) => {
    this.emojiSearch = (e.target as HTMLInputElement).value
    this.emojiActiveIndex = 0
  }

  private handleEmojiCategoryChange = (category: string) => {
    this.emojiCategory = category
    this.emojiActiveIndex = 0
    this.requestUpdate()
    this.updateComplete.then(() => {
      const firstEmoji = this.querySelector(".emoji-picker-grid button") as HTMLButtonElement | null
      firstEmoji?.focus()
    })
  }

  private handleEmojiKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isSearchInput = target.tagName === "INPUT"
    const isCategoryButton = target.closest(".emoji-picker-category-controls") !== null

    // Escape works from anywhere in the picker
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleEmojiClose()
      return
    }

    // Search input: only handle Escape (above), let everything else pass through
    if (isSearchInput) return

    // Category buttons: let native keyboard behavior work (Enter/Space/Tab/Arrows)
    if (isCategoryButton) return

    // Emoji grid navigation - only when focus is in the grid
    if (target.closest(".emoji-picker-grid")) {
      const items = this.displayedEmojis
      if (items.length === 0) return
      const cols = 8
      let idx = this.emojiActiveIndex
      if (e.key === "ArrowRight") {
        e.preventDefault()
        idx = Math.min(idx + 1, items.length - 1)
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        idx = Math.max(idx - 1, 0)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        idx = Math.min(idx + cols, items.length - 1)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        idx = Math.max(idx - cols, 0)
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        this.handleEmojiPick(items[idx].emoji)
        return
      } else {
        return
      }
      this.emojiActiveIndex = idx
      this.requestUpdate()
      this.updateComplete.then(() => {
        const buttons = this.querySelectorAll(".emoji-picker-grid button")
        ;(buttons[idx] as HTMLButtonElement | null)?.focus()
      })
    }
  }

  private handleEmojiPick = (emoji: string) => {
    this.insertEmojiAtCaret(emoji)
    this.addRecentEmoji(emoji)
    this.showEmoji = false
    this.emojiSearch = ""
    this.emojiCategory = "all"
    this.emojiActiveIndex = 0
  }

  /**
   * Insert emoji at the current cursor position in the textarea.
   * Replaces any existing selection. Restores focus and caret after insert.
   */
  private insertEmojiAtCaret(emoji: string) {
    const textarea = this.querySelector(
      'textarea[aria-label="Comment"]',
    ) as HTMLTextAreaElement | null
    if (!textarea) return
    const start = textarea.selectionStart ?? this.draft.length
    const end = textarea.selectionEnd ?? this.draft.length
    const before = this.draft.slice(0, start)
    const after = this.draft.slice(end)
    this.draft = before + emoji + after
    this.requestUpdate()
    this.updateComplete.then(() => {
      const newPos = start + emoji.length
      textarea.selectionStart = newPos
      textarea.selectionEnd = newPos
      textarea.focus()
    })
  }

  /**
   * Apply inline Markdown formatting to the current textarea selection.
   * Follows the same pattern as insertEmojiAtCaret for selection restoration.
   */
  applyMarkdownFormat(format: MarkdownFormat, linkUrl?: string): void {
    const textarea = this.querySelector(
      'textarea[aria-label="Comment"]',
    ) as HTMLTextAreaElement | null
    if (!textarea) return

    // Use saved selection if available (from mousedown handler), otherwise use current
    const start = this.savedSelection?.start ?? textarea.selectionStart ?? this.draft.length
    const end = this.savedSelection?.end ?? textarea.selectionEnd ?? this.draft.length
    this.savedSelection = null

    const result = formatMarkdownSelection(textarea.value, start, end, format, linkUrl)

    this.draft = result.text
    this.requestUpdate()
    this.updateComplete.then(() => {
      textarea.selectionStart = result.selectionStart
      textarea.selectionEnd = result.selectionEnd
      textarea.focus()
    })
  }

  /**
   * Handle textarea focusout - saves selection if focus is moving to a formatting button.
   * This supports keyboard activation where user tabs to button before pressing Enter/Space.
   */
  private handleTextareaFocusout(e: FocusEvent): void {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    // Only save selection if focus is moving to a formatting button
    if (relatedTarget?.closest(".formatting-toolbar")) {
      this.savedSelection = {
        start: (e.target as HTMLTextAreaElement).selectionStart ?? this.draft.length,
        end: (e.target as HTMLTextAreaElement).selectionEnd ?? this.draft.length,
      }
    }
  }

  /**
   * Handle formatting button mousedown - saves selection and prevents focus loss.
   * This supports mouse activation.
   */
  private handleFormatMouseDown(e: Event): void {
    e.preventDefault() // Prevent button from stealing focus
    const textarea = this.querySelector(
      'textarea[aria-label="Comment"]',
    ) as HTMLTextAreaElement | null
    if (textarea) {
      this.savedSelection = {
        start: textarea.selectionStart ?? this.draft.length,
        end: textarea.selectionEnd ?? this.draft.length,
      }
    }
  }

  /**
   * Handle formatting button click - triggers formatting.
   * Works for both mouse click and keyboard Enter/Space activation.
   */
  private handleFormatClick(format: MarkdownFormat): void {
    if (format === "link") {
      this.showLinkInput = true
    } else {
      this.applyMarkdownFormat(format)
    }
  }

  /**
   * Handle link form submission.
   */
  private handleLinkSubmit(url: string): void {
    this.showLinkInput = false
    if (url.trim()) {
      this.applyMarkdownFormat("link", url)
    }
  }

  /**
   * Handle link form close/cancel.
   */
  private handleLinkClose(): void {
    this.showLinkInput = false
  }

  /**
   * Check if a format is currently active for the selection.
   */
  private isFormatActive(format: MarkdownFormat): boolean {
    const textarea = this.querySelector(
      'textarea[aria-label="Comment"]',
    ) as HTMLTextAreaElement | null
    if (!textarea) return false
    const start = textarea.selectionStart ?? this.draft.length
    const end = textarea.selectionEnd ?? this.draft.length
    if (start === end) return false

    const before = this.draft.slice(0, start)
    const after = this.draft.slice(end)

    switch (format) {
      case "bold":
        return before.endsWith("**") && after.startsWith("**")
      case "italic":
        return before.endsWith("*") && after.startsWith("*")
      case "strikethrough":
        return before.endsWith("~~") && after.startsWith("~~")
      case "code":
        return before.endsWith("`") && after.startsWith("`")
      default:
        return false
    }
  }

  private get filteredEmojis(): EmojiData[] {
    const query = this.emojiSearch.toLowerCase().trim()
    let items = EMOJI_DATA
    if (this.emojiCategory !== "all") {
      items = items.filter((e) => e.category === this.emojiCategory)
    }
    if (!query) return items
    return items.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.keywords.some((k) => k.toLowerCase().includes(query)),
    )
  }

  private get displayedEmojis(): EmojiData[] {
    return this.filteredEmojis
  }

  private getEmojiName(emoji: string): string {
    return EMOJI_DATA.find((e) => e.emoji === emoji)?.name ?? emoji
  }

  // --- More menu ---

  private handleMoreToggle = () => {
    this.showMore = !this.showMore
    if (this.showMore) {
      this.updateComplete.then(() => {
        this.positionMoreMenu()
        const first = this.querySelector(".more-menu button") as HTMLElement | null
        first?.focus()
      })
    }
  }

  private handleMoreClose = () => {
    this.showMore = false
    this.updateComplete.then(() => {
      const btn = this.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLElement | null
      btn?.focus()
    })
  }

  private handleMoreKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      this.handleMoreClose()
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      this.focusMoreItem(1)
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      this.focusMoreItem(-1)
    }
  }

  private focusMoreItem(delta: number) {
    const buttons = Array.from(this.querySelectorAll(".more-menu button")) as HTMLElement[]
    if (buttons.length === 0) return
    const current = buttons.indexOf(document.activeElement as HTMLElement)
    const next = current + delta
    if (next >= 0 && next < buttons.length) {
      buttons[next].focus()
    }
  }

  private handleLocationFromMore = () => {
    this.showMore = false
    this.updateComplete.then(() => {
      const moreBtn = this.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLElement | null
      moreBtn?.focus()
    })
    void this.handleLocationShare()
  }

  private handlePollFromMore = () => {
    this.showMore = false
    this.updateComplete.then(() => {
      const moreBtn = this.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLElement | null
      moreBtn?.focus()
    })
    this.handlePollToggle(new Event("click"))
  }

  private handleStickerFromMore = () => {
    this.showMore = false
    this.updateComplete.then(() => {
      const moreBtn = this.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLElement | null
      moreBtn?.focus()
    })
    this.handleStickerToggle(new Event("click"))
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
        this.positionStickerPicker()
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
    if (this.pollDraft) {
      this.pollDraft = null
      this.pollErrors = null
    }
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
      if (this.pollDraft) {
        this.pollDraft = null
        this.pollErrors = null
      }
      this.pendingLocation = geoUri
      this.focused = true
    } catch (err) {
      this.locationError = this.getLocationErrorMessage(err)
      this.pendingLocation = null
    } finally {
      this.locationSharing = false
    }
  }

  private formatLocation(geoUri: string): string {
    // Parse "geo:lat,lng" format
    const match = geoUri.match(/geo:([-\d.]+),([-\d.]+)/)
    if (match) {
      const lat = parseFloat(match[1])
      const lng = parseFloat(match[2])
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }
    }
    return geoUri
  }

  private getLocationErrorMessage(err: unknown): string {
    const error = err as { code?: number; message?: string }
    switch (error.code) {
      case 1: // PERMISSION_DENIED
        return "Location access denied. Enable in browser settings."
      case 2: // POSITION_UNAVAILABLE
        return "Location unavailable. Try again."
      case 3: // TIMEOUT
        return "Location request timed out. Try again."
      default:
        return error.message || "Failed to get location"
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
    const hasThreadContext = this.threadRootId != null && this.replyToId == null

    const hasPoll = !!this.pollDraft
    const isCollapsed =
      !this.focused &&
      !this.draft &&
      !hasReply &&
      !hasThreadContext &&
      !this.locationSharing &&
      !this.showStickers &&
      !this.pendingSticker &&
      !this.pendingMedia &&
      !this.pendingLocation &&
      !hasPoll
    const pollValid = hasPoll && this.isPollDraftValid()
    const hasPollConflict =
      hasPoll && (this.pendingMedia || this.pendingSticker || this.pendingLocation)
    const submitDisabled =
      this.locationSharing ||
      this.pendingMedia?.state === "uploading" ||
      this.pendingMedia?.state === "failed" ||
      (hasPoll
        ? !pollValid || hasPollConflict
        : !this.draft.trim() && !this.pendingSticker && !this.pendingMedia && !this.pendingLocation)
    return html`<style>
@media (max-width: 479px) {
  .editor-input-row {
    flex-wrap: wrap;
  }

  textarea[aria-label="Comment"] {
    flex: 1 1 120px;
    min-width: 0;
  }

  .editor-toolbar {
    flex-wrap: wrap;
  }

  .toolbar-action {
    display: none;
  }

  .more-button {
    display: inline-flex;
  }
}
@media (min-width: 480px) {
  .more-button {
    display: none;
  }
}
/* Focus-visible styles for accessibility (WCAG 2.4.7) */
.editor button:focus-visible,
.editor input:focus-visible,
.editor [tabindex]:focus-visible,
.editor label[for]:focus-visible {
  outline: 2px solid var(--cumments-primary, #4f46e5);
  outline-offset: 2px;
}
.editor button:focus:not(:focus-visible) {
  outline: none;
}
/* Hover states for interactive controls */
.editor-toolbar button:hover,
.editor-toolbar .toolbar-control:hover {
  background: #e2e8f0;
}
.editor-input-row button[part="button"]:hover:not(:disabled) {
  filter: brightness(1.1);
}
.more-menu button:hover,
.emoji-picker button:hover,
[role="dialog"][aria-label="Stickers"] button:hover,
.poll-editor button:hover {
  background: #f1f5f9;
}
.remove-control:hover {
  background: #f1f5f9;
  border-radius: 4px;
}
.editor-display-name button:hover {
  background: #e2e8f0;
}
/* Post button - stronger visual weight */
.editor-input-row button[part="button"] {
  font-weight: 600;
  letter-spacing: 0.01em;
}
/* Formatting toolbar */
.formatting-toolbar button {
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
.formatting-toolbar button:hover {
  background: #e2e8f0;
}
.formatting-toolbar button[aria-pressed="true"] {
  background: #e2e8f0;
  border-color: var(--cumments-primary, #4f46e5);
}
/* Subtle transitions for state changes */
.editor-toolbar button,
.editor-toolbar .toolbar-control,
.editor-input-row button[part="button"],
.more-menu button,
.remove-control,
.editor-display-name button {
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
/* Shared primary toolbar-control sizing/alignment (44px touch target, WCAG 2.5.5) */
.editor-toolbar button,
.editor-toolbar .toolbar-control {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Remove controls keep compact but remain keyboard accessible */
.remove-control {
  min-width: 32px;
  min-height: 32px;
}
/* Touch-target sizing for narrow layouts (WCAG 2.5.5) */
@media (max-width: 479px) {
  /* Emoji picker: category buttons, grid entries, recent entries */
  .emoji-picker button {
    min-width: 44px;
    min-height: 44px;
  }
  /* Sticker picker: close button, entries */
  [role="dialog"][aria-label="Stickers"] button {
    min-width: 44px;
    min-height: 44px;
  }
  /* More menu items */
  .more-menu button {
    min-width: 44px;
    min-height: 44px;
  }
  /* Poll editor: add/remove/cancel */
  .poll-editor button {
    min-width: 44px;
    min-height: 44px;
  }
  /* Remove controls: upgrade from 32px to 44px on touch */
  .remove-control {
    min-width: 44px;
    min-height: 44px;
  }
  /* Reply cancel, profile, submit */
  .editor-reply-banner button,
  .editor-display-name button,
  .editor-input-row button[part="button"] {
    min-width: 44px;
    min-height: 44px;
  }
  /* Formatting toolbar: compact on narrow layouts */
  .formatting-toolbar {
    display: flex !important;
    gap: 2px;
  }
  .formatting-toolbar button {
    min-width: 44px;
    min-height: 44px;
    padding: 4px;
  }
}
/* Respect reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  .editor *,
  .editor *::before,
  .editor *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style><div
        class="editor"
        part="editor"
        style="flex-direction:column;gap:8px;border:${this.dragOver ? "2px dashed var(--cumments-primary, #4f46e5)" : "2px solid transparent"};background:${this.dragOver ? "var(--cumments-bg, #fff)" : "transparent"};transition:border-color 0.15s, background-color 0.15s"
        @focusin=${this.handleFocus}
        @focusout=${this.handleBlur}
        @paste=${this.handlePaste}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
      ${
        isCollapsed
          ? html`<div
              role="button"
              tabindex="0"
              @click=${() => {
                this.focused = true
                setTimeout(
                  () =>
                    (
                      this.querySelector('textarea[aria-label="Comment"]') as HTMLElement | null
                    )?.focus(),
                  0,
                )
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  this.focused = true
                  setTimeout(
                    () =>
                      (
                        this.querySelector('textarea[aria-label="Comment"]') as HTMLElement | null
                      )?.focus(),
                    0,
                  )
                }
              }}
              style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#94a3b8;cursor:text;font-size:14px;background:#f8fafc"
            >${t.commentPlaceholder}</div>`
          : html``
      }
      <div style="display:${isCollapsed ? "none" : "flex"};flex-direction:column;gap:8px">
      ${
        hasReply
          ? html`<div class="editor-reply-banner" style="font-size:12px;color:#4f46e5;display:flex;justify-content:space-between;align-items:center;background:#eef2ff;border-radius:8px;padding:6px 10px">
            <span>${t.replyingTo.replace("{name}", replyDisplayName)}</span>
            <button
              style="background:none;border:none;color:#4f46e5;cursor:pointer;font-size:12px"
              aria-label="${t.cancelReply}"
              @click=${this.handleCancelReply}
            >${t.cancelReply}</button>
          </div>`
          : hasThreadContext
            ? html`<div style="font-size:12px;color:#4f46e5;display:flex;align-items:center;background:#eef2ff;border-radius:8px;padding:6px 10px">
              <span>${t.replyInThread}</span>
            </div>`
            : ""
      }
      <div class="editor-display-name" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;margin-bottom:4px">
        <span>Commenting as</span>
        <button
          aria-label="Edit profile"
          @click=${() => this.onProfileClick?.()}
          style="display:flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:999px;padding:2px 6px;cursor:pointer"
        >
          ${this.profileAvatar ? html`<img src="${this.profileAvatar}" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover" />` : html`<span style="width:16px;height:16px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px">${(this.profileName?.[0] ?? "?").toUpperCase()}</span>`}
          <span>${this.profileName || "Anonymous"}</span>
        </button>
      </div>
      <div class="editor-input-row" style="display:flex;gap:8px;width:100%">
        <textarea
          part="input"
          aria-label="${t.commentAriaLabel}"
          placeholder="${t.commentPlaceholder}"
          .value=${this.draft}
          @input=${this.handleDraftInput}
          @keydown=${this.handleKeydown}
          @focusout=${this.handleTextareaFocusout}
          rows="1"
          style="flex:1;border:1px solid var(--cumments-border, #e2e8f0);border-radius:8px;padding:8px 12px;font-size:14px;line-height:1.5;resize:none;overflow:hidden;font-family:inherit;background:var(--cumments-bg, #fff);color:var(--cumments-text, #1e293b)"
        ></textarea>
        <button part="button" aria-label="${t.postAriaLabel}" @click=${() => void this.handleSubmit()} ?disabled=${submitDisabled} style="background:var(--cumments-primary, #4f46e5);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;opacity:${submitDisabled ? "0.5" : "1"}">${t.postLabel}</button>
      </div>
      <div class="formatting-toolbar" style="display:flex;gap:4px;margin-top:4px;align-items:center;flex-wrap:wrap">
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-weight:700;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center"
          aria-label="Bold"
          aria-pressed=${this.isFormatActive("bold")}
          @mousedown=${this.handleFormatMouseDown}
          @click=${() => this.handleFormatClick("bold")}
        >B</button>
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-style:italic;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center"
          aria-label="Italic"
          aria-pressed=${this.isFormatActive("italic")}
          @mousedown=${this.handleFormatMouseDown}
          @click=${() => this.handleFormatClick("italic")}
        >I</button>
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;text-decoration:line-through;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center"
          aria-label="Strikethrough"
          aria-pressed=${this.isFormatActive("strikethrough")}
          @mousedown=${this.handleFormatMouseDown}
          @click=${() => this.handleFormatClick("strikethrough")}
        >S</button>
        <button
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-family:monospace;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center"
          aria-label="Code"
          aria-pressed=${this.isFormatActive("code")}
          @mousedown=${this.handleFormatMouseDown}
          @click=${() => this.handleFormatClick("code")}
        >&lt;/&gt;</button>
        <span style="position:relative;display:inline-block">
          <button
            style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center"
            aria-label="Link"
            aria-haspopup="dialog"
            aria-expanded=${this.showLinkInput ? "true" : "false"}
            @mousedown=${this.handleFormatMouseDown}
            @click=${() => this.handleFormatClick("link")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          ${
            this.showLinkInput
              ? html`<div
                class="link-popover"
                role="dialog"
                aria-label="Insert link"
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Escape") {
                    e.preventDefault()
                    this.handleLinkClose()
                  }
                }}
                @click=${(e: Event) => e.stopPropagation()}
                style="position:absolute;top:100%;left:0;margin-top:6px;min-width:240px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:8px;z-index:10"
              >
                <form
                  @submit=${(e: Event) => {
                    e.preventDefault()
                    const form = e.target as HTMLFormElement
                    const input = form.querySelector('input[name="url"]') as HTMLInputElement
                    this.handleLinkSubmit(input.value)
                  }}
                >
                  <label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">
                    URL
                    <input
                      name="url"
                      type="text"
                      placeholder="https://example.com"
                      style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:12px;margin-top:2px"
                    />
                  </label>
                  <div style="display:flex;gap:4px;margin-top:8px">
                    <button
                      type="submit"
                      style="background:var(--cumments-primary, #4f46e5);color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px"
                    >Insert</button>
                    <button
                      type="button"
                      style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px"
                      @click=${this.handleLinkClose}
                    >Cancel</button>
                  </div>
                </form>
              </div>`
              : ""
          }
        </span>
      </div>
      <div class="editor-toolbar" style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
        <label class="toolbar-control" style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.pendingMedia?.state === "uploading" ? "0.5" : "1"}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> <span class="tool-label-text">Attach</span>
          <input type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip" style="display:none" @change=${this.handleMediaSelect} ?disabled=${this.pendingMedia?.state === "uploading"} />
        </label>
        ${this.pendingMedia?.state === "uploading" ? html`<span style="font-size:11px;color:#64748b">Uploading…</span>` : ""}
        <span style="position:relative;display:inline-block">
          <button
            style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
            aria-label="Emoji"
            aria-haspopup="dialog"
            aria-expanded=${this.showEmoji ? "true" : "false"}
            @click=${this.handleEmojiToggle}
          ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> <span class="tool-label-text">Emoji</span></button>
          ${
            this.showEmoji
              ? html`<div
                class="emoji-picker"
                role="dialog"
                aria-label="Emoji picker"
                @keydown=${this.handleEmojiKeyDown}
                @click=${(e: Event) => e.stopPropagation()}
                style="position:absolute;top:100%;left:0;margin-top:6px;min-width:240px;max-width:min(280px, 90vw);background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:8px;max-height:280px;overflow-y:auto;z-index:10"
              >
                <input
                  type="search"
                  placeholder="Search emoji..."
                  value=${this.emojiSearch}
                  @input=${this.handleEmojiSearch}
                  style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:12px;margin-bottom:6px"
                />
                <!-- Category tabs -->
                <div class="emoji-picker-category-controls" style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px">
                  <button
                    @click=${() => this.handleEmojiCategoryChange("all")}
                    aria-pressed=${this.emojiCategory === "all"}
                    style="padding:4px 8px;border:1px solid ${this.emojiCategory === "all" ? "var(--cumments-primary, #4f46e5)" : "#e2e8f0"};border-radius:4px;background:${this.emojiCategory === "all" ? "var(--cumments-primary, #4f46e5)" : "white"};color:${this.emojiCategory === "all" ? "white" : "#64748b"};cursor:pointer;font-size:11px"
                  >All</button>
                  ${repeat(
                    EMOJI_CATEGORIES,
                    (c) => c,
                    (c) =>
                      html`<button
                        @click=${() => this.handleEmojiCategoryChange(c)}
                        aria-pressed=${this.emojiCategory === c}
                        style="padding:4px 8px;border:1px solid ${this.emojiCategory === c ? "var(--cumments-primary, #4f46e5)" : "#e2e8f0"};border-radius:4px;background:${this.emojiCategory === c ? "var(--cumments-primary, #4f46e5)" : "white"};color:${this.emojiCategory === c ? "white" : "#64748b"};cursor:pointer;font-size:11px"
                      >${c}</button>`,
                  )}
                </div>
                ${
                  !this.emojiSearch && this.emojiCategory === "all" && this.recentEmojis.length > 0
                    ? html`<div style="margin-bottom:6px">
                      <div style="font-size:10px;color:#64748b;margin-bottom:4px">Recent</div>
                      <div style="display:flex;flex-wrap:wrap;gap:4px">
                        ${repeat(
                          this.recentEmojis,
                          (e) => e,
                          (e) =>
                            html`<button
                              @click=${() => this.handleEmojiPick(e)}
                              aria-label=${this.getEmojiName(e)}
                              title="Recent emoji"
                              style="min-width:28px;min-height:28px;border:1px solid #e2e8f0;border-radius:4px;background:white;cursor:pointer;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center"
                            >${e}</button>`,
                        )}
                      </div>
                    </div>`
                    : ""
                }
                <div class="emoji-picker-grid" style="display:flex;flex-wrap:wrap;gap:2px">
                  ${repeat(
                    this.displayedEmojis,
                    (e) => e.emoji,
                    (e) =>
                      html`<button
                        @click=${() => this.handleEmojiPick(e.emoji)}
                        aria-label=${e.name}
                        title=${e.name}
                        style="min-width:28px;min-height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center"
                      >${e.emoji}</button>`,
                  )}
                </div>
                ${
                  this.displayedEmojis.length === 0
                    ? html`<div style="font-size:12px;color:#64748b;text-align:center;padding:12px">No emoji found</div>`
                    : ""
                }
              </div>`
              : ""
          }
        </span>
        <button class="toolbar-action" style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.locationSharing ? "0.5" : "1"}" @click=${() => void this.handleLocationShare()} ?disabled=${this.locationSharing} aria-label="${this.locationSharing ? "Sharing location" : "Add location"}">
          ${this.locationSharing ? "Sharing…" : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span class="tool-label-text">Location</span>`}
        </button>
        ${this.locationError ? html`<span style="font-size:11px;color:#ef4444" role="alert">${this.locationError}</span>` : ""}
        <button
          class="toolbar-action"
          style="font-size:12px;background:${hasPoll ? "#e0e7ff" : "#f1f5f9"};border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="${hasPoll ? t.removePoll : t.createPoll}"
          aria-pressed=${hasPoll ? "true" : "false"}
          @click=${this.handlePollToggle}
        ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> <span class="tool-label-text">${t.poll}</span></button>
        ${hasPoll ? html`<span style="font-size:11px;color:#64748b">${t.pollMutualExclusive}</span>` : ""}
      <span style="position:relative;display:inline-block">
        <button
          class="toolbar-action"
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="Stickers"
          aria-haspopup="dialog"
          aria-expanded=${this.showStickers ? "true" : "false"}
          @click=${this.handleStickerToggle}
        ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> <span class="tool-label-text">Sticker</span></button>
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
                            aria-label="${img.shortcode}"
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
      <span style="position:relative;display:inline-block">
        <button
          class="more-button"
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="More composer actions"
          aria-haspopup="menu"
          aria-expanded=${this.showMore ? "true" : "false"}
          @click=${this.handleMoreToggle}
        >⋯ <span class="tool-label-text">More</span></button>
        ${
          this.showMore
            ? html`<div
              class="more-menu"
              role="menu"
              aria-label="More actions"
              @keydown=${this.handleMoreKeyDown}
              @click=${(e: Event) => e.stopPropagation()}
              style="position:absolute;top:100%;right:0;margin-top:6px;min-width:140px;background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:4px;z-index:10"
            >
              <button
                role="menuitem"
                @click=${this.handleLocationFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Location</button>
              <button
                role="menuitem"
                @click=${this.handlePollFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Poll</button>
              <button
                role="menuitem"
                @click=${this.handleStickerFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Sticker</button>
            </div>`
            : ""
        }
      </span>
      ${
        hasPoll
          ? html`<div class="poll-editor" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;max-width:100%;box-sizing:border-box">
            <div style="font-size:13px;font-weight:600">${t.poll}</div>
            <label for="poll-question-input" style="font-size:12px;font-weight:500">${t.pollQuestionLabel}</label>
            <input
              id="poll-question-input"
              aria-label="${t.pollQuestionLabel}"
              placeholder="${t.pollQuestionPlaceholder}"
              .value=${this.pollDraft?.question ?? ""}
              @input=${this.handlePollQuestionInput}
              @keydown=${this.handlePollKeyDown}
              style="border:1px solid ${this.pollErrors?.question ? "#ef4444" : "#e2e8f0"};border-radius:6px;padding:6px 8px;font-size:14px;min-width:0;width:100%;box-sizing:border-box"
            />
            ${this.pollErrors?.question ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.question === "Question is required" ? t.pollQuestionRequired : this.pollErrors.question === "Question is too long" ? t.pollQuestionTooLong : this.pollErrors.question}</span>` : ""}
            <div style="font-size:12px;font-weight:500;margin-top:4px">Options</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${repeat(
                this.pollDraft?.options ?? [],
                (_opt, idx) => idx,
                (
                  opt,
                  idx,
                ) => html`<div style="display:flex;gap:6px;align-items:center;max-width:100%">
                  <label for="poll-option-${idx}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">${t.pollOptionLabel.replace("{n}", String(idx + 1))}</label>
                  <input
                    id="poll-option-${idx}"
                    aria-label="${t.pollOptionLabel.replace("{n}", String(idx + 1))}"
                    placeholder="${t.pollOptionLabel.replace("{n}", String(idx + 1))}"
                    .value=${opt}
                    @input=${(e: Event) => this.handlePollOptionInput(idx, e)}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") e.stopPropagation()
                    }}
                    style="flex:1;min-width:0;border:1px solid ${this.pollErrors?.options[idx] ? "#ef4444" : "#e2e8f0"};border-radius:6px;padding:6px 8px;font-size:14px;box-sizing:border-box"
                  />
                  <button
                    aria-label="${t.removeOption.replace("{n}", String(idx + 1))}"
                    @click=${() => this.handleRemoveOption(idx)}
                    ?disabled=${(this.pollDraft?.options.length ?? 0) <= 2}
                    style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${(this.pollDraft?.options.length ?? 0) <= 2 ? "0.5" : "1"};flex-shrink:0"
                  >×</button>
                </div>`,
              )}
            </div>
            ${this.pollErrors?.general ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.general === "At least 2 options required" ? t.pollTooFewOptions : this.pollErrors.general === "Too many options" ? t.pollTooManyOptions : this.pollErrors.general}</span>` : ""}
            ${this.pollErrors?.options.some((e) => e) ? html`<span role="alert" style="font-size:11px;color:#ef4444">${this.pollErrors.options.find((e) => e) === "Option cannot be empty" ? t.pollOptionRequired : this.pollErrors.options.find((e) => e) === "Option is too long" ? t.pollOptionTooLong : (this.pollErrors.options.find((e) => e) ?? "")}</span>` : ""}
            <div style="display:flex;gap:6px;margin-top:4px">
              <button
                aria-label="${t.addOption}"
                @click=${this.handleAddOption}
                ?disabled=${(this.pollDraft?.options.length ?? 0) >= 20}
                style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;opacity:${(this.pollDraft?.options.length ?? 0) >= 20 ? "0.5" : "1"}"
              >${t.addOption}</button>
              <button
                aria-label="${t.cancelPoll}"
                @click=${this.handleCancelPoll}
                style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"
              >${t.cancelPoll}</button>
            </div>
          </div>`
          : ""
      }
      ${
        this.pendingSticker
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">
             <span style="font-size:12px">${this.pendingSticker.shortcode || ""}</span>
            <span style="font-size:11px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.pendingSticker.url}</span>
            <button
              class="remove-control"
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
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid ${this.pendingMedia.state === "failed" ? "#fca5a5" : "#e2e8f0"};border-radius:6px;background:${this.pendingMedia.state === "failed" ? "#fef2f2" : "#f8fafc"};max-width:100%;box-sizing:border-box">
            ${
              this.pendingMedia.state === "ready" &&
              this.pendingMedia.kind?.startsWith("image/") &&
              this.pendingMedia.url
                ? html`<img src="${this.pendingMedia.url}" alt="" style="width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0" />`
                : this.pendingMedia.state === "failed"
                  ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#dc2626" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
                  : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`
            }
            <span style="font-size:11px;color:${this.pendingMedia.state === "failed" ? "#dc2626" : "#64748b"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${this.pendingMedia.filename ?? this.pendingMedia.url}</span>
            ${this.pendingMedia.state === "uploading" ? html`<span style="font-size:10px;color:#64748b;flex-shrink:0" aria-live="polite">Uploading…</span>` : ""}
            ${this.pendingMedia.state === "failed" ? html`<span style="font-size:10px;color:#dc2626;flex-shrink:0" role="alert">Upload failed</span>` : ""}
            <button
              class="remove-control"
              aria-label=${this.pendingMedia.state === "failed" ? "Remove failed attachment" : "Remove attachment"}
              @click=${() => {
                this.uploadGeneration++
                this.pendingMedia = null
              }}
              style="background:none;border:none;cursor:pointer;color:${this.pendingMedia.state === "failed" ? "#dc2626" : "#64748b"};font-size:14px;flex-shrink:0;padding:2px 4px"
            >×</button>
          </div>`
          : ""
      }
      ${
        this.pendingLocation
          ? html`<div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#64748b" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span style="font-size:11px;color:#64748b;flex:1">${this.formatLocation(this.pendingLocation)}</span>
            <button
              class="remove-control"
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
