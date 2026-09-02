# Challenge requirement mapping

| Requirement | Evidence |
|---|---|
| Working hosted project | Public ChatGPT Sites URL in README and `LIVE_URL.txt` |
| Public repository | Dedicated GitHub repository in README and `REPOSITORY_URL.txt` |
| Open-source license | Root `LICENSE`, MIT |
| Exact required tool | Executable literal in `src/webmcp.js`; contract tests |
| Real working data | `src/live-catalog.js`; visible provenance; `npm run test:live` |
| Meaningful human-agent collaboration | Physical package checks + agent live comparison + human-only approval |
| Chrome WebMCP iteration | `docs/browser-test.md`; Chromium lifecycle harness |
| Security guidance | Untrusted hints, closed schemas, bounded output, safe image host, honest failure |
| Evaluation | `npm run eval`; unit/browser/live tests; recurring Luna development-subagent reviews |
| Luna not a web feature | Product-surface test rejects `luna`; no Luna UI, timer, or WebMCP tool |
| Submission description | README and `DEVPOST.md` answer fit, UX, new collaboration, implementation |
