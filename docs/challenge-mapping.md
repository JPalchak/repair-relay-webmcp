# Challenge requirement mapping

| Requirement | Evidence |
|---|---|
| Working hosted project | ChatGPT Sites URL in README and `LIVE_URL.txt`; `dist/` also deploys to Netlify/Cloudflare/Vercel |
| Public repository with source, assets, instructions | This repository; README “Run locally” and “Verification” |
| Open-source license visible in About | Root `LICENSE`, MIT |
| Exact required tool registration | Executable literal in `src/webmcp.js`; `tests/repository.test.js`; `scripts/verify-repository.mjs` |
| Built with WebMCP developer tools | Imperative `document.modelContext.registerTool()`; Chrome flag procedure in `docs/browser-test.md` |
| Better together than alone | Agent sweeps and parses notices; person reads lot codes and decides; page enforces the hand-off |
| Real working data | `src/live-recalls.js`, `src/live-catalog.js`; `npm run test:live`; visible provenance on every card |
| Security guidance followed | Untrusted hints, closed schemas, bounded output, restricted link hosts, honest failure, human-only resolution |
| Evaluation on usefulness, originality, execution, WebMCP use, experience | `npm run eval`; unit, live, and browser tests; `docs/evaluation-rubric.md` |
| Submission description (fit, UX, together, implementation) | README and `DEVPOST.md` |
