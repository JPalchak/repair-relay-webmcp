# Architecture

```text
Open Food Facts production API
           ↓ live, untrusted records
src/live-catalog.js → store → renderer → visible shared workspace
                           ↑
              WebMCP tool callbacks
                           ↑
                    browser agent
```

`search_products` uses explicit full-text search; `lookup_barcode` uses the v3.6 product endpoint. Normalization accepts a bounded field set, restricts image hosts, records source/fetch/modified times, and preserves missing data rather than inventing values.

The store is the single state source for UI actions and WebMCP actions. Agent calls update the visible page. The approval reducer requires both completed physical checks and `{ actor: "human", confirmed: true }`; `src/app.js` supplies that authorization only after a trusted click. The debug surface and WebMCP surface expose no approval method.

There is no server-side state. The deployment is static and all state resets on reload.
