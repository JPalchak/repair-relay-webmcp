# Label Relay

> A browser agent finds live food records; the person holding the package confirms—or disproves—the exact record before it is used for ingredient, allergen, or dietary screening.

- **Live application:** https://repair-relay-webmcp.ottermode.chatgpt.site
- **Public repository:** https://github.com/JPalchak/repair-relay-webmcp
- **Demo video:** not yet published; a public YouTube URL remains a manual submission blocker.
- **License:** MIT for the application. Open Food Facts data is ODbL; product images are CC BY-SA and packaging may carry other rights.

## Judge this in 90 seconds

1. Open the live application in ChatGPT’s in-app browser, or in Chrome with `chrome://flags/#enable-webmcp-testing` enabled.
2. Give the browser agent this prompt:

   > Look up barcode 030000010402, stage the record, and relay that I said the barcode and “Whole Grain Rolled Oats” ingredients match my package. Ask me to confirm each relayed statement before treating it as verified.

3. Watch two blue **pending attestation** cards appear. The tool reports that neither statement counts yet.
4. Click **Confirm I said this** on each card. The required barcode and ingredients checks clear only after those trusted page actions.
5. Check the visible consent box and approve the staged match. A reusable, provenance-rich label summary appears in the page and becomes available through `get_approved_choice`.
6. To see the more important failure path, add a confirmed ingredients mismatch. Approval is revoked, the record is blocked for this package, and the page exposes the official Open Food Facts correction form.

The person is not reduced to approving work the agent could do alone. The agent can search and organize community data at scale, but it cannot see the package. The person can attest to what they read, but should not have to manually reconcile records, provenance, missing fields, and downstream context.

## Audience and use case

Label Relay is for allergy-aware households, caregivers, and other people who use a browser agent to compare packaged foods but need the current package—not a community database—to remain authoritative.

The application does **not** authenticate the physical object. A person’s confirmation is an attestation, not proof that they read the package. Label Relay preserves that distinction in the UI, tool output, activity history, and approved summary.

## Why WebMCP materially improves the product

Without WebMCP, an agent must scrape cards or ask the person to paste product records into chat. That creates two copies of the task and makes the confirmation boundary difficult to audit.

With WebMCP:

- agent calls update the same visible result board and verification workspace the person sees;
- agent-relayed package statements arrive as pending attestations, not as trusted facts;
- a trusted human click converts a specific relayed statement into confirmed evidence;
- a confirmed mismatch changes the product outcome and exposes a correction path;
- approval unlocks a useful verified-label summary for continued ingredient, allergen, or dietary-screening assistance;
- later contradictory evidence revokes the earlier approval.

## Live data

`src/live-catalog.js` makes production requests to Open Food Facts:

- US-scoped text search uses `https://us.openfoodfacts.org/cgi/search.pl` so the default judge path favors products reported as sold in the United States.
- Worldwide barcode lookup uses the current v3.6 product endpoint.
- English ingredient text is requested and preferred when available.
- Open Food Facts’ product completeness value is used when present; a clearly bounded field-availability fallback is used only when the upstream field is absent.
- Every normalized record includes a direct source URL, fetch timestamp, upstream modification time, and missing-data indicators.
- HTTP 429/503, timeouts, non-JSON 200 responses, and no-result states remain distinct and visible.
- There is no fixture or static-product fallback in the deployed application path.

`npm run test:live` now requires **both** the US text-search probe and the worldwide barcode probe to pass after bounded retries. A single surviving endpoint no longer makes the live-data job green.

## Human attestation and mismatch handling

`record_package_check` is intentionally not a trust shortcut. When an agent relays “the person says this matches,” the tool creates:

```json
{
  "pendingHumanConfirmation": true,
  "requiredAction": "The person must confirm or reject this relayed statement in the visible page before it counts as package verification."
}
```

Only the visible **Confirm I said this** control can clear a required check. The person can reject the statement instead.

A confirmed mismatch is consequential:

- the staged record enters `record_mismatch`;
- approval is disabled;
- any prior approval is withdrawn;
- `get_approved_choice` stops returning an approved summary;
- the official Open Food Facts edit URL is displayed for the exact barcode.

## Approval consequence

Human approval does more than change a badge. It unlocks a structured `verifiedLabelSummary` containing:

- the exact product and barcode;
- source URL, retrieval time, and upstream modification time;
- ingredient and recorded-allergen fields;
- the package attestations the person confirmed;
- explicit limitations distinguishing attestation from independent visual proof;
- supported next uses for continued browser-agent assistance.

The same summary is visible and copyable in the page and readable through the WebMCP tool.

## WebMCP implementation

The production application uses the current imperative API and keeps the challenge-required registration executable in `src/webmcp.js`:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  title: requiredSearchTool.title,
  inputSchema: requiredSearchTool.inputSchema,
  annotations: requiredSearchTool.annotations,
  execute: async (input, options = { signal: controller.signal }) => requiredSearchTool.execute(input, options)
}, { signal: controller.signal });
```

The current `document.modelContext` API is preferred. A `navigator.modelContext` fallback supports earlier Chrome preview builds without replacing or simulating the browser API.

| Tool | Visible/shared effect |
|---|---|
| `search_products` | Searches US-scoped live records and replaces the visible result board |
| `lookup_barcode` | Fetches a worldwide v3.6 barcode record |
| `record_package_check` | Adds an agent-relayed statement as pending human confirmation |
| `compare_products` | Shows source completeness, freshness, allergens, and nutrition side by side |
| `stage_verified_choice` | Stages one record and exposes required checks, pending attestations, or mismatch status |
| `request_human_decision` | Opens the visible checkpoint without confirming or approving anything |
| `get_workspace_snapshot` | Reads compact shared state, including pending confirmation IDs and mismatch status |
| `get_approved_choice` | Returns the verified-label summary only after visible human approval |

All input schemas are closed with `additionalProperties: false`; inputs are revalidated at runtime; external and relayed content is marked untrusted; output is compacted structurally and is always valid JSON. No agent tool can confirm a human attestation, approve a record, purchase anything, or make a medical decision.

## Run locally

Requirements: Node.js 20+.

```bash
git clone https://github.com/JPalchak/repair-relay-webmcp.git
cd repair-relay-webmcp
npm install
npm run dev
```

## Verification

```bash
npm run check          # unit, contract, eval, and repository checks
npm run test:live      # both real Open Food Facts probes must pass
npm run test:browser   # deterministic DOM + WebMCP callback lifecycle
npm run build
```

The deterministic browser test intentionally uses API-shaped responses and a registration capture layer so edge cases are repeatable. It is not presented as native browser evidence.

A separate native run was completed against Chromium 144’s actual preview `navigator.modelContext`/`navigator.modelContextTesting` surface using the production client and deterministic upstream responses. It registered all eight tools and executed the pending-attestation-to-approved-summary path. That proves native browser protocol behavior in the available preview build, but it does **not** prove current Chrome 149+ or the public deployment. See `TESTED_AGENTS.md` and `docs/browser-test.md` for the exact claim boundary and the remaining public-origin test.

## Security and privacy

- Only an explicit search phrase or barcode is sent to Open Food Facts.
- External strings render through DOM text nodes, not unsanitized HTML.
- Product images are restricted to the official Open Food Facts image host.
- Tool outputs never truncate serialized JSON mid-token.
- The app has no accounts, analytics, payments, or write access to Open Food Facts.
- The correction link opens Open Food Facts’ own edit workflow; Label Relay never submits a correction itself.

See `SECURITY.md` and `docs/threat-model.md` for the trust model.
