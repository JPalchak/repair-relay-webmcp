# Security and trust boundaries

Label Relay has no accounts, secrets, payments, analytics, background tracking, or external write operations. Its only network activity is an explicit read request to Open Food Facts. The correction link opens Open Food Facts’ own edit page; Label Relay never writes to the database.

## Trust levels

- Open Food Facts records are untrusted community data.
- A statement relayed through `record_package_check` is untrusted and remains `pending_human_confirmation`.
- Only a trusted visible **Confirm I said this** click converts one specific relayed statement into a human attestation.
- A human attestation is not independent visual proof. Label Relay cannot determine whether the person actually inspected the package.
- A staged record is not approved. Only the visible consent and approval controls can approve an attested match.

## Controls

- External product strings and human/agent notes render through `textContent`; API text is never injected as HTML.
- Product image URLs are accepted only from `https://images.openfoodfacts.org` over HTTPS.
- Tool input schemas are closed and every callback revalidates types, identifiers, enums, and undeclared fields.
- External and agent-relayed content carries `untrustedContentHint`.
- Tool output is compacted structurally. Serialized JSON is never truncated mid-token.
- HTTP failures, timeouts, rate limits, non-JSON success responses, and no-result states remain distinguishable; no fixture is presented as live data.
- Search is explicit, page size is bounded, and successful text searches are cached for five minutes.
- A confirmed package mismatch moves the staged record to `record_mismatch`, disables approval, withdraws any prior approval, and removes the approved summary.
- Later evidence always forces another human review rather than allowing an earlier approval to outlive contradictory evidence.
- No WebMCP or debug method can confirm a relayed statement, approve a record, purchase anything, submit a database correction, or make a medical decision.

Open Food Facts can be inaccurate or incomplete. The physical label remains authoritative, especially for allergens. Label Relay supports source-backed package screening; it is not medical advice and does not certify that a food is safe for a particular person.

Report vulnerabilities through the public repository’s Security tab or issue tracker without including sensitive personal information.
