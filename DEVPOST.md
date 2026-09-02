# Devpost submission copy

## Title

Recall Relay

## Tagline

Agents sweep the recall notices. People read the lids.

## URLs

- Live: https://repair-relay-webmcp.ottermode.chatgpt.site
- Source: https://github.com/JPalchak/repair-relay-webmcp

## Inspiration

Every agent demo helps you buy something. Nothing helps you with what you already own. Recalls are the clearest example: the FDA publishes enforcement reports with exact lot ranges, the CPSC publishes model numbers and sale dates, and almost nobody checks, because matching a notice to a jar means reading a database and then reading a lid. A chat assistant can do the first half. Only a person can do the second. WebMCP lets them do it on the same page.

## What it does

Recall Relay is a shared shelf. You add what is in your home by catalog search, barcode, or plain words. Your agent sweeps every item across live openFDA food and drug enforcement reports and CPSC recalls, attaches candidate notices to each card, and flags any notice whose text contains the item’s barcode digits. It opens the full notice, then asks you to read specific fields with a where-to-look instruction (“lot code beneath the best-by date on the lid; the recall covers 1274425 through 2140425”). You type what is printed. The agent posts an assessment with its reasoning. You click Keep, Discard, Return, or Contact firm. That decision is readable to the agent so the conversation can continue.

## Why this use case is a strong fit for WebMCP

The work is genuinely split. What is on the shelf, what the package says, and what to do with it are facts only the person has. Querying three databases per item, parsing code-range prose, and comparing readings are chores only an agent will do. WebMCP puts both halves in one place: typed tools update the visible page, and human actions in the page become tool-readable state. Scraping a recall site or pasting lot codes into chat cannot give the agent a reliable contract or the person a visible audit trail.

## How it creates a better user experience

The person never opens a recall database or reads a code range. Each card shows status, the notices with full code text, a highlighted “your agent asks you to read” block with a one-line form, the agent’s assessment, and decision buttons. Everything carries the query, sources, per-source status, and fetch time. Errors are shown as errors. The agent, in turn, cannot skip the physical step: match verdicts are rejected by the page until a reading exists.

## What people and agents can do together that was difficult or impossible before

A multi-item, multi-database recall sweep that ends in verified decisions, in minutes. Before, this meant either never checking or checking one product after a news story, because no assistant could see the pantry or the lid and no person wanted to query openFDA. Now a person lists a shelf in plain words, an agent does the sweep and the reading of dense notices, the person does thirty seconds of reading per flagged item, and both see the same result.

## How WebMCP is implemented

Static JavaScript, imperative API. `src/webmcp.js` contains the required registration verbatim:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  inputSchema: requiredSearchTool.inputSchema,
  execute: async (input, options) => requiredSearchTool.execute(input, options)
}, { signal: controller.signal });
```

Ten tools with closed schemas, runtime validation, AbortSignal support, 1,500-character output budgets, and `readOnlyHint` / `untrustedContentHint` annotations: `search_products`, `lookup_barcode`, `add_shelf_item`, `search_recalls`, `sweep_shelf`, `get_recall_details`, `request_package_reading`, `record_package_reading`, `assess_item`, `get_shelf`. External notices and relayed readings are marked untrusted. There is deliberately no tool that resolves, removes, purchases, or contacts anyone; resolution requires a trusted click and human authorization in the reducer. Live sources are `api.fda.gov` food and drug enforcement endpoints (24-month window, NOT_FOUND treated as zero, rate limits surfaced) and `saferproducts.gov`, queried in parallel with per-source status. Barcode digits from Open Food Facts records are compared digits-only against notice text, since notices print UPCs with spaces.

## Testing

`npm run check` runs 38 unit and contract tests plus a nine-point eval and a repository gate. `npm run test:live` hits the real Open Food Facts, openFDA, and CPSC endpoints. `npm run test:browser` drives Chromium with WebMCP feature flags through the full loop: registration, sweep with barcode flag, assessment rejected before a reading, trusted reading, assessment posted, trusted Discard, decision readable via `get_shelf`.

## Challenges

openFDA returns HTTP 404 for zero matches, so “no recalls” had to be distinguished from “source down”. CPSC’s product-name search is a substring match, so sweep queries use brand names and let the agent refine with `search_recalls`. Recall notices are prose, so the app does not try to parse code ranges itself; it gives the agent the full text and forces a human reading before any verdict.

## What’s next

Camera barcode capture, a household allergen profile matched against undeclared-allergen recalls (the most common FDA reason), and USDA FSIS meat and poultry recalls once a CORS-enabled feed exists. The human reading gate and human-only resolution would stay.
