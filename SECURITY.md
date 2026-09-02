# Security and trust boundaries

Recall Relay has no accounts, secrets, payments, analytics, storage, or external write operations. Its only network activity is explicit read requests to Open Food Facts, openFDA, and CPSC.

- Recall notices, catalog records, and relayed readings are untrusted. Rendering uses `textContent`; no API text is injected as HTML. Tools returning them set `untrustedContentHint`.
- Links are restricted: product images only from `images.openfoodfacts.org`; CPSC links only to `cpsc.gov`; FDA links point at the openFDA source record for the recall number.
- Tool inputs have closed schemas and are re-validated at runtime; enum fields (kind, reading field, verdict, scope) are checked in code, not only in schema.
- Tool outputs are bounded to 1,500 characters.
- Live failures remain failures; openFDA `NOT_FOUND` is reported as zero results, not as an error, and per-source errors are shown on the page.
- Recall searches are cached for five minutes per query and scope; sweeps are bounded to eight items with a short delay between requests.
- Match verdicts (`likely_affected`, `likely_not_affected`) are rejected until a package reading exists. `no_recall_found` is rejected until a search has run for that item.
- Resolving an item (keep, discard, return, contact firm) and removing an item are human-only. No WebMCP tool or debug method can do either; the reducer requires `{ actor: "human", confirmed: true }` and the UI requires a trusted click.

openFDA’s disclaimer applies: do not rely on it to make decisions regarding medical care; assume results are unvalidated. Recall Relay is an information prototype, not safety, legal, or medical advice. Follow the official notice and the firm’s remedy.

Report vulnerabilities through the public repository’s Security tab or issue tracker without including sensitive personal information.
