# Judge demo script (about 2:20)

## 0:00–0:20 — Name the person and problem

Show the first screen.

“Label Relay is for allergy-aware households and caregivers using browser agents to compare packaged foods. Open Food Facts can search millions of records, but it cannot know whether this community record matches the box in my hand. The person can read the box, but should not have to manually coordinate the database and the agent.”

## 0:20–0:45 — Prove live, judge-reproducible data

Show the startup lookup for barcode `030000010402` and its source link and timestamp.

“This is a live Open Food Facts v3.6 lookup for a real US retail barcode. The page prefers English ingredient text and keeps source freshness visible. Text search is scoped to products reported as sold in the United States. If the upstream service fails or returns HTML instead of JSON, Label Relay shows a readable error and a Retry button—there is no fake product fallback.”

## 0:45–1:05 — Prove WebMCP

Open Chrome DevTools → Application → WebMCP and show the eight tools. Invoke `stage_verified_choice` for the visible record.

“The browser agent is not scraping cards. It calls typed tools that update this same page and shared store. The schemas are closed, external data is marked untrusted, and outputs remain valid JSON.”

## 1:05–1:35 — Show the corrected human relay

Give the agent this statement:

> The barcode matches, and the package ingredients read Whole Grain Rolled Oats.

Let it call `record_package_check` twice.

“The agent can relay what I said, but notice that it did not call this verified. Two pending attestation cards appeared, and the required checks remain. Label Relay cannot see whether I looked at the package.”

Click **Confirm I said this** on both cards.

“My trusted clicks confirm those exact statements. Only now do the blockers clear.”

## 1:35–1:55 — Make approval consequential

Check the consent box and approve.

“Approval unlocks a visible and agent-readable label summary with the record, source, confirmed attestations, and limitations. The conversation can continue without losing where each fact came from.”

Invoke `get_approved_choice` and show the matching structured result.

## 1:55–2:15 — Show the higher-value mismatch path

Add a human-confirmed ingredients mismatch, such as “the package also lists salt.”

“This is the more important outcome. The old approval is revoked, the community record is blocked for this package, and Label Relay opens the official Open Food Facts correction form for the exact barcode.”

## 2:15–2:20 — Close

“The agent contributes live catalog scale. The person contributes package truth. WebMCP makes the trust transition visible, specific, and useful.”
