# Security and trust boundaries

Label Relay has no accounts, secrets, payments, analytics, background tracking, or external write operations. Its only network activity is an explicit read request to Open Food Facts.

- Product records and human/agent notes are untrusted. Rendering uses `textContent`; no API text is injected as HTML.
- Product image URLs are accepted only from `https://images.openfoodfacts.org`.
- Tool inputs have closed schemas and are validated again at runtime.
- Tool outputs are bounded to 1,500 characters.
- Live failures remain failures; no fixture is presented as real data.
- Search is explicit and cached for five minutes to reduce rate-limit pressure.
- A staged choice is not approval. Barcode and ingredients matches are required, and only a trusted visible click can approve.
- No WebMCP tool can approve, purchase, ingest, or make a medical decision.

Open Food Facts data can be inaccurate or incomplete. The physical label is authoritative, especially for allergens. Label Relay is an information and verification prototype, not medical advice.

Report vulnerabilities through the public repository's Security tab or issue tracker without including sensitive personal information.
