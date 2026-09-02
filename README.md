# Recall Relay

**The recall notice knows the lot code. Only you can see the lid.**

Recall Relay is a WebMCP workspace for the one shopping task nobody automates: checking whether the things *already in your home* have been recalled. Your agent sweeps live FDA and CPSC recall notices for everything on a shared shelf and turns dense lot-code text into “look here” instructions. You read what is actually printed on the package. The agent matches the reading against the notice. You decide what to do with the item.

- Live app: https://repair-relay-webmcp.ottermode.chatgpt.site
- Public source: https://github.com/JPalchak/repair-relay-webmcp
- License: MIT (application source). Data: openFDA (public domain, unvalidated), CPSC recalls, Open Food Facts (ODbL).

## Why this use case is a strong fit for WebMCP

Recall checking has an asymmetry that neither a person nor an agent can close alone:

| Only the person can | Only an agent will actually do |
|---|---|
| Know what is physically in the pantry, medicine cabinet, and nursery | Query three government databases for every item, with brand, firm, and product-name variants |
| Read the lot code, best-by date, UPC, or model number off the package | Parse notices like “Lot codes 1274425 through 2140425 printed beneath the best-by date” into a concrete instruction |
| Decide to keep, discard, return, or contact the firm | Compare a reading against the notice range and explain the match, including uncertainty |

WebMCP is the right primitive because the collaboration happens *on the page*. The shelf, the candidates, the reading requests, the readings, the assessment, and the decision are one shared state. Every agent tool call updates the interface the person is looking at; every human action (typing a lot code, clicking Discard) becomes readable to the agent through `get_shelf`. There is no scraping, no duplicated backend state, and no copy-pasting between chat and page.

## How it creates a better user experience

- **The person never reads a recall database.** They see, per item, a status pill, the candidate notices with the full code text in a monospace block, and a highlighted card that says exactly what to read and where.
- **The agent never guesses at a physical object.** `assess_item` rejects `likely_affected` / `likely_not_affected` until a package reading exists. It can ask (`request_package_reading`), wait, and relay what the person says (`record_package_reading`), but it cannot invent a lot code.
- **Provenance is visible.** Every card shows the query used, the sources checked, each source’s status, and the fetch time. Failures are shown as failures. There is no fixture fallback.
- **Barcode digits are matched deterministically.** If an item came from the live catalog, its EAN-13 / UPC-A digits are compared against contiguous digit runs in the notice text (notices print UPCs with spaces, so separators are collapsed between adjacent digits but never across words) and the card is flagged in red before any reasoning happens.
- **Assessments cannot outlive their evidence.** If a later search attaches new candidates or a new reading is recorded, the existing assessment is marked outdated on the card and in `get_shelf` until the agent reassesses.

## What people and agents can do together that was difficult before

Before: recall notices live in three databases with three query languages; matching one requires reading code ranges against a physical package; and a chat assistant cannot see the package or the pantry. People either never check or check one product after seeing a news story.

With Recall Relay: a person lists a shelf in plain words or barcodes (or the agent does it from the conversation), the agent sweeps every item across live FDA food, FDA drug, and CPSC data in one call, opens the notices that matter, and hands back a specific physical task. The person does thirty seconds of reading. The agent does the comparison and shows its reasoning. The person makes the call, and that decision becomes agent-readable so the conversation can continue (“remind me to contact the firm”). A full multi-item sweep-to-decision loop takes minutes instead of never happening.

## How WebMCP is implemented

The app is static JavaScript using the imperative API. The challenge-required registration is executable source in `src/webmcp.js`:

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

Ten tools, all with closed JSON Schemas (`additionalProperties: false`), runtime re-validation, `AbortSignal` support, outputs bounded to 1,500 characters, and descriptions within Chrome’s recommended budgets:

