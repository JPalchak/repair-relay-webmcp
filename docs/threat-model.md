# Threat model

| Risk | Control |
|---|---|
| Product text contains prompt injection | `untrustedContentHint`; `textContent`; no instructions executed from records |
| Malicious image URL | Only `images.openfoodfacts.org` HTTPS URLs accepted |
| Community record is stale or incomplete | Fetch and modification times, completeness score, missing-field language, physical checks |
| API outage is hidden | Visible typed error; no fixture fallback |
| Rate-limit abuse | Explicit search only; five-minute in-memory cache; bounded page size |
| Agent invents a barcode check | Check is visible and source-labelled; final approval remains human-only |
| Agent crosses decision boundary | No approval tool/debug method; trusted click and required checks enforced in reducer |
| Sensitive action is inferred from choice | No purchase, checkout, ingestion, or medical-decision capability |
