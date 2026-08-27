# Web Component — Preview Contract

`<cumments-comments>` is the confirmed public surface. Lit 3 is an internal detail.

```html
<script type="module" src="/cumments-web.js"></script>
<cumments-comments endpoint="https://comments.curious.host" site-id="my-blog" page-id="hello-world" per-page="20" lang="zh"></cumments-comments>
```

## Attributes (5, frozen for Preview)

| Attribute | Type | Required | Description |
|---|---|---|---|
| `endpoint` | `string` | yes | API root, e.g. `https://comments.curious.host` |
| `site-id` | `string` | yes | `siteId` |
| `page-id` | `string` | yes | `pageId` / `page_slug` |
| `per-page` | `number` | no | `1..100`, default `20` |
| `lang` | `"zh" \| "en"` | no | default `zh` |

Properties mirror attributes (`endpoint`, `siteId`, `pageId`, `perPage`, `lang`).

## Methods (Preview: 1)

* `reload(): Promise<void>` — re-fetches current page (`controller.refresh()`). `setIdentity` etc. remain internal via `ClientContext`.

## Events (Preview: none promised)

`cumments:ready / cumments:error / cumments:change` are deferred to `1.0`.

## CSS

* **Parts:** `wrap, header, list, comment, meta, body, reactions, reaction, pagination, input, button, editor, error`
* **Custom properties:** `--cumments-primary, --cumments-border, --cumments-bg, --cumments-text`
* `Tailwind` does not enter the bundle; demo may use it.

## Lifecycle

`connectedCallback → CommentController(ensureIdentity → list → SseClient.connect)` → `disconnectedCallback → sse.close + clearPendingPoll + store off`. `updated(endpoint/siteId/pageId/perPage)` resets `page=1` and re-inits.

## Browser Requirements

`ESM / Custom Elements / Shadow DOM / fetch(QUERY) / EventSource / Web Worker / WebCrypto Ed25519` in **secure context** (`https` / `localhost`). `file://` is not a production target. `http://192.168.x.x` should use `localhost` or `https`.
