# Tested browser-agent behavior

The release harness launches Chromium with `--enable-features=WebMCP,WebMCPTesting`, injects a minimal `document.modelContext` capture layer and API-shaped responses for all three data sources, then uses the app’s real tool definitions, callbacks, DOM, and trusted user clicks. A separate `npm run test:live` job probes the real production APIs.

Verified in the browser journey:

- exactly ten closed-schema tools register;
- `search_products` has the exact required description;
- no resolve, approve, discard, purchase, checkout, or development tool exists;
- `sweep_shelf` attaches a live-shaped notice to the item and flags the barcode match in the DOM;
- `get_recall_details` returns the full lot text;
- `request_package_reading` shows the highlighted ask block and the page-level banner;
- `assess_item` is rejected before the person records a reading;
- a trusted reading typed in the card unlocks the assessment, which renders on the card;
- a trusted Discard click is required before `get_shelf` reports a resolution.

The capture layer proves application integration deterministically. Judges should also run the native Chrome procedure in `docs/browser-test.md` with `chrome://flags/#enable-webmcp-testing` enabled, or open the live URL in ChatGPT’s in-app browser.
