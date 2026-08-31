import { html } from "lit"
import { ifDefined } from "lit/directives/if-defined.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../api/contract/query"
import type { Messages } from "../i18n/messages"
import type { CommentViewModel } from "./view-model"

const stopPropagation = (e: Event) => e.stopPropagation()

// Content rendering: Message is source of truth
export function renderContent(message: Message) {
  const c = message.content as unknown as Record<string, unknown>
  // redacted tombstone
  if (c.type === "redacted") {
    return html`<span style="color:#94a3b8;font-style:italic">— deleted —</span>`
  }
  if (c.type === "encrypted") {
    return html`<span style="color:#94a3b8;font-style:italic">— encrypted —</span>`
  }
  if (c.type === "unknown") {
    const fallback = (c.fallback as string | null) ?? (c.body as string | null) ?? ""
    return html`${fallback}`
  }
  // For text, use body; for media/poll/location phase1 fallback to body or placeholder
  // Preserve Message without flattening: read from message.content directly
  const body = (c.body as string | undefined) ?? ""
  if (body) return html`${body}`
  // Fallback for non-text types in phase1 (media/poll/location not yet implemented)
  if (c.type === "media" || c.type === "poll" || c.type === "location") {
    return html`<span style="color:#64748b">[${c.type}]</span>`
  }
  return html``
}

export interface ReactionBarHandlers {
  onReactionClick: (e: Event) => void
  onReactionMouseEnter: (e: Event) => void
  onReactionMouseLeave: (e: Event) => void
  onReactionFocus: (e: Event) => void
  onReactionBlur: (e: Event) => void
  onReactionKeyDown: (e: KeyboardEvent) => void
  onReactionPointerDown: (e: PointerEvent) => void
  onReactionPointerMove: (e: PointerEvent) => void
  onReactionPointerUp: (e: PointerEvent) => void
  onReactionPointerCancel: (e: Event) => void
  onReactionPointerLeave: (e: Event) => void
  onReactionContextMenu: (e: Event) => void
}

