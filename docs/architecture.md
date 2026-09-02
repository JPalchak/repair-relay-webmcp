# Architecture

```text
Person ──visible observations/approval──▶ Shared Store ◀──typed tool calls── Browser Agent
                                              │
                                              ├── evidence-sensitive ranking engine
                                              ├── comparison projection
                                              ├── staged repair-plan builder
                                              └── Luna evaluator
```

## Components

- `src/store.js` is the authoritative client-side case state and event reducer.
- `src/engine.js` validates evidence, ranks the bounded catalog, builds reversible plans, and enforces human authorization.
- `src/tool-definitions.js` exposes narrow WebMCP capabilities over the same store.
- `src/webmcp.js` registers those tools through the imperative API.
- `src/render.js` projects the store into the accessible visible interface using safe text nodes.
- `src/app.js` handles human interaction and deliberately exposes no programmatic approval method.
- `src/luna.js` evaluates collaboration and trust invariants.

## Data flow

1. A person or agent contributes a bounded event.
2. The domain engine validates and normalizes it.
3. The reducer updates one shared state.
4. The renderer updates the same page both participants inspect.
5. Luna reevaluates the collaboration loop.
6. Approval is accepted only from the visible human path.

The demo uses no backend and stores no personal data. Reloading resets the case.
