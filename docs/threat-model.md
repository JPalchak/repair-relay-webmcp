# Threat model

| Risk | Control |
|---|---|
| Product text contains prompt injection | External data is marked with `untrustedContentHint`, rendered with `textContent`, and never interpreted as tool instructions |
| Malicious image URL | Only HTTPS URLs on `images.openfoodfacts.org` are accepted |
| Community record is stale, incomplete, or for another package revision | Direct source link, fetch time, upstream modification time, Open Food Facts completeness, missing-field language, and package attestations remain visible |
| API returns HTML with HTTP 200 | JSON parsing fails with a readable upstream-response error and a visible Retry action |
| API outage is hidden | Separate timeout, rate-limit, HTTP, unreadable-response, and no-result states; no fixture fallback in production |
| One healthy endpoint hides another broken demo path | `npm run test:live` requires both US text search and worldwide v3.6 barcode lookup to pass |
| Tool output is truncated into invalid JSON | Values and arrays are compacted before serialization; an explicit bounded error object is returned if needed |
| Agent invents or misstates a package observation | `record_package_check` creates `pending_human_confirmation`; it clears no requirement until the person confirms that exact statement through a trusted visible click |
| Person rejects an agent-relayed statement | Rejection is recorded and the statement contributes no package evidence |
| Confirmed package mismatch is ignored | The record enters `record_mismatch`, approval is blocked, any prior approval is revoked, and the official per-barcode Open Food Facts correction route is shown |
| Earlier approval outlives later contradictory evidence | Any newly added or newly confirmed package evidence invalidates the approved summary and requires another review |
| Agent crosses the decision boundary | No approval or confirmation tool/debug method; reducer requires trusted human authorization for both confirmation and approval |
| Human click is overclaimed as physical proof | UI, tool output, README, and approved summary call it an attestation and state that the app cannot see or authenticate the package |
| Sensitive action is inferred from the approved summary | No purchase, ingestion, database-write, or medical-decision capability; the summary preserves source and limitations |
