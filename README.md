# Label Relay

Label Relay is a live-data WebMCP workspace where an agent searches the worldwide Open Food Facts catalog and a person verifies the physical product package before approving a choice.

- Live app: https://repair-relay-webmcp.ottermode.chatgpt.site
- Public source: https://github.com/JPalchak/repair-relay-webmcp
- License: MIT (application source); Open Food Facts data is ODbL and product images are CC BY-SA.

## Why this is a strong WebMCP use case

Food-product records are numerous, inconsistent, and frequently incomplete. An agent is good at searching, comparing, tracking provenance, and spotting missing fields across many live records. It cannot reliably know whether a community record matches the exact package in the person's hand. A person can read that barcode and current ingredients panel, but should not have to manually coordinate a product database, a browser, and an agent conversation.

WebMCP keeps both collaborators on the same page state. An agent calls typed tools to fetch live records, compare them, record user-supplied package checks, and stage one candidate. Each call updates the visible interface. The person supplies physical evidence and retains a human-only approval control that is intentionally absent from the tool surface.

Before this pattern, users had to paste catalog findings back and forth or let an agent scrape and click a human interface. Label Relay gives the agent a reliable contract without displacing the page, and gives the person a visible audit trail and decision boundary.

## Live data—not fixtures

`src/live-catalog.js` calls the production Open Food Facts service:

- Explicit text searches use the documented legacy full-text endpoint because Open Food Facts v3 does not yet expose full-text search.
- Barcode lookups use the current v3.6 product endpoint.
- Results include a source URL, fetch timestamp, upstream modification time, completeness indicator, recorded allergens, ingredients, Nutri-Score, and available nutrition fields.
- Search results are cached in memory for five minutes to respect the documented 10-searches/minute limit.
- API rate limits, timeouts, and upstream failures are shown honestly. There is no static fallback catalog.

Open Food Facts is community-contributed and does not guarantee accuracy or completeness. Label Relay therefore never treats a database record as the package label and makes this warning visible in the interface.

## WebMCP implementation

The application uses the imperative `document.modelContext.registerTool()` API with closed JSON Schemas, cancellation signals, bounded outputs, and security annotations. The exact challenge-required registration is executable source in `src/webmcp.js`:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  title: requiredSearchTool.title,
  inputSchema: requiredSearchTool.inputSchema,
  annotations: requiredSearchTool.annotations,
  execute: async (input, options) => requiredSearchTool.execute(input, options)
}, { signal: controller.signal });
```

| Tool | Shared effect |
|---|---|
| `search_products` | Fetches live Open Food Facts search results and replaces the visible board |
| `lookup_barcode` | Fetches the current v3.6 record for a physical barcode |
| `record_package_check` | Records a factual observation supplied from the package |
| `compare_products` | Shows side-by-side completeness, freshness, allergen, and nutrition fields |
| `stage_verified_choice` | Stages one live result and exposes checks still required |
| `request_human_decision` | Opens the visible human checkpoint without deciding |
| `get_workspace_snapshot` | Reads compact shared state |
| `get_approved_choice` | Reads a choice only after visible human approval |

External and human-supplied data is marked with `untrustedContentHint`. Read-only tools use `readOnlyHint`. Tool descriptions and outputs remain within Chrome's recommended character budgets. There is no approval, purchase, checkout, ingestion, or medical-decision tool.

## Run locally

Requirements: Node.js 20+ and Chrome with WebMCP testing enabled.

```bash
git clone https://github.com/JPalchak/repair-relay-webmcp.git
cd repair-relay-webmcp
npm install
npm run dev
```

Then open the printed local URL.

Enable native WebMCP for local development:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Set it to **Enabled**.
3. Relaunch Chrome.
4. Open Label Relay and inspect **Application → WebMCP** in DevTools, or use the Model Context Tool Inspector extension.

Suggested prompt:

> Search the live catalog for oat cereal, compare the most complete records, then stage one choice and tell me exactly what to verify on the package.

## Verification

```bash
npm run check          # unit, contracts, evals, repository checks
npm run test:live      # real production Open Food Facts request
npm run test:browser   # Chromium DOM + WebMCP lifecycle + live data journey
npm run build
```

Unit tests inject an API-shaped response to deterministically test edge cases. `test:live` separately proves the production API is reachable and returns normalized real records. The browser journey proves eight tools register, live provenance reaches the DOM, physical checks gate approval, a trusted click approves, and the agent can then read the approved choice.

## Evaluation-driven development

During development, a recurring Luna subagent reviews usefulness, originality, execution, thoughtful WebMCP use, security, and human-agent experience, then returns prioritized changes to the main development thread. Luna is a development reviewer—not an app panel, WebMCP tool, timer, or user-facing feature. Product-surface tests block any accidental Luna exposure.

## Data and privacy

Label Relay sends only the explicit search phrase or barcode to Open Food Facts. It has no accounts, analytics, payments, background tracking, or write access to the external database. See `SECURITY.md` for the trust model.

## Documentation

- `docs/architecture.md` — live-data and shared-state design
- `docs/browser-test.md` — native Chrome and automated browser journeys
- `docs/demo-script.md` — under-three-minute judge demo
- `docs/challenge-mapping.md` — requirement-to-evidence map
- `docs/evaluation-rubric.md` — development review rubric
- `DEVPOST.md` — submission-ready project description
