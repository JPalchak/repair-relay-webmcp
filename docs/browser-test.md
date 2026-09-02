# Native WebMCP browser test

1. Use Chrome 149 or newer, or ChatGPT’s in-app browser.
2. In Chrome, open `chrome://flags/#enable-webmcp-testing`, set it to **Enabled**, and relaunch.
3. Open https://repair-relay-webmcp.ottermode.chatgpt.site.
4. Confirm the header pill reads “WebMCP ready · 10 tools”.
5. Open DevTools → Application → WebMCP and confirm these tools:
   `search_products`, `lookup_barcode`, `add_shelf_item`, `search_recalls`, `sweep_shelf`, `get_recall_details`, `request_package_reading`, `record_package_reading`, `assess_item`, `get_shelf`.
6. Confirm `search_products` is described exactly as `Search the product catalog`.
7. Click **Add a three-item sample shelf**, or ask the agent: “Add the sample shelf items, sweep them for recalls, read the full notice for anything that matches, and tell me exactly where on each package to look and what lot codes to compare.”
8. Confirm each card shows the query, sources, per-source status, and fetch time after the sweep, and that candidate notices expand to show the full code text.
9. When the agent calls `request_package_reading`, confirm the card is highlighted, the amber banner appears, and the form is prefilled with the requested field.
10. Ask the agent to assess the item *before* you type a reading. Confirm it reports that a package reading is required.
11. Type a value in the reading form (state the value you are simulating if you have no package) and ask the agent to assess again. Confirm the assessment appears on the card.
12. Confirm the agent cannot resolve the item. Click **Keep** or **Discard** yourself, then ask the agent to call `get_shelf` and confirm it reads your decision.

Automated release journey:

```bash
npm install
npm install --no-save playwright
npm run test:live
npm run test:browser
```

The automated browser test launches Chromium with WebMCP feature flags, captures tool registration, and uses API-shaped responses so lifecycle failures are deterministic. `npm run test:live` independently proves the production sources respond. Neither claims to replace a manual check with the Chrome flag enabled.
