# cumments-web

Official Web Client for [Cumments](https://github.com/Curious-r/cumments) — a Matrix-backed decentralized comment system.

> **Status: Phase 0 — Research & Architecture.** No stable release yet. API follows `Cumments API v1` (`/api/v1`). Breaking changes are still possible before v1 stabilization.

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

# dev demo that talks to a real backend (default http://localhost:7931)
pnpm dev

# lint / typecheck / test (once tooling lands)
pnpm lint
pnpm typecheck
pnpm test
```

Configure the demo via the settings drawer (`api`, `site_id`, `slug`). The demo requires a registered site (`cumments sites register --site-id <id>` or `POST /api/v1/sites`).

## Design Direction

Public integration surface will be a Web Component, e.g.:

```html
<cumments-comments
  endpoint="https://comments.example.com"
  site-id="my-blog"
  page-id="hello-world">
</cumments-comments>
```

Web Components keep `cumments-web` framework-agnostic for Zola/Hugo/Astro/custom sites. The decision is not final — it is evaluated after the internal `API → Client → Domain State → UI` layers stabilize.

## License

MIT — same as `cumments`.
