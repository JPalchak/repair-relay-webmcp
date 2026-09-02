# Architecture

```text
Open Food Facts ──┐                         ┌── browser agent (WebMCP tool calls)
openFDA food/drug ─┼─ src/live-*.js ─→ store ─→ renderer ─→ shared shelf on the page
CPSC recalls ─────┘        ↑                                    │
                           └──── person (forms, trusted clicks) ─┘
```

- `src/live-catalog.js` queries Open Food Facts (full-text search and v3.6 barcode lookup).
- `src/live-recalls.js` queries openFDA food and drug enforcement reports and CPSC recalls in parallel, normalizes both shapes into one candidate record (firm, product, reason, code text, dates, distribution, remedy, source link), and computes digits-only barcode matches.
- `src/engine.js` holds the domain rules: shelf items, candidate attachment, reading requests, readings, assessment gating, and human-only resolution.
- `src/store.js` is the single reducer for both human and agent actions; every event appends to the visible relay log.
- `src/tool-definitions.js` exposes ten narrow tools over the same store. `src/webmcp.js` registers them, with the required `search_products` literal first.
- `src/render.js` paints the whole state on every change with `textContent` only.

Agent tools can add items, search, attach candidates, request and relay readings, and post assessments. They cannot resolve or remove items; `src/app.js` supplies human authorization only after a trusted click. State is in-memory and resets on reload; there is no server.
