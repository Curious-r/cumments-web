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
  if (
    c.type === "redacted" ||
    (message as unknown as Record<string, unknown>).status === "redacted"
  ) {
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

export function getContentPreview(message: Message, maxLen = 80): string {
  const c = message.content as unknown as Record<string, unknown>
  if (
    c.type === "redacted" ||
    (message as unknown as Record<string, unknown>).status === "redacted"
  )
    return "[Deleted]"
  if (c.type === "encrypted") return "[Encrypted]"
  if (c.type === "media")
    return `[${(c.kind as string) ?? "media"}] ${(c.filename as string) ?? ""}`.trim() || "[Media]"
  if (c.type === "location")
    return (c.description as string) || (c.geo_uri as string) || "[Location]"
  if (c.type === "poll") return (c.question as string) || "[Poll]"
  if (c.type === "unknown") return (c.fallback as string) || "[Unknown]"
  const body = (c.body as string | undefined) ?? ""
  if (!body) return "[Empty]"
  return body.length > maxLen ? body.slice(0, maxLen) + "…" : body
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
  replyInfo?: { target: Message | null; displayName: string } | null,
  onCancelReply?: (e: Event) => void,
) {
  return html`<div class="editor" part="editor" style="flex-direction:column;gap:8px">
    ${
      replyInfo
        ? html`<div style="font-size:12px;color:#4f46e5;display:flex;justify-content:space-between;align-items:center;background:#eef2ff;border-radius:8px;padding:6px 10px">
          <span>${t.replyingTo.replace("{name}", replyInfo.displayName)}</span>
          <button
            style="background:none;border:none;color:#4f46e5;cursor:pointer;font-size:12px"
            aria-label="${t.cancelReply}"
            @click=${onCancelReply}
          >${t.cancelReply}</button>
        </div>`
        : ""
    }
    <div style="display:flex;gap:8px;width:100%">
      <input
        part="input"
        aria-label="${t.commentAriaLabel}"
        placeholder="${t.commentPlaceholder}"
        .value=${draft}
        @input=${onInput}
        @keydown=${onKeydown}
      />
      <button part="button" aria-label="${t.postAriaLabel}" @click=${onSubmit}>${t.postLabel}</button>
    </div>
  </div>`
}

export interface CommentActions {
  onEdit: (e: Event) => void
  onDelete: (e: Event) => void
  onReply: (e: Event) => void
  onSave: (e: Event) => void
  onCancelEdit: (e: Event) => void
  onEditInput: (e: Event) => void
  onEditKeydown: (e: KeyboardEvent) => void
  onConfirmDelete: (e: Event) => void
  onCancelDelete: (e: Event) => void
}

export function renderReplyReference(target: Message | undefined, t: Messages) {
  if (!target) {
    return html`<div style="font-size:12px;color:#94a3b8;border-left:2px solid #e2e8f0;padding-left:8px;margin-bottom:6px;">${t.unavailableReference}</div>`
  }
  const preview = getContentPreview(target, 80)
  const name = target.author.display_name ?? t.reactorUnknown
  // textContent safe, no HTML injection
  return html`<div style="font-size:12px;color:#64748b;border-left:2px solid #e2e8f0;padding-left:8px;margin-bottom:6px;">↩ ${name}: ${preview}</div>`
}

export function renderComment(
  vm: CommentViewModel,
  t: Messages,
  content: ReturnType<typeof renderContent>,
  reactionBar: ReturnType<typeof renderReactionBar>,
  quickReactions: ReturnType<typeof renderQuickReactions>,
  opts: {
    isEditing: boolean
    editingDraft: string
    isDeleting: boolean
    replyTarget?: Message | null
    actions: CommentActions
  },
) {
  const isRedacted =
    vm.message.content.type === "redacted" ||
    (vm.message as unknown as Record<string, unknown>).status === "redacted"
  const canEditDelete =
    vm.isOwn &&
    !isRedacted &&
    (vm.message.content as unknown as Record<string, unknown>).type === "text"
  return html`
    <div class="comment" part="comment" role="article">
      <div class="meta" part="meta">
        ${vm.displayName} · ${new Date(vm.message.timestamp).toLocaleString()}
        ${vm.message.reply_to ? html` · <span>↩ ${t.reply}</span>` : ""}
        ${
          canEditDelete && !opts.isEditing && !opts.isDeleting
            ? html` · <button
              style="font-size:11px;background:none;border:none;color:#64748b;cursor:pointer;padding:0 4px"
              data-event-id="${vm.message.event_id}"
              aria-label="${t.editAriaLabel}"
              @click=${opts.actions.onEdit}
            >${t.edit}</button>
            <button
              style="font-size:11px;background:none;border:none;color:#ef4444;cursor:pointer;padding:0 4px"
              data-event-id="${vm.message.event_id}"
              aria-label="${t.deleteAriaLabel}"
              @click=${opts.actions.onDelete}
            >${t.delete}</button>`
            : ""
        }
        <button
          style="font-size:11px;background:none;border:none;color:#4f46e5;cursor:pointer;padding:0 4px"
          data-event-id="${vm.message.event_id}"
          aria-label="${t.replyAriaLabel}"
          @click=${opts.actions.onReply}
        >${t.reply}</button>
      </div>
      ${vm.message.reply_to ? renderReplyReference(opts.replyTarget ?? undefined, t) : ""}
      ${
        opts.isEditing
          ? html`<div style="display:flex;gap:8px;margin:8px 0">
            <input
              part="input"
              aria-label="${t.editAriaLabel}"
              placeholder="${t.editPlaceholder}"
              .value=${opts.editingDraft}
              data-event-id="${vm.message.event_id}"
              @input=${opts.actions.onEditInput}
              @keydown=${opts.actions.onEditKeydown}
              style="flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:14px"
            />
            <button
              style="background:#4f46e5;color:white;border:none;border-radius:8px;padding:6px 12px;cursor:pointer"
              data-event-id="${vm.message.event_id}"
              aria-label="${t.save}"
              @click=${opts.actions.onSave}
            >${t.save}</button>
            <button
              style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer"
              data-event-id="${vm.message.event_id}"
              aria-label="${t.cancel}"
              @click=${opts.actions.onCancelEdit}
            >${t.cancel}</button>
          </div>`
          : opts.isDeleting
            ? html`<div style="display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;color:#ef4444">
              <span>${t.confirmDelete}</span>
              <button
                style="background:#ef4444;color:white;border:none;border-radius:6px;padding:4px 10px;cursor:pointer"
                data-event-id="${vm.message.event_id}"
                @click=${opts.actions.onConfirmDelete}
              >${t.delete}</button>
              <button
                style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer"
                data-event-id="${vm.message.event_id}"
                @click=${opts.actions.onCancelDelete}
              >${t.cancel}</button>
            </div>`
            : html`<div part="body">${content}</div>`
      }
      ${!opts.isEditing && !isRedacted ? html`${reactionBar} ${quickReactions}` : ""}
    </div>
  `
}
