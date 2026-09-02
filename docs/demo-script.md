# Judge demo script (about 2:30)

## 0:00–0:25 — The asymmetry

Show the hero and live search timestamp.

“Open product data knows millions of products, but it cannot know whether this record matches the package in my hand. An agent can search and compare at scale. I can verify the physical barcode and current ingredients. Label Relay is the structured handoff between those capabilities.”

## 0:25–0:55 — Prove live data

Search `quaker oats` or enter barcode `3168930003632`.

“This is a production Open Food Facts request, not a bundled catalog. Every card links to its source and shows fetch time, upstream freshness, completeness, and missing data. If the API fails, the app shows the failure—there is no fake fallback.”

## 0:55–1:25 — Prove WebMCP

Open the WebMCP inspector and show the eight tools. Invoke `search_products`, then `compare_products`.

“The agent is not scraping cards. It calls typed tools. Those callbacks update the same state and page I see. External data is marked untrusted and outputs are bounded.”

## 1:25–1:55 — Human physical evidence

Stage a result. Record barcode and ingredients checks.

“The agent may stage and explain, but two facts must come from reality. These checks remove the corresponding blockers. A mismatch would stay visible instead of being reasoned away.”

## 1:55–2:20 — Authority boundary

Invoke `request_human_decision`. Show that no approval tool exists. Check the visible consent box and click approve.

“Approval requires my trusted click. Only afterward can `get_approved_choice` return an approved result.”

## 2:20–2:30 — Close

“Label Relay becomes meaningfully better when agent-scale search and human-scale truth use the same WebMCP workspace.”
