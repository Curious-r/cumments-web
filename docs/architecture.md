# Architecture

`cumments-web` is a browser client for `Cumments API v1`. `cumments` (Rust) remains `backend-only`.

```
cumments (backend) — HTTP API v1
        ↓
cumments-web (TS7, Vite 8, Lit 3) — ClientContext → Pipeline → Store → SSE
        ↓
<cumments-comments> (thin view, CommentController → IdentityManager/ProfileManager)
        ↓
Any static site (Zola/Hugo/Astro) — single <script type="module">
```

## Semantic Boundaries (Preview, frozen internally)

| Concept | Meaning | Notes |
|---|---|---|
| `endpoint` | API root, e.g. `https://comments.curious.host` | Trailing `/` normalized, joined with `/api/v1` |
| `siteId` | Site identifier (path segment) | `encodeURIComponent`, case-sensitive, no `/` |
| `pageSlug` | `page_slug` — Cumments `PageSlug`, not an arbitrary URL or opaque page ID | Same encoding as `siteId` |
| `identity` | `Ed25519 publicKey` | `IdentityManager.ensure()` auto `generateRandomIdentity` → `cumments_identities` (`activePublicKey`) with migration from `cumments_identity` → `ClientContext.setIdentity`; `fingerprint` = `SHA-256(pubkey)[0:8]` (32 hex visitor_id) |
| `CommentStore` | **Current page view** (`byId/order/meta/pending/error`), `loadPage` incremental `byId.set` (session cache for reply) + `order/meta` replace | `total` from `meta`, `byId` retained for cross-page `getMessage` |
| `pending` | `submission_id` primary, `publicKey+body±5min` fallback | `create(202)` → `setPending` → `SSE` or `poll(2s×15→10s)`/`loadPage` clears on `submission_id` hit |
| `realtime` | `SseClient` 5 events + `seenIds 500 LRU` + backoff | **Formal: `SSE = notification/acceleration`, `GET = authoritative`**. Missed `N+1` during disconnect is reconciled by next `GET`, not by `Last-Event-ID` replay |
| `perPage` | `1..100`, default `20` | Mirrors backend `per_page` |

`ClientContext` holds only `endpoint/siteId/pageSlug/identity/challengeManager/powSolver`. `CommentStore` holds only `byId/order/meta/pending/error` (single store, `byId` is session `Map` for reply lookup, no LRU).

`IdentityManager` (plain class, `src/identity/identity-manager.ts`) owns `localStorage["cumments_identities"]` (`{identities, activePublicKey}`) with migration from old `cumments_identity` (`activePublicKey` stable, not index). `ensure()` validates `active` via `identityMatches`; invalid active falls back to first valid stored identity or throws requiring backup/mnemonic recovery (never silently signs with invalid). Backup is versioned JSON `{version:1, publicKey, privateKey}` via `exportIdentity`/`importIdentityBackup` (deterministic, `identityMatches` verified, duplicate rejected). `ProfileManager` (plain class, `src/identity/profile-manager.ts`) caches `Map<publicKey, VisitorProfile>` with 5min TTL via `VisitorsClient` (`GET /visitors/profile`, `PUT/DELETE /visitors/avatar` via `signPipeline UPLOAD_AVATAR/DELETE_AVATAR`).

`CommentController` remains the sole `ReactiveController` and orchestrates `IdentityManager`/`ProfileManager`/`CommentStore`/`SseClient`/`*Clients`; managers are plain domain objects (no `host`/`requestUpdate`/`loading`).

## Request Pipeline (single security boundary)

```
operation → canonical parts → signPipeline(challenge→PoW→sign) → transport
```

`Comments/Reactions/Polls/Location/Media/Visitors` only build `messageParts` (`["POST"/"LOCATE"/"PATCH"/"REACT"/"VOTE"/"UPLOAD"/"UPLOAD_AVATAR"/"DELETE_AVATAR", ...]` etc.), `signPipeline` appends `challenge.prefix` (and `"1"` for `POST`/`LOCATE`/`PATCH`/`REACT`/`VOTE`) and returns `author_public_key/signature/challenge_response`. `MediaClient`/`LocationClient`/`VisitorsClient` reuse `signPipeline` and `Idempotency-Key` where required.
