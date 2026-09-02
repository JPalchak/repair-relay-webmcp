# Tested browser-agent behavior

The release harness launches Chromium with `--enable-features=WebMCP,WebMCPTesting`, injects a minimal `document.modelContext` capture layer and a controlled API-shaped response, then uses the app's real tool definitions, callbacks, DOM, and trusted user clicks. A separate `npm run test:live` job probes the real production API.

Verified:

- exactly eight closed-schema tools register;
- `search_products` has the exact required description;
- live Open Food Facts provenance and fetch time reach the page;
- no Luna, approval, purchase, or checkout tool exists;
- the agent can stage but cannot approve;
- two physical package checks unlock the visible consent control;
- the trusted human click is required before `get_approved_choice` returns an approved result.

The capture layer proves application integration and lifecycle deterministically. Judges should also run the native Chrome procedure in `docs/browser-test.md` with `chrome://flags/#enable-webmcp-testing` enabled.
