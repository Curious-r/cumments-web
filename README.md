# cumments-web

Official Web Client for [Cumments](https://github.com/Curious-r/cumments) — a Matrix-backed decentralized comment system.

> **Status: Preview — usable for dogfooding, public API not yet stable.** `M1-M6.8 + page-slug + BCP47 lang` (0.1.4, ae0929c), `TS7` baseline, `Cumments API v1` contract (`6eaa9b64`). The browser client is functional against `https://comments.curious.host` (`0.28.1`), but the `<cumments-comments>` attributes/events are still preview and may change before `1.0`.

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

`0.x` allows breaking changes; `latest` is a moving alias. For reproducible deploys, pin a version. See [CDN Distribution](./cdn.md).

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
pnpm lint       # Biome
pnpm typecheck  # TS7 strict
pnpm test       # Vitest 56 tests
pnpm build      # Vite 8 ESM
```

Configure the demo via the settings drawer (`api`, `site_id`, `slug`). The demo requires a registered site (`cumments sites register --site-id <id>` or `POST /api/v1/sites`).

## Design Direction

Public integration surface will be a Web Component, e.g.:

```html
<cumments-comments
  endpoint="https://comments.example.com"
  site-id="my-blog"
  page-slug="hello-world"
  lang="zh-Hans">
</cumments-comments>
```

`lang` is a BCP 47 tag (e.g. `zh-Hans`, `en`, `en-GB`). It resolves to the supported UI locales `zh-Hans` / `en` (fallback `en`). Web Components keep `cumments-web` framework-agnostic for Zola/Hugo/Astro/custom sites. The standard Custom Element `<cumments-comments>` is the confirmed public surface (Lit 3 is an internal implementation detail, not a consumer dependency).

## License

MIT — same as `cumments`.
