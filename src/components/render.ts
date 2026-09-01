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
  if (c.type === "text") {
    const body = (c.body as string | undefined) ?? ""
    const formatted = c.formatted_body as string | null | undefined
    // For now, render plain text safely; formatted_body requires sanitizer decision
    // If formatted_body exists, we still render body to avoid innerHTML without sanitizer
    void formatted
    return html`${body}`
  }
  if (c.type === "media") {
    const kind = (c.kind as string) ?? "file"
    const url = (c.url as string) ?? ""
    const proxyUrl = (c.thumbnail_url as string) ?? url
    const filename = (c.filename as string) ?? ""
    const alt = (c.alt_text as string) ?? filename ?? ""
    const width = c.width as number | null | undefined
    const height = c.height as number | null | undefined
    const mimetype = (c.mimetype as string) ?? ""
    const isImage = kind === "image" || kind === "sticker" || mimetype.startsWith("image/")
    const isVideo = kind === "video" || mimetype.startsWith("video/")
    const isAudio = kind === "audio" || mimetype.startsWith("audio/")
    if (isImage) {
      return html`<div style="margin:6px 0">
        <img src="${proxyUrl}" alt="${alt}" loading="lazy" style="max-width:100%;max-height:320px;border-radius:8px;border:1px solid #e2e8f0" width="${width ?? ""}" height="${height ?? ""}" />
        ${filename ? html`<div style="font-size:12px;color:#64748b;margin-top:4px">${filename}</div>` : ""}
      </div>`
    }
    if (isVideo) {
      return html`<div style="margin:6px 0">
        <video src="${url}" controls style="max-width:100%;max-height:320px;border-radius:8px"></video>
        ${filename ? html`<div style="font-size:12px;color:#64748b">${filename}</div>` : ""}
      </div>`
    }
    if (isAudio) {
      return html`<div style="margin:6px 0">
        <audio src="${url}" controls style="width:100%"></audio>
        ${filename ? html`<div style="font-size:12px;color:#64748b">${filename}</div>` : ""}
      </div>`
    }
    // file / sticker fallback
    return html`<div style="margin:6px 0;display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
      <span style="font-size:20px">${kind === "sticker" ? "⭐" : "📎"}</span>
      <a href="${url}" target="_blank" rel="noopener" style="color:#4f46e5;word-break:break-all">${filename || url}</a>
      ${mimetype ? html`<span style="font-size:11px;color:#94a3b8">${mimetype}</span>` : ""}
    </div>`
  }
  if (c.type === "location") {
    const geo = (c.geo_uri as string) ?? ""
    const desc = (c.description as string | null) ?? ""
    const thumb = c.thumbnail_url as string | null | undefined
    return html`<div style="margin:6px 0;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
      ${thumb ? html`<img src="${thumb}" alt="" loading="lazy" style="max-width:100%;border-radius:8px;margin-bottom:6px" />` : ""}
      <div style="font-size:13px;color:#1e293b">${desc || geo}</div>
      ${geo ? html`<a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(geo.replace(/^geo:/, "").split(",")[0] ?? "")}&mlon=${encodeURIComponent(geo.replace(/^geo:/, "").split(",")[1]?.split(";")[0] ?? "")}#map=16/${encodeURIComponent(geo.replace(/^geo:/, "").split(",")[0] ?? "")}/${encodeURIComponent(geo.replace(/^geo:/, "").split(",")[1]?.split(";")[0] ?? "")}" target="_blank" rel="noopener" style="font-size:12px;color:#4f46e5">${geo}</a>` : ""}
    </div>`
  }
  if (c.type === "poll") {
    const question = (c.question as string) ?? ""
    const options = (c.options as Array<{ id: string; text: string }>) ?? []
    const responses = (c.responses as Array<{ option_index: number; count: number }>) ?? []
    const total = responses.reduce((s, r) => s + (r.count as number), 0)
    // Extract poll id from message if available (for voting)
    const pollId = (message as unknown as Record<string, unknown>).event_id as string | undefined
    return html`<div style="margin:6px 0;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
      <div style="font-weight:600;margin-bottom:8px">${question}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${repeat(
          options,
          (opt) => opt.id,
          (opt, idx) => {
            const resp = responses.find((r) => r.option_index === idx)
            const count = resp?.count ?? 0
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return html`<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span style="font-size:14px">${opt.text}</span>
                <span style="font-size:12px;color:#64748b">${count} votes · ${pct}%</span>
              </div>
              <div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:6px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:#4f46e5"></div>
              </div>
              <button
                style="margin-top:6px;font-size:12px;background:#4f46e5;color:white;border:none;border-radius:6px;padding:4px 10px;cursor:pointer"
                data-poll-id="${pollId ?? ""}"
                data-option-id="${opt.id}"
                data-option-index="${idx}"
                @click=${(e: Event) => {
                  const btn = e.currentTarget as HTMLElement
                  const pid = btn.dataset.pollId
                  const oid = btn.dataset.optionId
                  if (pid && oid) {
                    // Dispatch custom event for voting
                    btn.dispatchEvent(
                      new CustomEvent("poll-vote", {
                        bubbles: true,
                        composed: true,
                        detail: { pollId: pid, optionId: oid },
                      }),
                    )
                  }
                }}
              >Vote</button>
            </div>`
          },
        )}
      </div>
      ${total > 0 ? html`<div style="font-size:11px;color:#94a3b8;margin-top:6px">${total} total votes</div>` : ""}
    </div>`
  }
  // Fallback for any other type
  const body = (c.body as string | undefined) ?? ""
  if (body) return html`${body}`
  return html`<span style="color:#64748b">[${(c.type as string) ?? "unknown"}]</span>`
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
  mediaState?: { uploading: boolean; error: string | null },
  onMediaSelect?: (e: Event) => void,
  locationState?: { sharing: boolean; error: string | null },
  onLocationShare?: (e: Event) => void,
  stickerState?: { packs: import("../api/stickers").StickerPack[] | null; loading: boolean },
  onStickerToggle?: (e: Event) => void,
  onStickerPick?: (e: Event) => void,
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
    <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
      <label style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer">
        📎 Attach
        <input type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip" style="display:none" @change=${onMediaSelect} />
      </label>
      ${mediaState?.uploading ? html`<span style="font-size:11px;color:#64748b">Uploading…</span>` : ""}
      ${mediaState?.error ? html`<span style="font-size:11px;color:#ef4444">${mediaState.error}</span>` : ""}
      <button style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer" @click=${onLocationShare} ?disabled=${locationState?.sharing}>
        ${locationState?.sharing ? "Sharing…" : "📍 Location"}
      </button>
      ${locationState?.error ? html`<span style="font-size:11px;color:#ef4444">${locationState.error}</span>` : ""}
      <button style="font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer" @click=${onStickerToggle}>⭐ Sticker</button>
    </div>
    ${
      stickerState?.packs
        ? html`<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;max-height:160px;overflow-y:auto">
          ${
            stickerState.loading
              ? html`<span style="font-size:12px;color:#64748b">Loading stickers…</span>`
              : stickerState.packs.length === 0
                ? html`<span style="font-size:12px;color:#64748b">No stickers</span>`
                : html`${repeat(
                    stickerState.packs,
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
                          @click=${onStickerPick as (e: Event) => void}
                          title="${img.shortcode}"
                        >
                          <img src="${img.proxy_url ?? img.url}" alt="${img.shortcode}" loading="lazy" style="width:32px;height:32px;object-fit:cover;border-radius:4px" />
                        </button>`,
                      )}
                    </div>
                  </div>`,
                  )}`
          }
        </div>`
        : ""
    }
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
