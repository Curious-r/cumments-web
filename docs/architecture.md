# Architecture

`cumments-web` is a browser client for `Cumments API v1`. `cumments` (Rust) remains `backend-only`.

```
cumments (backend, 0.28.1) — HTTP API v1 (api/openapi.yaml 6eaa9b64)
        ↓
cumments-web (TS7, Vite 8, Lit 3) — ClientContext → Pipeline → Store → SSE
        ↓
<cumments-comments> (thin view, CommentController)
        ↓
Any static site (Zola/Hugo/Astro) — single <script type="module">
```

## Semantic Boundaries (Preview, frozen internally)

| Concept | Meaning | Notes |
|---|---|---|
| `endpoint` | API root, e.g. `https://comments.curious.host` | Trailing `/` normalized, joined with `/api/v1` |
| `siteId` | Site identifier (path segment) | `encodeURIComponent`, case-sensitive, no `/` |
| `pageSlug` | `page_slug` — Cumments `PageSlug`, not an arbitrary URL or opaque page ID | Same encoding as `siteId` |
| `identity` | `Ed25519 publicKey` | First visit auto `generateRandomIdentity → saveIdentity(cumments_identity)` → `ClientContext.setIdentity` |
| `CommentStore` | **Current page view** (`byId/order/meta/pending/error`), `loadPage` replaces the page | `total` from `meta`, not a full collection |
| `pending` | `submission_id` primary, `publicKey+body±5min` fallback | `create(202)` → `setPending` → `SSE` or `poll(2s×15→10s)`/`loadPage` clears on `submission_id` hit |
| `realtime` | `SseClient` 5 events + `seenIds 500 LRU` + backoff | **Formal: `SSE = notification/acceleration`, `GET = authoritative`**. Missed `N+1` during disconnect is reconciled by next `GET`, not by `Last-Event-ID` replay |
| `perPage` | `1..100`, default `20` | Mirrors backend `per_page` |

`ClientContext` holds only `endpoint/siteId/pageSlug/identity/challengeManager/powSolver`. `CommentStore` holds only `byId/order/meta/pending/error`.

## Request Pipeline (single security boundary)

```
operation → canonical parts → signPipeline(challenge→PoW→sign) → transport
```

`Comments/Reactions/Polls/Location` only build `messageParts` (`["POST"/"LOCATE"/"PATCH"/"REACT"/"VOTE", ...]` etc.), `signPipeline` appends `challenge.prefix` (and `"1"` for `POST`/`LOCATE`/`PATCH`/`REACT`/`VOTE`) and returns `author_public_key/signature/challenge_response`.
