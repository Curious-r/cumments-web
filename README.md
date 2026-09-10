# cumments-web

Official Web Client for [Cumments](https://github.com/Curious-r/cumments) — a Matrix-backed decentralized comment system.

> **Status: Preview — usable for dogfooding, public API not yet stable.** The browser client is functional, but the `<cumments-comments>` attributes/events are still preview and may change before `1.0`.
>
> **Note on demo backends:** `https://comments.curious.host` is a personal test deployment, **not a stable public service**. It may be unavailable, reset, or change without notice. For anything beyond casual testing, [deploy your own Cumments backend](https://github.com/Curious-r/cumments).

## What is cumments-web

`cumments-web` is an embeddable, framework-independent Web Component for adding identity-aware, realtime discussions to static sites.

* Single custom element `<cumments-comments>` — works with Zola, Hugo, Astro, or any static HTML.
* No framework dependency for consumers — Lit 3 is an internal implementation detail.
* Identity-aware — per-browser Ed25519 identity stored locally, display name and avatar managed transiently.
* Realtime — SSE notifications with `GET`-authoritative reconciliation, pagination, reactions, and polls.
* Content-first — the comment feed is the primary surface; identity and composer tools are progressively disclosed.

## Installation

Install the published browser artifact via CDN or build locally.

**CDN (recommended for static sites):**

```html
<!-- Pinned, reproducible -->
<script type="module" src="https://cumments-web.curious.host/0.5.0/cumments-web.js"></script>
<!-- Preview channel (mutable, tracks latest tag) -->
<script type="module" src="https://cumments-web.curious.host/latest/cumments-web.js"></script>
```

**Local build:**

```bash
pnpm install
pnpm build    # emits dist/cumments-web.js + assets/pow.worker-*.js
```

See [CDN Distribution](./docs/cdn.md) for versioning and worker co-location guarantees.

## Usage

```html
<cumments-comments
  endpoint="https://your-cumments-instance.example.com"
  site-id="my-blog"
  page-slug="hello-world"
  lang="zh-Hans"
></cumments-comments>
```

> **Note:** `https://comments.curious.host` in examples below refers to a personal test deployment. It is **not a stable public service** — deploy your own backend for production use.

**Attributes:**

| Attribute | Required | Description |
|---|---|---|
| `endpoint` | yes | API root, e.g. `https://your-cumments-instance.example.com` |
| `site-id` | yes | Site identifier |
| `page-slug` | yes | Page slug (`PageSlug`, not an arbitrary URL) |
| `per-page` | no | `1..100`, default `20` |
| `lang` | no | BCP 47 tag, default `en` (`zh-Hans` / `en` shipped; `cmn-Hans` → `zh-Hans`) |

Properties mirror attributes (`endpoint`, `siteId`, `pageSlug`, `perPage`, `lang`). The component auto-creates an identity on first load, fetches the page, and connects realtime. Call `element.reload()` to re-fetch the current page. See [Web Component](./docs/web-component.md) for the full preview contract and locale resolution.

## Architecture overview

```
<cumments-comments>
        |
        v
    AppRuntime
        |
        +-- IdentityFeature
        +-- ProfileFeature
        +-- CommentsFeature
        +-- EditorFeature
        +-- RealtimeFeature
```

* **One public CustomElement** — `<cumments-comments>` is the only exported element; `<cumments-editor>` is internal (light DOM, no shadow).
* **Per-instance isolation** — each `<cumments-comments>` creates its own `AppRuntime` via `RuntimeController` (the sole `ReactiveController`). Multiple widgets on the same page do not share state.
* **Transport / signing boundaries** — `HttpTransport` is the sole `fetch` owner; `SigningPipeline` is the sole canonicalization and signing boundary (`challenge → PoW → sign`). `*Client` helpers only build message parts.
* **No global singleton** — no global store, event bus, DI container, or overlay manager. Transient UI (`openKey`) and pending attachments (`pendingMedia` / `pendingSticker` / `pendingLocation`) are per-instance.
* **State primitives** — `EntityCache` (byId), `PageView` (order/meta), `PendingOperation` (pending submission) underpin `CommentsFeature`.

See [Architecture](./docs/architecture.md) for feature ownership and the request pipeline.

## UI behavior

* **Content-first feed** — comment count, live status, and the comment list are the persistent layout. The composer stays collapsed until needed.
* **Identity capsule and profile** — a compact capsule shows the current profile (avatar and display name). Clicking it opens a popover (`role="dialog"`, non-modal) with a profile summary and actions. **Profile** (display name and avatar) is distinct from **Identity** (create, import, backup, mnemonic, switch, remove). Profile is managed via a dedicated dialog; cryptographic operations remain in identity dialogs.
* **Collapsed composer** — `isCollapsed` when unfocused and empty (`!focused && !draft && !replyToId && !pending* && !uploading`). Focus, draft content, reply, or any pending attachment expands it.
* **Composer profile context** — the composer shows a read-only “Commenting as [avatar] Display Name” button (not an editable text field). Clicking it opens the profile dialog. The composer no longer exposes a per-comment display-name input; normal comments use the current profile display name.
* **Progressive disclosure** — secondary tools (Attach, Location, Sticker, Poll, Post) are subordinate to the main input. At `<480px` the tools row wraps and uses icon-only labels without losing accessible names; the input remains the dominant control.
* **Reply workflow** — `Reply` (primary action) sets `replyToId` on the editor; the composer shows reply context with a cancel control. Submitting includes `replyToId` and thread-root derivation.
* **Reaction picker** — persistent reaction summary with a `+` trigger opens a transient picker (`role="dialog"`, non-modal). Single-transient coordination via `openKey`; Escape and focus return are handled.
* **Poll rendering and voting** — poll messages render with question, options, vote counts and total votes, single-choice radio selection, and a Vote button. The selected option is kept, `VOTE` is sent via `PollsClient.vote` (through `CommentsFeature.votePoll`), loading disables controls, errors are shown per-poll with retry, and successful votes refresh via the existing `GET`-authoritative refresh (no SSE/live). Voting does not use `/comments`.
* **Sticker / media / location / poll** — selecting a sticker, uploading media, sharing location, or creating a poll creates a pending state (`pendingSticker` / `pendingMedia` / `pendingLocation` / `pollDraft` with question and options) with a compact preview and remove control. Nothing submits until the user explicitly presses **Post comment**. All pending states are explicit composer attachments and are included in `cumments:submit` together with the current profile display name. Polls require a question (1–500 grapheme clusters) and 2–20 options (1–200 grapheme clusters each) and are validated inline before submission; polls are mutually exclusive with media, sticker, and location.
* **Comment actions** — each comment exposes `Reply` and `⋯` (menu). The `⋯` menu contains `Edit`, `Copy link`, and `Delete` (owner-only). `Delete` uses a modal confirmation dialog with focus trapping; `Copy link` writes the comment URL via `navigator.clipboard`.
* **Dialogs and pickers** — transient surfaces stay inside the component `ShadowRoot`, use appropriate `dialog` / `menu` semantics, support `Escape`, and restore focus to the trigger. No portal outside the shadow tree.
* **Avatar** — avatar upload and removal are backed by `PUT/DELETE /api/v1/sites/{site_id}/visitors/avatar`. Display name updates are applied locally to the profile projection and persisted on the next comment via the existing `display_name` field; there is no dedicated display-name update endpoint.

## Boundaries

```
cumments (backend)  ── HTTP API v1 ──►  cumments-web  ── integration ──►  Zola / Hugo / Astro / custom sites
```

* `cumments` owns domain, HTTP API, Matrix integration, persistence, projection, auth.
* `cumments-web` owns API client, browser identity, request signing, Proof-of-Work, comments/replies/reactions/polls, pagination, SSE/realtime, media/avatar, client state, UI and the final Web Component.
* Static-site generators are consumers, not dependencies. Do not put Zola integration into `cumments`.

Internal research and the phased implementation plan live in `misc/design/` (git-ignored, local only). `docs/` holds user-facing documentation.

## API Contract

cumments-web depends on the Cumments API contract, not a specific server git tag:

* `cumments-web 0.x` supports Cumments API v1.
* Cumments API v1 remains the API version used throughout the `0.x` series, but it is **not considered stable before both Cumments and cumments-web reach 1.0**.
* Once both Cumments and cumments-web reach 1.0, Cumments API v1 will receive compatibility guarantees. Breaking changes to v1 will require a new API version.

Compatible extensions (such as new optional request/response fields or new endpoints) do not break v1 clients. A breaking change is defined as: an old client operating according to the documented contract no longer works against the new server.

The OpenAPI contract lives in the backend repository at `docs/public/openapi.yaml` (OpenAPI 3.2.0) and is the canonical source for request and response types.

## Distribution (Preview 0.x)

Browser artifacts are versioned and distributed via HTTPS CDN (GitHub Pages):

* Immutable version: `https://cumments-web.curious.host/0.5.0/cumments-web.js`
* Preview channel: `https://cumments-web.curious.host/latest/cumments-web.js` (mutable, tracks latest tag)

```html
<!-- Pinned, reproducible -->
<script type="module" src="https://cumments-web.curious.host/0.5.0/cumments-web.js"></script>
<!-- Preview / dogfooding (may contain breaking changes) -->
<script type="module" src="https://cumments-web.curious.host/latest/cumments-web.js"></script>
<cumments-comments endpoint="https://your-cumments-instance.example.com" site-id="my-blog" page-slug="hello-world" lang="zh-Hans"></cumments-comments>
```

`0.x` allows breaking changes; `latest` is a moving alias. For reproducible deploys, pin a version. See [CDN Distribution](./docs/cdn.md).

## Project Goals (priority order)

```
API correctness → Identity correctness → Security correctness → Realtime correctness → State model → Usable UI → Beautiful UI → Theming/integrations
```

## Bundle size

Bundle size is monitored as a performance signal via `pnpm build` (reports raw and gzip). The project does not impose a strict 50 KB gzip ceiling; functional improvements may increase the bundle when the resulting size remains reasonable. Current production build is ~263 KB raw / ~67 KB gzip.

## Development

Prerequisites: [devenv](https://devenv.sh/) (provides Node.js 24 + pnpm + nixd). Backend checkout is expected at `../cumments` for local contract reference (`docs/public/openapi.yaml`).

```bash
# enter dev shell (direnv does this automatically)
devenv shell

# install dependencies
pnpm install

# quality gates (all green on main)
pnpm lint       # biome check .
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run (61 files / 880 tests)
pnpm build      # vite build (ESM, gzip ~67k, reported at build time; no strict 50 KB ceiling — see bundle-size note below)
```

## License

MIT — same as `cumments`.
