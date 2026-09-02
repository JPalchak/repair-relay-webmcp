# Threat model

| Risk | Control |
|---|---|
| Notice or catalog text contains prompt injection | `untrustedContentHint` on every tool returning external or relayed text; `textContent` rendering; no instructions executed from records |
| Malicious link or image URL | Images only from `images.openfoodfacts.org`; CPSC links only to `cpsc.gov`; FDA links to the openFDA source record |
| Agent fabricates a lot code to force a verdict | Relayed readings are labelled “relayed by agent” on the card; the person can add a corrected reading; the person still decides |
| Agent judges without physical evidence | `assess_item` rejects match verdicts without a reading and `no_recall_found` without a search |
| Agent disposes of or clears an item | No resolve/remove tool; reducer requires human authorization; UI requires a trusted click |
| Source outage hidden | Per-source status on every card and in the sources panel; total failure throws; no fixture fallback |
| Rate-limit abuse | Five-minute cache per query and scope; sweeps bounded to eight items with delay; 429 surfaced |
| False barcode match from unrelated numbers | Only 11+ digit variants are compared, and only against contiguous digit runs (separators collapsed between adjacent digits, never across words or fields); the flag is presented as “digits appear in this notice”, not as a verdict |
| Assessment outlives its evidence | New candidates or readings mark the assessment stale; the card and `get_shelf` show it as outdated until the agent reassesses |
| Oversized tool output breaks the agent | Outputs are shortened array by array with omitted counts and stay valid JSON; `get_shelf` accepts `itemId` for detail |
| Over-broad brand query hides the real notice | Sweep output tells the agent to refine with `search_recalls`; the person can re-check per card |
| Medical or safety over-reliance | openFDA disclaimer shown on the page; footer states the app is not advice and points to the official notice |
