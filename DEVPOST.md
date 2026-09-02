# Devpost submission copy

## Title

Label Relay

## Tagline

Agents search what the world knows. People verify what is in their hands.

## URLs

- Live: https://repair-relay-webmcp.ottermode.chatgpt.site
- Source: https://github.com/JPalchak/repair-relay-webmcp

## Inspiration

Product databases are valuable precisely because no person can search millions of records unaided. They are risky to treat as ground truth because community records can be stale, incomplete, or tied to a different package revision. The missing piece is not another catalog chatbot. It is a structured relay between agent-scale search and human physical verification.

## What it does

Label Relay searches live Open Food Facts production data, exposes provenance and freshness, compares incomplete records, and lets an agent stage a candidate. The person holding the package verifies the barcode and ingredients. Only then can the visible human-only approval control be used. The approved choice becomes readable to the agent for continued assistance.

## Why WebMCP

WebMCP turns the page's real client-side search, comparison, evidence, and staging logic into typed browser tools. Agent calls update the same interface the person sees. This avoids brittle DOM automation and avoids a duplicate backend state that the page cannot see. The agent gets a reliable capability contract; the person keeps context, history, and control.

Together they can do something that was previously awkward: reason across many live records while continuously reconciling them with the exact physical object. Neither the database nor the model silently wins over reality.

## Implementation

The static JavaScript app uses `document.modelContext.registerTool()` to register eight imperative tools with closed schemas, bounded output, cancellation, and `readOnlyHint` / `untrustedContentHint` annotations. `search_products` performs an explicit CORS request to Open Food Facts full-text search; `lookup_barcode` uses v3.6. Every response includes source and fetch time. A five-minute cache respects the upstream search limit, and errors never fall back to dummy data.

The required source registration is present verbatim:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  inputSchema: requiredSearchTool.inputSchema,
  execute: async (input, options) => requiredSearchTool.execute(input, options)
}, { signal: controller.signal });
```

The tool surface is `search_products`, `lookup_barcode`, `record_package_check`, `compare_products`, `stage_verified_choice`, `request_human_decision`, `get_workspace_snapshot`, and `get_approved_choice`. There is deliberately no approval, purchase, checkout, or medical-decision tool.

## Better user experience

The interface makes live status, upstream freshness, missing fields, recorded allergens, ingredient text, and package-check outcomes visible. Agent work appears immediately in the shared page rather than disappearing into chat. The person can challenge a result, supply a mismatch, or withhold approval without losing the agent's analysis.

## Development process

A recurring Luna subagent reviewed the concept, live API path, security boundary, implementation, and release evidence during development. It returned suggestions to the main development thread and drove the removal of every user-facing Luna surface. Luna is not a product feature.

## Testing

The project includes deterministic unit and tool-contract tests, evaluation scenarios, a real Open Food Facts smoke probe with retries, a repository-compliance gate, and a Chromium journey that validates WebMCP registration, real network data, visible physical checks, trusted human approval, and approved readback.

## Challenges

Open Food Facts v3 is current but does not yet support full-text search. We use the documented legacy full-text search endpoint only for explicit searches and use v3.6 for barcode lookup. We also had to design for community-data uncertainty and strict rate limits without hiding errors behind fixtures.

## What's next

Potential extensions include camera-assisted barcode input, opt-in locale filtering, and contribution links for correcting Open Food Facts records. The human verification gate and read-only external API posture would remain.
