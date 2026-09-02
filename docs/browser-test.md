# Native WebMCP browser test

1. Use Chrome 149 or newer.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Set the flag to **Enabled** and relaunch Chrome.
4. Open https://repair-relay-webmcp.ottermode.chatgpt.site.
5. Confirm the startup search shows real Open Food Facts products, product links, and a current fetch timestamp.
6. Open DevTools → Application → WebMCP, or install the Model Context Tool Inspector extension.
7. Confirm these eight tools are registered:
   - `search_products`
   - `lookup_barcode`
   - `record_package_check`
   - `compare_products`
   - `stage_verified_choice`
   - `request_human_decision`
   - `get_workspace_snapshot`
   - `get_approved_choice`
8. Confirm `search_products` is described exactly as `Search the product catalog`.
9. Ask: “Search the live catalog for oat cereal, compare the most complete records, then stage one choice and tell me exactly what to verify on the package.”
10. Confirm the page updates after each tool call and the staged choice remains unapproved.
11. Record matching barcode and ingredients checks from a physical package (or explicitly state the values you are simulating for a demo).
12. Confirm the agent still cannot approve. Use the visible checkbox and button yourself.
13. Call `get_approved_choice` and confirm approval is now readable.

Automated release journey:

```bash
npm install
npm run test:live
npm run test:browser
```

The automated browser test launches Chromium with WebMCP feature flags, captures tool registration, and uses a controlled Open Food Facts-shaped response so UI lifecycle failures are deterministic. `npm run test:live` independently proves the production API path. It does not misrepresent the automated harness as a manual inspection of `chrome://flags`.
