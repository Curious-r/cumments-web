# Architecture

`cumments-web` is a browser client for `Cumments API v1`. `cumments` (Rust) remains `backend-only`.

```
cumments (backend) — HTTP API v1
        ↓
cumments-web (TS7, Vite 8, Lit 3) — AppRuntime → Features → State → SSE
        ↓
<cumments-comments> (thin view, RuntimeController)
        ↓
Any static site (Zola/Hugo/Astro) — single <script type="module">
```

## Composition Root

`AppRuntime` is the per-widget composition root (`src/runtime/app-runtime.ts`). Each `<cumments-comments>` instance creates its own `AppRuntime` via `ensureRuntime()` and `RuntimeController` (the sole `ReactiveController`). `AppRuntime` owns `transport`/`signingPipeline`/`persistence` and composes `IdentityFeature`/`ProfileFeature`/`CommentsFeature`/`EditorFeature`/`RealtimeFeature` from plain state primitives (`EntityCache`, `PageView`, `PendingOperation`).

No global singleton, store, event bus, or DI container. Multiple `<cumments-comments>` on the same page remain isolated via per-instance `openKey`, `pending*`, `editingId` and `instanceId`-scoped IDs.

## Features (plain domain objects, no host)

| Feature | Owns | Notes |
|---|---|---|
| `IdentityFeature` (`src/identity/identity-feature.ts`) | `localStorage["cumments_identities"]` (`{identities, activePublicKey}`) + migration from `cumments_identity` | `ensure()` validates via `identityMatches`; backup is versioned JSON `{version:1, publicKey, privateKey}` |
| `ProfileFeature` (`src/identity/profile-feature.ts`) | `Map<publicKey, VisitorProfile>` 5 min TTL via `VisitorsClient` (`GET /visitors/profile`, `PUT/DELETE /visitors/avatar`; `display_name` has no dedicated endpoint and is written as a side effect of `POST /comments`) | Owns current profile projection; `setDisplayName()` updates the local projection immediately (persists on next comment), `setAvatar()`/`deleteAvatar()` hit the avatar endpoints and refresh |
| `CommentsFeature` (`src/features/comments-feature.ts`) | `EntityCache` (session `Map` byId), `PageView` (order/meta), `PendingOperation` (`submission_id`), `loadPage`/`reconcile` | `GET` authoritative, `SSE` notification, `pending` single slot |
| `EditorFeature` (`src/features/editor-feature.ts`) | `submitFromIntent`/`deriveThreadRootFor` | Pure, no `ProfileFeature` dependency; `displayName` is supplied by the caller (the composer consumes the current profile) and normalized to `Anonymous` if blank |
| `RealtimeFeature` (`src/features/realtime-feature.ts` via `SseTransport`) | `seenIds 500 LRU` + backoff, 5 `SseData` events | `AppRuntime.onRealtimeEvent` → `CommentsFeature.reconcile` |

`RuntimeController` (`src/runtime/runtime-controller.ts`) is the sole `ReactiveController` and orchestrates `identity → profile+comments` and `realtime → reconcile`.

## State Primitives

`EntityCache` (`byId`), `PageView` (`order`/`meta`), `PendingOperation` (`pending: PendingSubmission|null`). `CommentSnapshot` exposes `messages`/`meta`/`pending`/`loading`/`error`/`votingPollId`.

## Request Pipeline (single security boundary)

```
operation → canonical parts → SigningPipeline(challenge→PoW→sign) → HttpTransport  (supports POST/COMMENT, LOCATE, POLL, REACT/VOTE, PATCH/DELETE)
```

`*Client` (`Comments`/`Reactions`/`Polls`/`Location`/`Media`/`Visitors`) only builds `messageParts` (`["POST"/"LOCATE"/"POLL"/"PATCH"/"REACT"/"VOTE"/"UPLOAD"/…]`), `SigningPipeline` appends `challenge.prefix` (and `"1"` for `POST`/`LOCATE`/`POLL`/`PATCH`/`REACT`/`VOTE`) and returns `author_public_key/signature/challenge_response`. `HttpTransport` is the sole `fetch` owner; `SigningPipeline` is the sole canonicalization boundary. `ClientContext` holds only `endpoint`/`siteId`/`pageSlug`/`identity`/`challengeManager`/`powSolver`.

## UI Model (content-first, identity-contextual, progressive disclosure)

Persistent layout: comment count/live, feed, compact identity capsule, collapsed composer. Transient: identity popover (with profile summary and Profile action) → profile dialog and identity dialogs, `⋯` menu (`Edit`/`Copy link`/`Delete` → modal), reaction summary + `+` → picker, sticker picker, pending `media`/`sticker`/`location`/`poll` + `Post`.

* `<cumments-comments>` is the only public custom element; `<cumments-editor>` is the sole internal element (light DOM, no shadow) and owns `draft`/`replyToId`/`pollDraft`/`pending*`/`showStickers`/`focused`. The editor consumes the current profile (`profileName`/`profileAvatar`) as read-only context (“Commenting as …”) and does not own persistent profile state. Poll drafts are validated inline (question 1–500, options 2–20 × 1–200 grapheme clusters, max_selections=1) and are mutually exclusive with media, sticker, and location.
* `ProfileFeature` is the sole owner of profile state (`VisitorProfile` cache and current projection); the composer and editor read from it via `AppRuntime`. Display-name edits update the local projection via `setDisplayName()` and are persisted on the next comment; avatar edits use the dedicated avatar endpoints.
* `render.ts` is pure `render*` functions (`renderComment`/`renderContent`/`renderReactionPicker`/…); no `ProfileBar`/`IdentityVault` persistent panel.
* `isCollapsed` = `!focused && !draft && !replyToId && !mediaUploading && !locationSharing && !showStickers && !pending* && !pollDraft`.
* `openKey` (`identity-popover` / `action-menu:*` / `reaction-picker:*` / `sticker-picker`) is the single transient coordinator; `window` click/scroll/resize/`Escape` via `composedPath` + `closest('[role="menu"]|[role="dialog"]')` and `closeTransient` with focus return. No portal outside `ShadowRoot`, no global overlay manager.

## Secrets

`privateKey`/`mnemonic`/`backup` never in `data-*`/`CustomEvent.detail`/`localStorage` (except `cumments_identities` for identities) / logs; only explicit dialog reveal with `navigator.clipboard.writeText` on user gesture.

