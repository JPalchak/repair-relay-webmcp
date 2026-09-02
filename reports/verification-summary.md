# Verification summary

The release candidate was tested on 2026-09-02.

## Passed gates

- Node domain and WebMCP contract tests
- Seven human-agent scenario evaluations
- Luna adversarial review
- Repository completeness verification
- Native WebMCP registration in ChatGPT's in-app browser
- Eight native WebMCP calls across the observe → rank → compare → stage → decide journey
- Eight registered tools with closed schemas
- Evidence-sensitive reranking
- Staged plan remains unapproved
- Trusted visible human approval
- Approved-plan readback
- Malformed runtime types and non-integer plan lengths are rejected

Native browser evidence: all eight tools registered; human evidence increased the leading candidate from 84% to 90%; no approval tool was exposed; approval required the visible checkbox and human approval control; `get_approved_plan` then returned the approved plan. Extension-only metadata errors were excluded from application diagnostics.