| Tool | Role in the loop | Annotations |
|---|---|---|
| `search_products` | Live Open Food Facts search (required tool, exact description) | untrusted |
| `lookup_barcode` | Open Food Facts v3.6 record for a package barcode | untrusted |
| `add_shelf_item` | Put a catalog product or a described item on the shared shelf | untrusted |
| `search_recalls` | Live openFDA food/drug enforcement + CPSC recall search; attach to an item | untrusted |
| `sweep_shelf` | Search every unresolved item with a source-appropriate scope; flag barcode matches | untrusted |
| `get_recall_details` | Full lot/date/model, distribution, and remedy text for one candidate | read-only, untrusted |
| `request_package_reading` | Ask the person to read specific fields, with where-to-look text; highlights the card | — |
| `record_package_reading` | Relay a value the person said in chat, labelled as relayed | untrusted |
| `assess_item` | Post a verdict with reasoning; match verdicts require a reading | — |
| `get_shelf` | Compact shared state, including readings the person still owes and their decisions | read-only, untrusted |

Deliberately absent: any tool that resolves an item (keep, discard, return, contact firm), removes an item, purchases, or contacts anyone. Resolution is human-only: it requires a trusted click in the page and `{ actor: "human", confirmed: true }` in the reducer.

`src/live-recalls.js` queries `api.fda.gov/{food,drug}/enforcement.json` (24-month window, `NOT_FOUND` treated as zero results, 429 surfaced as a rate limit) and `saferproducts.gov/RestWebServices/Recall` in parallel; a single failing source is reported per-source, and only a total failure throws. `src/live-catalog.js` queries Open Food Facts. All three services send `Access-Control-Allow-Origin: *`, so the page needs no server.

## Run locally

Requirements: Node.js 20+ and Chrome 149+ (or ChatGPT’s in-app browser).

```bash
git clone https://github.com/JPalchak/repair-relay-webmcp.git
cd repair-relay-webmcp
npm install
npm run dev
```

Enable native WebMCP in Chrome:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Set it to **Enabled** and relaunch.
3. Open the app and check **DevTools → Application → WebMCP** (ten tools should be listed).

Suggested prompt:

> Add the sample shelf items, sweep them for recalls, read the full notice for anything that matches, and tell me exactly where on each package to look and what lot codes to compare.

## Verification

```bash
npm run check          # unit tests, tool contracts, evals, repository gate
npm run test:live      # real Open Food Facts, openFDA, and CPSC requests
npm run test:browser   # Chromium: registration, sweep, reading gate, human decision
npm run build          # static dist/ for hosting
```

Unit and browser tests use API-shaped payloads (in `tests/fixtures.js`, never imported by the app) so the WebMCP/DOM lifecycle is deterministic. `test:live` separately proves the production sources respond and normalize. The browser journey proves: ten tools register with closed schemas; a sweep flags a barcode match; `assess_item` is rejected before a reading exists; a trusted reading unlocks it; the agent’s assessment renders; a trusted Discard click becomes readable through `get_shelf`.

## Deployment

The live URL is a ChatGPT Sites project (`.openai/hosting.json` points at `dist/`). To redeploy after changes: `npm run build`, then ask ChatGPT to redeploy the project’s saved version. The `dist/` folder is plain static files and also deploys unchanged to Netlify (`netlify.toml` included), Cloudflare Pages, Vercel, or GitHub Pages.

## Data and privacy

Recall Relay sends only your search terms, barcodes, and brand names to the three public APIs. It has no accounts, analytics, storage, or write access anywhere. State lives in the tab and resets on reload. openFDA’s own disclaimer applies: do not rely on it for medical decisions; results are unvalidated. Follow the official notice and the firm’s remedy. See `SECURITY.md`.

## Documentation

- `docs/architecture.md` — shared-state and live-data design
- `docs/browser-test.md` — native Chrome and automated browser journeys
- `docs/demo-script.md` — under-three-minute judge demo
- `docs/challenge-mapping.md` — requirement-to-evidence map
- `docs/threat-model.md` — risks and controls
- `docs/evaluation-rubric.md` — development review rubric
- `DEVPOST.md` — submission-ready project description