export function renderReactionBar(
  vm: CommentViewModel,
  openKey: string | null,
  tooltipPos: { top: number; left: number } | null,
  getReactorKey: (eventId: string, key: string) => string,
  getTooltipId: (key: string) => string,
  getOthersText: (count: number, reactorsLength: number, t: Messages) => string | null,
  getAriaLabel: (r: { key: string; count: number; mine: boolean }, t: Messages) => string,
  getReactorDisplayName: (
    reactor: { display_name: string | null | undefined; avatar_url: string | null | undefined },
    t: Messages,
  ) => string,
  getInitials: (name: string) => string,
  t: Messages,
  handlers: ReactionBarHandlers,
) {
  const reactions = vm.message.reactions ?? []
  if (reactions.length === 0) return html``
  return html`<div class="reactions" part="reactions">
    ${repeat(
      reactions,
      (r) => r.key,
      (r) => {
        const key = getReactorKey(vm.message.event_id, r.key)
        const isOpen = openKey === key
        const tipId = getTooltipId(key)
        const othersText = getOthersText(r.count, r.reactors.length, t)
        const ariaLabel = getAriaLabel(r, t)
        return html`
          <button
            class="reaction ${r.mine ? "mine" : ""}"
            part="reaction"
            data-reactor-key="${key}"
            data-event-id="${vm.message.event_id}"
            data-reaction-key="${r.key}"
            data-reaction-mine="${r.mine ? "1" : "0"}"
            aria-label="${ariaLabel}"
            aria-describedby=${ifDefined(isOpen ? tipId : undefined)}
            @click=${handlers.onReactionClick}
            @mouseenter=${handlers.onReactionMouseEnter}
            @mouseleave=${handlers.onReactionMouseLeave}
            @focus=${handlers.onReactionFocus}
            @blur=${handlers.onReactionBlur}
            @keydown=${handlers.onReactionKeyDown}
            @pointerdown=${handlers.onReactionPointerDown}
            @pointermove=${handlers.onReactionPointerMove}
            @pointerup=${handlers.onReactionPointerUp}
            @pointercancel=${handlers.onReactionPointerCancel}
            @pointerleave=${handlers.onReactionPointerLeave}
            @contextmenu=${handlers.onReactionContextMenu}
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
                  style="${tooltipPos ? `top:${tooltipPos.top}px;left:${tooltipPos.left}px;` : ""}"
                  @click=${stopPropagation}
                >
                  ${repeat(
                    r.reactors.slice(0, 5),
                    (reactor, idx) =>
                      `${reactor.display_name ?? "?"}-${idx}-${reactor.avatar_url ?? ""}`,
                    (reactor) => {
                      const name = getReactorDisplayName(
                        reactor as { display_name: string | null; avatar_url: string | null },
                        t,
                      )
                      const avatar = reactor.avatar_url
                      const initials = getInitials(name)
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
                              : html`<span class="reactor-avatar" part="reactor-avatar">${initials}</span>`
                          }
                          <span class="reactor-name" part="reactor-name">${name}</span>
                        </div>
                      `
                    },
                  )}
                  ${
                    othersText
                      ? html`<div class="reactor-others" part="reactor-others">${othersText}</div>`
                      : ""
                  }
                </div>
              `
              : ""
          }
        `
      },
    )}
  </div>`
}

export function renderQuickReactions(
  vm: CommentViewModel,
  t: Messages,
  onQuickReaction: (e: Event) => void,
) {
  return html`<div class="reactions" style="opacity:0.7">
    <span style="font-size:11px;color:#94a3b8;margin-right:4px;">${t.reactLabel}</span>
    ${["👍", "❤️", "😂"].map(
      (k) =>
        html`<button
          class="reaction"
          part="reaction"
          style="background:#f1f5f9"
          aria-label="${k} ${t.reactionAddLabel}"
          data-event-id="${vm.message.event_id}"
          data-reaction-key="${k}"
          @click=${onQuickReaction}
          >+ ${k}</button
        >`,
    )}
  </div>`
}

export function renderPagination(
  page: number,
  totalPages: number,
  t: Messages,
  onPrev: (e: Event) => void,
  onNext: (e: Event) => void,
) {
  if (totalPages <= 1) return html``
  return html`<div class="pagination" part="pagination">
    <button ?disabled=${page <= 1} @click=${onPrev} aria-label="${t.prev}">${t.prev}</button>
    <span>${page} / ${totalPages}</span>
    <button ?disabled=${page >= totalPages} @click=${onNext} aria-label="${t.next}">${t.next}</button>
  </div>`
}

export function renderEditor(
  draft: string,
  t: Messages,
  onInput: (e: Event) => void,
  onKeydown: (e: KeyboardEvent) => void,
  onSubmit: (e: Event) => void,
) {
  return html`<div class="editor" part="editor">
    <input
      part="input"
      aria-label="${t.commentAriaLabel}"
      placeholder="${t.commentPlaceholder}"
      .value=${draft}
      @input=${onInput}
      @keydown=${onKeydown}
    />
    <button part="button" aria-label="${t.postAriaLabel}" @click=${onSubmit}>${t.postLabel}</button>
  </div>`
}

export function renderComment(
  vm: CommentViewModel,
  t: Messages,
  content: ReturnType<typeof renderContent>,
  reactionBar: ReturnType<typeof renderReactionBar>,
  quickReactions: ReturnType<typeof renderQuickReactions>,
) {
  return html`
    <div class="comment" part="comment" role="article">
      <div class="meta" part="meta">
        ${vm.displayName} · ${new Date(vm.message.timestamp).toLocaleString()}
        ${vm.message.reply_to ? html` · <span>↩ ${t.reply}</span>` : ""}
      </div>
      <div part="body">${content}</div>
      ${reactionBar} ${quickReactions}
    </div>
  `
}
