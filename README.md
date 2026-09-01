# cumments-web

Official Web Client for [Cumments](https://github.com/Curious-r/cumments) — a Matrix-backed decentralized comment system.

> **Status: Preview — usable for dogfooding, public API not yet stable.** The browser client is functional against `https://comments.curious.host`, but the `<cumments-comments>` attributes/events are still preview and may change before `1.0`.

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
<script type="module" src="https://cumments-web.curious.host/0.1.0/cumments-web.js"></script>
<!-- Preview channel (mutable, tracks latest tag) -->
<script type="module" src="https://cumments-web.curious.host/latest/cumments-web.js"></script>
```

**Local development:**

```bash
pnpm install
pnpm dev      # Vite dev server for demo/index.html
pnpm build    # emits dist/cumments-web.js + assets/pow.worker-*.js
```

See [CDN Distribution](./docs/cdn.md) for versioning and worker co-location guarantees.

## Usage

```html
<cumments-comments
  endpoint="https://comments.curious.host"
  site-id="my-blog"
  page-slug="hello-world"
  lang="zh-Hans"
></cumments-comments>
```

**Attributes:**

| Attribute | Required | Description |
|---|---|---|
| `endpoint` | yes | API root, e.g. `https://comments.curious.host` |
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
* **Identity capsule** — a compact capsule shows the current identity. Identity management (switch, import/export, avatar, display name) is transient: capsule → popover (`role="dialog"`, non-modal) → dialog for security-sensitive actions.
* **Collapsed composer** — `isCollapsed` when unfocused and empty (`!focused && !draft && !replyToId && !pending* && !uploading`). Focus, draft content, reply, or any pending attachment expands it.
* **Progressive disclosure** — secondary tools (Attach, Location, Sticker, Post) are subordinate to the main input. At `<480px` the tools row wraps and uses icon-only labels without losing accessible names; the input remains the dominant control.
* **Reply workflow** — `Reply` (primary action) sets `replyToId` on the editor; the composer shows reply context with a cancel control. Submitting includes `replyToId` and thread-root derivation.
* **Reaction picker** — persistent reaction summary with a `+` trigger opens a transient picker (`role="dialog"`, non-modal). Single-transient coordination via `openKey`; Escape and focus return are handled.
* **Sticker / media / location** — selecting a sticker, uploading media, or sharing location creates a pending attachment (`pendingSticker` / `pendingMedia` / `pendingLocation`) with a compact preview and remove control. Nothing submits until the user explicitly presses **Post comment**. All three pending states are explicit composer attachments and are included in `cumments:submit` together with `content` / `replyToId` / `displayName`.
* **Comment actions** — each comment exposes `Reply` and `⋯` (menu). The `⋯` menu contains `Edit`, `Copy link`, and `Delete` (owner-only). `Delete` uses a modal confirmation dialog with focus trapping; `Copy link` writes the comment URL via `navigator.clipboard`.
* **Dialogs and pickers** — transient surfaces stay inside the component `ShadowRoot`, use appropriate `dialog` / `menu` semantics, support `Escape`, and restore focus to the trigger. No portal outside the shadow tree.

## Boundaries

```
cumments (backend)  ── HTTP API v1 ──►  cumments-web  ── integration ──►  Zola / Hugo / Astro / custom sites
```

* `cumments` owns domain, HTTP API, Matrix integration, persistence, projection, auth.
* `cumments-web` owns API client, browser identity, request signing, Proof-of-Work, comments/replies/reactions/polls, pagination, SSE/realtime, media/avatar, client state, UI and the final Web Component.
* Static-site generators are consumers, not dependencies. Do not put Zola integration into `cumments`.

Internal research and the phased implementation plan live in `misc/design/` (git-ignored, local only). `docs/` holds user-facing documentation.

## API Contract

`cumments-web` depends on the **Cumments API contract**, not a specific server git tag:

```
cumments-web 0.5.x  supports Cumments API v1
cumments-web 1.x    supports Cumments API v2
```

Compatible extensions (new optional request/response fields, new endpoints) do not break `v1` clients. Breaking changes are defined as: an old client operating per the documented contract no longer works against the new server.

OpenAPI contract lives in the backend repo at `docs/public/openapi.yaml` (OpenAPI 3.2.0). It is the canonical source for request/response types.

## Distribution (Preview 0.x)

Browser artifacts are versioned and distributed via HTTPS CDN (GitHub Pages):

* Immutable version: `https://cumments-web.curious.host/0.1.0/cumments-web.js`
* Preview channel: `https://cumments-web.curious.host/latest/cumments-web.js` (mutable, tracks latest tag)

```html
<!-- Pinned, reproducible -->
<script type="module" src="https://cumments-web.curious.host/0.1.0/cumments-web.js"></script>
<!-- Preview / dogfooding (may contain breaking changes) -->
<script type="module" src="https://cumments-web.curious.host/latest/cumments-web.js"></script>
<cumments-comments endpoint="https://comments.curious.host" site-id="my-blog" page-slug="hello-world" lang="zh-Hans"></cumments-comments>
```

`0.x` allows breaking changes; `latest` is a moving alias. For reproducible deploys, pin a version. See [CDN Distribution](./docs/cdn.md).

## Project Goals (priority order)

```
API correctness → Identity correctness → Security correctness → Realtime correctness → State model → Usable UI → Beautiful UI → Theming/integrations
```

## Development

Prerequisites: [devenv](https://devenv.sh/) (provides Node.js 24 + pnpm + nixd). Backend checkout is expected at `../cumments` for local contract reference (`docs/public/openapi.yaml`).

```bash
# enter dev shell (direnv does this automatically)
devenv shell

# install dependencies
pnpm install

# dev demo that talks to a real backend (default https://comments.curious.host for test-blog/hello-world)
pnpm dev

# quality gates (all green on main)
pnpm lint       # biome check .
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run --passWithNoTests (45 files / 343 tests)
pnpm build      # vite build (ESM, gzip ~50k)
```

Configure the demo via the settings drawer (`api`, `site_id`, `slug`). The demo requires a registered site (`cumments sites register --site-id <id>` or `POST /api/v1/sites`).

## License

MIT — same as `cumments`.
