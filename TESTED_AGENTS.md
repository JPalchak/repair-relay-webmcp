# Tested clients and agent surfaces

## Automated Chromium WebMCP contract harness

The public deployment was tested in Chromium with WebMCP feature flags enabled and a deterministic `document.modelContext` registration harness injected before page load. This validates the page's actual tool definitions, callbacks, state mutations, DOM rendering, and human-only approval flow without depending on a particular experimental browser-agent UI.

The smoke test verifies:

- eight WebMCP tools register successfully;
- `search_products` has the exact required description;
- every schema is closed;
- physical evidence materially changes the ranking;
- the staged plan remains unapproved;
- no approval or authorization tool is exposed;
- the human checkpoint opens visibly;
- a trusted UI action records human approval;
- `get_approved_plan` becomes readable only afterward;
- Luna returns 30/30;
- the page emits no runtime errors.

## Manual judge clients

The repository includes explicit procedures for:

- ChatGPT's in-app browser;
- Google Chrome with `chrome://flags/#enable-webmcp-testing` enabled;
- Chrome DevTools → Application → WebMCP inspection.

No claim is made that the automated harness is the browser vendor's native WebMCP implementation. It exercises the standards-shaped page contract and the real application workflow while the experimental client surface remains browser-version dependent.
