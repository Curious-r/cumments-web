import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../../api/contract/query"
import type { StickerPack } from "../../api/stickers"
import { resolveLocale } from "../../i18n/locale"
import { messages } from "../../i18n/messages"
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
          t.closest('.more-menu') ||
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
  }

  private removeWindowListeners(): void {
    if (this.boundWindowClick) {
      window.removeEventListener("click", this.boundWindowClick, true)
      this.boundWindowClick = null
    }
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

  private handleDraftInput = (e: Event) => {
    this.draft = (e.target as HTMLTextAreaElement).value
    this.autoGrow()
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
    if (!this.uploadMedia) {
      this.uploadGeneration++
      this.pendingMedia = {
        url: null,
        kind: file.type || "application/octet-stream",
        filename: file.name,
        state: "failed",
      }
      return
    }
    const generation = ++this.uploadGeneration
    this.pendingMedia = {
      url: null,
      kind: file.type || "application/octet-stream",
      filename: file.name,
      state: "uploading",
    }
    try {
      const result = await this.uploadMedia(file)
      if (generation !== this.uploadGeneration) return
      this.pendingMedia = {
        url: result.url,
        kind: result.mimetype ?? file.type ?? "image",
        filename: result.filename ?? file.name,
        state: "ready",
      }
      this.pendingSticker = null
      this.focused = true
    } catch (_err) {
      if (generation !== this.uploadGeneration) return
      this.pendingMedia = {
        url: null,
        kind: file.type || "application/octet-stream",
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
        const first = this.querySelector(".more-menu button") as HTMLElement | null
        first?.focus()
      })
    }
  }

  private handleMoreClose = () => {
    this.showMore = false
    this.updateComplete.then(() => {
      const btn = this.querySelector('button[aria-label="More composer actions"]') as HTMLElement | null
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
    const current = buttons.findIndex(b => b === document.activeElement)
    const next = current + delta
    if (next >= 0 && next < buttons.length) {
      buttons[next].focus()
    }
  }

  private handleLocationFromMore = () => {
    this.showMore = false
    void this.handleLocationShare()
  }

  private handlePollFromMore = () => {
    this.showMore = false
    this.handlePollToggle(new Event("click"))
  }

  private handleStickerFromMore = () => {
    this.showMore = false
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
          ? html`<div @click=${() => {
              this.focused = true
              setTimeout(
                () =>
                  (
                    this.querySelector('textarea[aria-label="Comment"]') as HTMLElement | null
                  )?.focus(),
                0,
              )
            }} style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#94a3b8;cursor:text;font-size:14px;background:#f8fafc">${t.commentPlaceholder}</div>`
          : html``
      }
      <div style="display:${isCollapsed ? "none" : "flex"};flex-direction:column;gap:8px">
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
          rows="1"
          style="flex:1;border:1px solid var(--cumments-border, #e2e8f0);border-radius:8px;padding:8px 12px;font-size:14px;line-height:1.5;resize:none;overflow:hidden;font-family:inherit;background:var(--cumments-bg, #fff);color:var(--cumments-text, #1e293b)"
        ></textarea>
        <button part="button" aria-label="${t.postAriaLabel}" @click=${() => void this.handleSubmit()} ?disabled=${submitDisabled} style="background:var(--cumments-primary, #4f46e5);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;opacity:${submitDisabled ? "0.5" : "1"}">${t.postLabel}</button>
      </div>
      <div class="editor-toolbar" style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.pendingMedia?.state === "uploading" ? "0.5" : "1"}">
          <span aria-hidden="true">📎</span> <span class="tool-label-text">Attach</span>
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
          >😊 <span class="tool-label-text">Emoji</span></button>
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
                              style="width:28px;height:28px;border:1px solid #e2e8f0;border-radius:4px;background:white;cursor:pointer;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center"
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
                        style="width:28px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center"
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
        <button class="toolbar-action" style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer;opacity:${this.locationSharing ? "0.5" : "1"}" @click=${() => void this.handleLocationShare()} ?disabled=${this.locationSharing}>
          ${this.locationSharing ? "Sharing…" : html`📍 <span class="tool-label-text">Location</span>`}
        </button>
        ${this.locationError ? html`<span style="font-size:11px;color:#ef4444">${this.locationError}</span>` : ""}
        <button
          class="toolbar-action"
          style="font-size:12px;background:${hasPoll ? "#e0e7ff" : "#f1f5f9"};border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="${hasPoll ? t.removePoll : t.createPoll}"
          aria-pressed=${hasPoll ? "true" : "false"}
          @click=${this.handlePollToggle}
        >📊 <span class="tool-label-text">${t.poll}</span></button>
        ${hasPoll ? html`<span style="font-size:11px;color:#64748b">${t.pollMutualExclusive}</span>` : ""}
      <span style="position:relative;display:inline-block">
        <button
          class="toolbar-action"
          style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer"
          aria-label="Stickers"
          aria-haspopup="dialog"
          aria-expanded=${this.showStickers ? "true" : "false"}
          @click=${this.handleStickerToggle}
        >⭐ <span class="tool-label-text">Sticker</button>
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
              style="position:absolute;top:100%;right:0;margin-top:6px;min-width:140px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:4px;z-index:10"
            >
              <button
                role="menuitem"
                @click=${this.handleLocationFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              >📍 Location</button>
              <button
                role="menuitem"
                @click=${this.handlePollFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              >📊 Poll</button>
              <button
                role="menuitem"
                @click=${this.handleStickerFromMore}
                style="display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:12px"
              >⭐ Sticker</button>
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
            <span style="font-size:12px">${this.pendingSticker.shortcode || "⭐"}</span>
            <span style="font-size:11px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.pendingSticker.url}</span>
            <button
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
                  ? html`<span style="font-size:12px;flex-shrink:0" aria-hidden="true">⚠️</span>`
                  : html`<span style="font-size:12px;flex-shrink:0" aria-hidden="true">📎</span>`
            }
            <span style="font-size:11px;color:${this.pendingMedia.state === "failed" ? "#dc2626" : "#64748b"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${this.pendingMedia.filename ?? this.pendingMedia.url}</span>
            ${this.pendingMedia.state === "uploading" ? html`<span style="font-size:10px;color:#64748b;flex-shrink:0">Uploading…</span>` : ""}
            <button
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
