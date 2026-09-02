import { READING_FIELDS, RESOLUTIONS, itemStatus, pendingReadingFields } from "./engine.js";
import { RECALL_SOURCES } from "./live-recalls.js";

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function friendly(value) {
  return String(value).replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function link(href, text) {
  const anchor = el("a", "source-link", text);
  anchor.href = href; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
  return anchor;
}

function button(label, className, onClick, type = "button") {
  const node = el("button", `button ${className}`, label);
  node.type = type;
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

export function createRenderer({ store, tools, actions }) {
  const q = (selector) => document.querySelector(selector);
  const els = {
    webmcpStatus: q("#webmcp-status"), catalogStatus: q("#catalog-status"), catalogError: q("#catalog-error"), catalogList: q("#catalog-list"),
    catalogEmpty: q("#catalog-empty"), catalogSource: q("#catalog-source"), shelf: q("#shelf-list"), shelfEmpty: q("#shelf-empty"), shelfCount: q("#shelf-count"),
    sweepStatus: q("#sweep-status"), sweepButton: q("#sweep-button"), sources: q("#source-list"), activity: q("#activity-log"), tools: q("#tool-list"),
    askBanner: q("#ask-banner")
  };

  function renderStatus(status) {
    els.webmcpStatus.className = `status-pill ${status.supported ? "status-live" : "status-neutral"}`;
    els.webmcpStatus.textContent = status.message;
  }

  function renderCatalog(state) {
    const { catalog } = state;
    const results = catalog.search?.results ?? [];
    els.catalogStatus.textContent = catalog.status === "loading" ? "Fetching live catalog…" : catalog.search ? `${results.length} live records` : "No search yet";
    els.catalogStatus.className = `status-pill ${catalog.status === "loading" ? "status-working" : catalog.search ? "status-live" : "status-neutral"}`;
    els.catalogError.hidden = !catalog.error;
    els.catalogError.textContent = catalog.error;
    els.catalogSource.textContent = catalog.search ? `Open Food Facts · fetched ${dateTime.format(new Date(catalog.search.fetchedAt))}` : "Live Open Food Facts records; no fixture fallback.";
    els.catalogEmpty.hidden = results.length > 0 || catalog.status === "loading";
    els.catalogList.replaceChildren(...results.map((product) => {
      const card = el("li", "catalog-card");
      if (product.imageUrl) {
        const image = el("img"); image.src = product.imageUrl; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; card.append(image);
      } else card.append(el("span", "image-missing", "No image"));
      const body = el("div", "catalog-body");
      body.append(el("strong", "", product.name), el("span", "muted", `${product.brand}${product.quantity ? ` · ${product.quantity}` : ""} · ${product.code}`));
      const row = el("div", "card-actions");
      row.append(button("Add to shelf", "button-primary button-small", () => actions.addFromCatalog(product.id)), link(product.sourceUrl, "Record ↗"));
      body.append(row);
      card.append(body);
      return card;
    }));
  }

  function renderCandidate(candidate) {
    const details = el("details", `candidate ${candidate.upcMatch ? "candidate-upc" : ""}`);
    const summary = el("summary");
    summary.append(el("span", `src-badge src-${candidate.source.toLowerCase()}`, candidate.source), el("strong", "", candidate.firm), el("span", "muted", ` · ${candidate.reason.slice(0, 90)}${candidate.reason.length > 90 ? "…" : ""}`));
    if (candidate.upcMatch) summary.append(el("span", "upc-flag", "Barcode digits appear in this notice"));
    details.append(summary);
    const body = el("div", "candidate-body");
    body.append(el("p", "", candidate.product));
    body.append(el("p", "code-info", candidate.codeInfo));
    const meta = el("p", "muted small", [candidate.classification, candidate.status, candidate.initiated ? `initiated ${candidate.initiated}` : "", candidate.distribution ? `distribution: ${candidate.distribution.slice(0, 120)}` : ""].filter(Boolean).join(" · "));
    body.append(meta);
    if (candidate.remedy) body.append(el("p", "small", `Remedy: ${candidate.remedy}`));
    body.append(link(candidate.url, `Source record ${candidate.recallNumber} ↗`));
    details.append(body);
    return details;
  }

  function renderReadingBlock(item) {
    const wrap = el("section", "reading-block");
    const pending = pendingReadingFields(item);
    const latest = item.readingRequests.at(-1);
    if (latest) {
      const ask = el("div", `ask ${pending.length ? "ask-open" : "ask-done"}`);
      ask.append(el("strong", "", pending.length ? "Your agent asks you to read the package" : "Reading request answered"), el("p", "", latest.whereToLook), el("p", "small muted", `Fields: ${latest.fields.map(friendly).join(", ")}${latest.recallId ? ` · against ${latest.recallId}` : ""}`));
      wrap.append(ask);
    }
    const form = el("form", "reading-form");
    const select = el("select"); select.setAttribute("aria-label", "Printed field");
    READING_FIELDS.forEach((field) => { const option = el("option", "", friendly(field)); option.value = field; select.append(option); });
    if (pending[0]) select.value = pending[0];
    const input = el("input"); input.placeholder = "Exactly as printed"; input.maxLength = 80; input.required = true; input.setAttribute("aria-label", "Printed value");
    const submit = button("Record what is printed", "button-primary button-small", null, "submit");
    form.append(select, input, submit);
    form.addEventListener("submit", (event) => { event.preventDefault(); if (actions.recordReading(item.id, select.value, input.value)) input.value = ""; });
    wrap.append(form);
    if (item.readings.length) {
      const list = el("ul", "readings");
      item.readings.forEach((reading) => list.append(el("li", `reading reading-${reading.source}`, `${friendly(reading.field)}: ${reading.value} — ${reading.source === "human" ? "read by you" : "relayed by agent"}`)));
      wrap.append(list);
    }
    return wrap;
  }

  function renderDecision(item) {
    const wrap = el("section", "decision-block");
    if (item.assessment) {
      const box = el("div", `assessment tone-${item.assessment.stale ? "warn" : itemStatus(item).tone}`);
      box.append(el("strong", "", `Agent assessment: ${friendly(item.assessment.verdict)}${item.assessment.stale ? " (outdated)" : ""}`), el("p", "", item.assessment.reasoning));
      if (item.assessment.stale) box.append(el("p", "small", `${item.assessment.staleReason} Ask your agent to reassess before deciding.`));
      if (item.assessment.recallId) box.append(el("p", "small muted", `Against ${item.assessment.recallId} · considered ${item.assessment.readingsConsidered.length} reading(s)`));
      wrap.append(box);
    }
    if (item.resolution) {
      wrap.append(el("p", "resolved", `You decided: ${friendly(item.resolution.action)} · ${dateTime.format(new Date(item.resolution.at))}`));
      return wrap;
    }
    const row = el("div", "decision-row");
    RESOLUTIONS.forEach((action) => row.append(button(friendly(action), `button-decide decide-${action}`, (event) => actions.resolveItem(item.id, action, event))));
    wrap.append(el("p", "small muted", "Your decision. No WebMCP tool can make it."), row);
    return wrap;
  }

  function renderItem(item, highlighted) {
    const status = itemStatus(item);
    const card = el("li", `shelf-card tone-${status.tone} ${highlighted ? "highlight" : ""}`);
    card.dataset.itemId = item.id;
    const head = el("header", "shelf-head");
    if (item.imageUrl) { const image = el("img"); image.src = item.imageUrl; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; head.append(image); }
    const title = el("div", "shelf-title");
    title.append(el("h3", "", item.name), el("p", "muted", [item.brand, item.barcode ? `barcode ${item.barcode}` : "", friendly(item.kind), `added by ${item.addedBy === "human" ? "you" : "agent"}`].filter(Boolean).join(" · ")));
    if (item.note) title.append(el("p", "small", item.note));
    head.append(title, el("span", `status-pill tone-${status.tone}`, status.label));
    card.append(head);

    const sweepLine = el("p", "small muted", item.lastSweep
      ? `Last recall search “${item.lastSweep.query}” at ${dateTime.format(new Date(item.lastSweep.at))} · ${item.lastSweep.sources.map((entry) => `${entry.source.replace("fda_", "FDA ").toUpperCase()}: ${entry.status === "ok" ? entry.total : "error"}`).join(" · ")}`
      : "Not yet checked against live recall sources.");
    card.append(sweepLine);

    if (item.candidates.length) {
      const list = el("div", "candidate-list");
      item.candidates.forEach((candidate) => list.append(renderCandidate(candidate)));
      card.append(list);
    }
    card.append(renderReadingBlock(item), renderDecision(item));
    const tools = el("div", "card-actions");
    tools.append(button(item.lastSweep ? "Re-check recalls" : "Check recalls", "button-quiet button-small", () => actions.checkItem(item)), button("Remove", "text-button", () => actions.removeItem(item.id)));
    if (item.sourceUrl) tools.append(link(item.sourceUrl, "Catalog record ↗"));
    card.append(tools);
    return card;
  }

  function renderShelf(state) {
    els.shelfCount.textContent = String(state.shelf.length);
    els.shelfEmpty.hidden = state.shelf.length > 0;
    els.sweepButton.disabled = state.sweep.status === "running" || !state.shelf.some((item) => !item.resolution);
    els.sweepStatus.textContent = state.sweep.status === "running" ? state.sweep.message : state.sweep.at ? `${state.sweep.message} ${dateTime.format(new Date(state.sweep.at))}` : "No sweep yet.";
    const awaiting = state.shelf.filter((item) => pendingReadingFields(item).length);
    els.askBanner.hidden = awaiting.length === 0;
    els.askBanner.textContent = awaiting.length ? `Your agent is waiting on you: read ${awaiting.map((item) => item.name).join(", ")}.` : "";
    els.shelf.replaceChildren(...state.shelf.map((item) => renderItem(item, item.id === state.highlightItemId)));
  }

  function renderSources(state) {
    els.sources.replaceChildren(...Object.values(RECALL_SOURCES).map((source) => {
      const meta = state.recallMeta[source.key];
      const item = el("li", `source-item ${meta ? (meta.status === "ok" ? "ok" : "error") : ""}`);
      item.append(link(source.home, source.label), el("span", "small muted", meta
        ? `${meta.status === "ok" ? "Reachable" : `Error: ${meta.message}`} · checked ${dateTime.format(new Date(meta.checkedAt))}${meta.lastUpdated ? ` · dataset ${meta.lastUpdated}` : ""}`
        : "Not queried yet"));
      return item;
    }));
  }

  function renderActivity(state) {
    els.activity.replaceChildren(...state.activity.slice(0, 10).map((item) => {
      const li = el("li", `activity-item actor-${item.actor}`);
      li.append(el("strong", "", `${item.actor} · ${item.action}`), el("span", "", item.detail), el("time", "", dateTime.format(new Date(item.at))));
      return li;
    }));
  }

  function renderTools() {
    els.tools.replaceChildren(...tools.map((tool) => {
      const item = el("div", "tool-chip");
      item.append(el("code", "", tool.name), el("small", "", tool.annotations.readOnlyHint ? "read-only" : "writes"));
      return item;
    }));
  }

  function render(state) {
    renderCatalog(state); renderShelf(state); renderSources(state); renderActivity(state);
  }
  renderTools(); render(store.getState()); store.subscribe(render);
  return { renderStatus, render };
}
