import { html } from "lit"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../api/contract/query"
import type { Messages } from "../i18n/messages"
import type { CommentViewModel } from "./view-model"

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
  return body.length > maxLen ? `${body.slice(0, maxLen)}…` : body
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

export interface CommentActions {
  onEdit: (e: Event) => void
  onDelete: (e: Event) => void
  onReply: (e: Event) => void
  onSave: (e: Event) => void
  onCancelEdit: (e: Event) => void
  onEditInput: (e: Event) => void
  onEditKeydown: (e: KeyboardEvent) => void
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

export function renderProfileBar(
  profile: import("../api/visitors").VisitorProfile | null,
  displayNameDraft: string,
  _t: Messages,
  onDisplayNameInput: (e: Event) => void,
  onAvatarSelect: (e: Event) => void,
  onAvatarDelete: (e: Event) => void,
  avatarUploading?: boolean,
) {
  const name = profile?.display_name ?? displayNameDraft ?? ""
  const avatarUrl = profile?.avatar_url ?? null
  return html`<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:12px;background:#f8fafc">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      ${
        avatarUrl
          ? html`<img src="${avatarUrl}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0" />`
          : html`<span style="width:40px;height:40px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;color:#64748b">${(name?.[0] ?? "?").toUpperCase()}</span>`
      }
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px">${name || "Anonymous"}</div>
        <div style="font-size:11px;color:#64748b">${profile?.visitor_id ? `id: ${profile.visitor_id.slice(0, 8)}` : "your anonymous identity"}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input
        placeholder="Display name"
        aria-label="Display name"
        .value=${displayNameDraft}
        @input=${onDisplayNameInput}
        style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:13px"
      />
      <label style="font-size:12px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;cursor:pointer">
        ${avatarUploading ? "Uploading…" : "Avatar"}
        <input type="file" accept="image/*" style="display:none" @change=${onAvatarSelect} />
      </label>
      <button style="font-size:12px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;cursor:pointer" @click=${onAvatarDelete}>Remove</button>
    </div>
  </div>`
}

export function renderIdentityVault(
  identities: import("../identity/keypair").Identity[],
  activePublicKey: string | null,
  _t: Messages,
  onSwitch: (e: Event) => void,
  onRemove: (e: Event) => void,
  onAddRandom: (e: Event) => void,
  onImport: (e: Event) => void,
  showMnemonic: string | null,
  onExport: (e: Event) => void,
  onCopy: (e: Event) => void,
  importError: string | null,
  showBackup: string | null = null,
  onExportBackup: ((e: Event) => void) | null = null,
  onImportBackup: ((e: Event) => void) | null = null,
  onCopyBackup: ((e: Event) => void) | null = null,
) {
  return html`<details style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:12px">
    <summary style="cursor:pointer;font-size:13px;font-weight:600">Identity vault (${identities.length})</summary>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
      ${repeat(
        identities,
        (id) => id.publicKey,
        (id) => {
          const isActive = id.publicKey === activePublicKey
          const fp = id.publicKey.slice(0, 8)
          return html`<div style="display:flex;align-items:center;gap:8px;border:1px solid ${isActive ? "#4f46e5" : "#e2e8f0"};border-radius:6px;padding:6px;background:${isActive ? "#eef2ff" : "white"}">
            <span style="font-size:11px;font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px">${fp}</span>
            <span style="font-size:11px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${id.publicKey.slice(0, 16)}…</span>
            ${isActive ? html`<span style="font-size:11px;color:#4f46e5">active</span>` : html`<button data-public-key="${id.publicKey}" @click=${onSwitch} style="font-size:11px;background:#4f46e5;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">Switch</button>`}
            <button data-public-key="${id.publicKey}" @click=${onRemove} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Remove</button>
            <button data-public-key="${id.publicKey}" @click=${onExport} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Export Mnemonic</button>
            <button data-public-key="${id.publicKey}" @click=${onExportBackup as (e: Event) => void} style="font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Export Backup</button>
          </div>`
        },
      )}
      ${
        showMnemonic
          ? html`<div style="font-size:11px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:8px;word-break:break-all">
        <div style="font-weight:600;color:#92400e;margin-bottom:4px">Mnemonic — never share it</div>
        <div style="font-family:monospace">${showMnemonic}</div>
        <button @click=${onCopy} style="margin-top:6px;font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Copy</button>
      </div>`
          : ""
      }
      ${
        showBackup
          ? html`<div style="font-size:11px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:8px;word-break:break-all">
        <div style="font-weight:600;color:#92400e;margin-bottom:4px">Backup JSON — contains private key. Keep it secure.</div>
        <div style="font-family:monospace;white-space:pre-wrap">${showBackup}</div>
        <button @click=${onCopyBackup as (e: Event) => void} style="margin-top:6px;font-size:11px;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;cursor:pointer">Copy Backup</button>
      </div>`
          : ""
      }
      ${importError ? html`<div style="font-size:12px;color:#ef4444">${importError}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button @click=${onAddRandom} style="font-size:12px;background:#4f46e5;color:white;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">Add random identity</button>
        <label style="font-size:12px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer">
          Import mnemonic
          <input type="file" accept=".txt" style="display:none" @change=${onImport} />
        </label>
        <label style="font-size:12px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer">
          Import backup
          <input type="file" accept=".json" style="display:none" @change=${onImportBackup as (e: Event) => void} />
        </label>
        <span style="font-size:11px;color:#64748b">or paste 12 words / JSON</span>
      </div>
      <div style="display:flex;gap:8px;flex-direction:column">
        <input placeholder="12 word mnemonic" aria-label="Mnemonic input" style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:12px" @change=${onImport} />
        <textarea placeholder='{"version":1,"publicKey":"...","privateKey":"..."}' aria-label="Backup JSON input" style="border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;font-family:monospace;min-height:60px" @change=${onImportBackup as (e: Event) => void}></textarea>
      </div>
      </div>
    </div>
  </details>`
}

export function renderComment(
  vm: CommentViewModel,
  t: Messages,
  content: ReturnType<typeof renderContent>,
  reactions: unknown,
  opts: {
    isEditing: boolean
    editingDraft: string
    isDeleting?: boolean
    replyTarget?: Message | null
    actions: CommentActions
  },
) {
  const isRedacted =
    vm.message.content.type === "redacted" ||
    (vm.message as unknown as Record<string, unknown>).status === "redacted"
  return html`
    <div class="comment" part="comment" role="article">
      <div class="meta" part="meta">
        ${vm.displayName} · ${new Date(vm.message.timestamp).toLocaleString()}
        ${vm.message.reply_to ? html` · <span>↩ ${t.reply}</span>` : ""}
        <button
          style="font-size:11px;background:none;border:none;color:#4f46e5;cursor:pointer;padding:0 4px"
          data-event-id="${vm.message.event_id}"
          aria-label="${t.replyAriaLabel}"
          @click=${opts.actions.onReply}
        >${t.reply}</button>

        <span style="position:relative;display:inline-block">
          <button
            style="font-size:14px;background:none;border:none;color:#64748b;cursor:pointer;padding:0 8px"
            data-event-id="${vm.message.event_id}"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded="${(opts as unknown as { actionMenu?: unknown }).actionMenu ? "true" : "false"}"
            @click=${(opts.actions as unknown as { onMore?: (e: Event) => void }).onMore ?? (() => {})}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                ;(opts.actions as unknown as { onMore?: (e: Event) => void }).onMore?.(e)
              }
            }}
          >⋯</button>
          ${(opts as unknown as { actionMenu?: unknown }).actionMenu ?? ""}
        </span>
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
          : html`<div part="body">${content}</div>`
      }
      ${!opts.isEditing && !isRedacted ? html`${reactions}` : ""}
    </div>
  `
}

export function renderIdentityCapsule(
  profile: import("../api/visitors").VisitorProfile | null,
  _t: Messages,
  open: boolean,
  onToggle: (e: Event) => void,
) {
  const name = profile?.display_name ?? "Anonymous"
  const avatarUrl = profile?.avatar_url ?? null
  const initials = (name?.[0] ?? "?").toUpperCase()
  return html`<button
    part="identity-capsule"
    aria-label="Identity"
    aria-haspopup="dialog"
    aria-expanded="${open ? "true" : "false"}"
    @click=${onToggle}
    style="display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:999px;padding:4px 10px;background:white;cursor:pointer;max-width:160px"
  >
    ${
      avatarUrl
        ? html`<img src="${avatarUrl}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover" />`
        : html`<span style="width:24px;height:24px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#64748b">${initials}</span>`
    }
    <span style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px" class="capsule-name">${name}</span>
  </button>`
}

export function renderIdentityPopover(
  identities: import("../identity/keypair").Identity[],
  activePublicKey: string | null,
  _t: Messages,
  onSwitch: (e: Event) => void,
  onCreate: (e: Event) => void,
  onImport: (e: Event) => void,
  onManage: (e: Event) => void,
  onClose: (e: Event) => void,
) {
  return html`<div role="dialog" aria-label="Identity" style="position:absolute;top:100%;right:0;margin-top:8px;min-width:280px;max-width:300px;background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:12px;z-index:10"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-weight:600">Identity</span><button @click=${onClose} aria-label="Close" style="background:none;border:none;cursor:pointer">×</button></div><div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;margin-bottom:12px">${repeat(
    identities,
    (id) => id.publicKey,
    (id) => {
      const a = id.publicKey === activePublicKey
      return html`<div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid ${a ? "#4f46e5" : "#e2e8f0"};border-radius:8px;background:${a ? "#eef2ff" : "white"}"><span style="font-size:11px;font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px">${id.publicKey.slice(0, 8)}</span><span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a ? "Active" : ""}</span>${a ? html`<span style="color:#4f46e5">●</span>` : html`<button data-public-key="${id.publicKey}" @click=${onSwitch} style="background:#4f46e5;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">Switch</button>`}</div>`
    },
  )}</div><div style="display:flex;gap:8px"><button @click=${onCreate} style="flex:1;background:#4f46e5;color:white;border:none;border-radius:6px;padding:8px;cursor:pointer">Create</button><button @click=${onImport} style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:8px;cursor:pointer">Import</button><button @click=${onManage} style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:8px;cursor:pointer">Manage</button></div></div>`
}

export function renderActionMenu(
  _t: Messages,
  isOwn: boolean,
  onEdit: (e: Event) => void,
  onCopyLink: (e: Event) => void,
  onDelete: (e: Event) => void,
  _onClose: (e: Event) => void,
  eventId?: string,
  onKeyDown?: (e: KeyboardEvent) => void,
) {
  return html`<div role="menu" @keydown=${onKeyDown ?? (() => {})} style="position:absolute;top:100%;right:0;margin-top:4px;min-width:160px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:4px;z-index:10">${isOwn ? html`<button role="menuitem" aria-label="Edit comment" data-event-id="${eventId ?? ""}" @click=${onEdit} style="width:100%;text-align:left;background:none;border:none;padding:8px 12px;cursor:pointer">Edit</button>` : ""}<button role="menuitem" aria-label="Copy link" data-event-id="${eventId ?? ""}" @click=${onCopyLink} style="width:100%;text-align:left;background:none;border:none;padding:8px 12px;cursor:pointer">Copy link</button>${isOwn ? html`<button role="menuitem" aria-label="Delete comment" data-event-id="${eventId ?? ""}" @click=${onDelete} style="width:100%;text-align:left;background:none;border:none;padding:8px 12px;cursor:pointer;color:#ef4444">Delete</button>` : ""}</div>`
}

export function renderDeleteDialog(
  _t: Messages,
  onCancel: (e: Event) => void,
  onConfirm: (e: Event) => void,
  eventId?: string,
  onKeyDown?: (e: KeyboardEvent) => void,
) {
  return html`<div role="dialog" aria-modal="true" aria-labelledby="delete-title" @keydown=${onKeyDown ?? (() => {})} style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px" @click=${(
    e: Event,
  ) => {
    if (e.target === e.currentTarget) onCancel(e)
  }}>
    <div style="background:white;border-radius:12px;padding:20px;max-width:400px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
      <h3 id="delete-title" style="margin:0 0 8px;font-size:16px;font-weight:600">Delete comment?</h3>
      <p style="margin:0 0 16px;font-size:14px;color:#64748b">Cannot be undone.</p>
      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button @click=${onCancel} style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;cursor:pointer">Cancel</button>
        <button data-event-id="${eventId ?? ""}" @click=${onConfirm} style="background:#ef4444;color:white;border:none;border-radius:8px;padding:8px 16px;cursor:pointer">Delete</button>
      </div>
    </div>
  </div>`
}

export function renderReactionPicker(
  _t: Messages,
  onSelect: (e: Event) => void,
  onClose: (e: Event) => void,
) {
  const emojis = ["❤️", "👍", "😂", "🎉", "😮", "😢", "👏", "🔥"]
  return html`<div role="dialog" aria-label="Pick reaction" style="position:absolute;top:100%;left:0;margin-top:4px;background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);padding:8px;display:flex;gap:4px;flex-wrap:wrap;max-width:240px;z-index:10">
    ${repeat(
      emojis,
      (e) => e,
      (emoji) =>
        html`<button @click=${onSelect} data-reaction-key="${emoji}" style="width:36px;height:36px;border:1px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">${emoji}</button>`,
    )}
    <button @click=${onClose} aria-label="Close" style="width:36px;height:36px;border:1px solid #e2e8f0;border-radius:8px;background:#f1f5f9;cursor:pointer">×</button>
  </div>`
}

export function renderIdentityDialog(
  title: string,
  content: unknown,
  _t: Messages,
  onClose: (e: Event) => void,
) {
  return html`<div role="dialog" aria-modal="true" aria-labelledby="identity-dialog-title" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px" @click=${(
    e: Event,
  ) => {
    if (e.target === e.currentTarget) onClose(e)
  }}>
    <div style="background:white;border-radius:12px;padding:20px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 id="identity-dialog-title" style="margin:0;font-size:16px;font-weight:600">${title}</h3>
        <button @click=${onClose} aria-label="Close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#64748b">×</button>
      </div>
      <div>${content}</div>
    </div>
  </div>`
}
