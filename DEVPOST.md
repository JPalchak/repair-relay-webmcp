# Devpost submission copy

## Title

Label Relay

## Tagline

The agent finds the food record. The person holding the package confirms—or disproves—it.

## URLs

- Live application: https://repair-relay-webmcp.ottermode.chatgpt.site
- Public source: https://github.com/JPalchak/repair-relay-webmcp
- Public YouTube demo: **not yet published; required before submission**

## Inspiration

Allergy-aware households and caregivers increasingly use browser agents to compare packaged foods. Public product databases make that search possible at scale, but they are community-contributed and can be incomplete, stale, or tied to another package revision. The missing product is not another catalog chatbot. It is a trustworthy relay between agent-scale search and the package in a person’s hand.

## What it does

Label Relay searches live Open Food Facts records, shows provenance and freshness, compares record quality, and lets an agent stage one candidate. When the person tells the agent what they read on the package, the agent can relay the statement—but it appears as **pending human confirmation** and clears nothing. The person must confirm or reject that exact statement in the visible page.

A confirmed match unlocks a source-backed, copyable label summary for continued ingredient, allergen, or dietary-screening assistance. A confirmed mismatch does the opposite: it blocks approval, revokes any prior approval, labels the community record wrong for this package, and exposes the official Open Food Facts correction form for the exact barcode.

Label Relay records a human attestation. It does not claim to see, authenticate, or independently verify the physical package.

## Why this is a strong fit for WebMCP

This task splits essential context between the open web and the physical world. An agent can search and compare records quickly, preserve source provenance, and keep the shared state organized. It cannot see the package. The person can read the barcode and current ingredient panel, but should not have to manually coordinate catalog data, missing fields, agent context, and correction workflows.

WebMCP lets both participants operate on one visible workspace. Typed tool calls update the same result board, attestation lane, staged record, mismatch verdict, and approved summary the person sees. The collaboration would be brittle through screenshot-and-click automation and confusing through a separate backend conversation.

## How it creates a better user experience

- The default path starts with a real US retail barcode instead of unfamiliar international search results.
- English ingredient text is preferred when Open Food Facts provides it.
- Agent-relayed statements are visibly pending rather than falsely reported as verified.
- One trusted click confirms or rejects each specific statement.
- Approval has a practical downstream consequence: a provenance-rich verified-label summary becomes visible, copyable, and agent-readable.
- Mismatch is a first-class result, not a dead log entry.
- A failed or non-JSON upstream response produces a readable error and a visible retry control.
- Every product links directly to Open Food Facts and shows retrieval and upstream freshness.

## What people and agents can do together that was difficult before

A judge can ask the browser agent to look up barcode `030000010402`, stage the record, and relay that the barcode and “Whole Grain Rolled Oats” text match the package. The agent performs the live lookup and creates two pending attestations. The person confirms those statements in the page. The agent can then read the approved summary and continue a dietary-screening conversation without losing which facts came from Open Food Facts and which were attested by the person.

If the package instead lists an extra ingredient, the person confirms a mismatch. The application revokes the record’s approved status and opens the exact Open Food Facts correction path. The human contribution materially changes what the agent is allowed to use.

## How WebMCP was implemented

The static JavaScript application uses the imperative WebMCP API. The current `document.modelContext` path remains the preferred production registration; an earlier `navigator.modelContext` preview fallback is supported without installing a fake model context.

The executable registration in `src/webmcp.js` is:

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

Eight focused tools share the same store and rendering layer as the human interface:

- `search_products`
- `lookup_barcode`
- `record_package_check`
- `compare_products`
- `stage_verified_choice`
- `request_human_decision`
- `get_workspace_snapshot`
- `get_approved_choice`

Schemas are closed, inputs are revalidated, external and relayed content is marked untrusted, and outputs are compacted structurally so they remain valid JSON. No tool can confirm a person’s statement or approve on their behalf.

## Live data integrity

Text search calls the production US Open Food Facts search endpoint. Barcode lookup calls the production v3.6 endpoint. There is no fixture fallback in the application path. `npm run test:live` independently requires both endpoints to pass after bounded retries; one successful probe can no longer hide failure of the other.

## Testing

The project includes domain, tool-contract, malformed-input, mismatch, re-approval, output-budget, non-JSON-upstream, browser-side-effect, and live-data checks.

A deterministic browser journey proves the complete UI relay. A separate native browser run in Chromium 144’s actual WebMCP preview surface registered all eight tools and executed the pending-attestation flow with the production client and controlled upstream data. Current Chrome 149+ and ChatGPT in-app-browser verification on the exact public origin must still be completed before claiming final native deployment coverage.

## Challenges

The hardest product decision was separating “the agent relayed what the person said” from “the person confirmed that statement.” Treating those as the same event made the tool appear successful while the visible requirements remained blocked. The corrected flow makes the trust transition explicit and judge-visible.

## What comes next

Camera-assisted barcode entry and optional package-photo evidence could reduce typing, but they should not erase the same confirmation and provenance boundary. The immediate submission blocker is publishing the required narrated YouTube demo and entering its public URL.
