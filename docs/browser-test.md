# Native WebMCP browser test

## Current public-origin release test

1. Use Chrome 149 or newer.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Set the flag to **Enabled** and relaunch Chrome.
4. Open https://repair-relay-webmcp.ottermode.chatgpt.site.
5. Confirm the startup barcode lookup shows a current Open Food Facts record, direct source link, and fetch timestamp.
6. Open DevTools → Application → WebMCP.
7. Confirm these eight tools are registered exactly once:
   - `search_products`
   - `lookup_barcode`
   - `record_package_check`
   - `compare_products`
   - `stage_verified_choice`
   - `request_human_decision`
   - `get_workspace_snapshot`
   - `get_approved_choice`
8. Confirm `search_products` is described exactly as `Search the product catalog`.
9. Confirm all schemas parse, all are closed with `additionalProperties: false`, and external/relayed-data tools carry `untrustedContentHint`.
10. Invoke `lookup_barcode` with:

```json
{ "barcode": "030000010402" }
```

11. Invoke `stage_verified_choice` with the returned product ID.
12. Invoke `record_package_check` twice—once for `barcode_match`, once for `ingredients_match`. Confirm each output says `pendingHumanConfirmation: true` and the page shows **Confirm I said this**.
13. Confirm the staged record still lists both checks as required before any human action.
14. Use the visible confirmation buttons. Confirm the requirements clear only after those trusted clicks.
15. Approve with the visible consent control and confirm the verified-label summary appears.
16. Invoke `get_approved_choice` and compare its structured result with the visible summary.
17. Add a confirmed ingredients mismatch. Confirm approval is revoked, the staged status becomes `record_mismatch`, and the Open Food Facts correction link includes the exact barcode.
18. Manually test missing input, malformed barcode, unknown product ID, duplicate comparison IDs, request-before-staging, cancellation, and an upstream failure.
19. Repeat the core flow in ChatGPT’s in-app browser.

## Automated checks

```bash
npm install
npm run check
npm run test:live
npm run test:browser
```

- `test:browser` is deliberately deterministic and uses a registration capture layer plus API-shaped data. It validates callbacks, visible side effects, trust transitions, mismatch handling, and responsive behavior. It is not labelled native.
- `test:live` requires both the US text-search and worldwide v3.6 barcode paths to pass after bounded retries.
- A separate local native run used Chromium 144’s actual `navigator.modelContext` preview API with the production client and deterministic upstream responses. See `TESTED_AGENTS.md` and `docs/evidence/judge-relay-browser.json`.

Do not claim final native deployment coverage until the current public-origin test above passes in Chrome 149+ and ChatGPT’s in-app browser.
