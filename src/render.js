const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function friendly(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function freshness(iso) {
  if (!iso) return "Date unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  return days === 0 ? "Updated today" : `Updated ${days}d ago`;
}

export function createRenderer({ store, tools, actions }) {
  const q = (selector) => document.querySelector(selector);
  const els = {
    webmcpStatus: q("#webmcp-status"), searchStatus: q("#search-status"), sourceLine: q("#source-line"), error: q("#search-error"),
    resultList: q("#product-list"), empty: q("#result-empty"), comparison: q("#comparison-panel"), comparisonWrap: q("#comparison-wrap"),
    checks: q("#check-list"), checkCount: q("#check-count"), productSelect: q("#check-product"), choiceEmpty: q("#choice-empty"),
    choiceCard: q("#choice-card"), choiceStatus: q("#choice-status"), choiceTitle: q("#choice-title"), choiceBrand: q("#choice-brand"),
    choiceRationale: q("#choice-rationale"), requiredChecks: q("#required-checks"), consent: q("#approval-checkbox"), approve: q("#approve-button"),
    approvalNote: q("#approval-note"), activity: q("#activity-log"), tools: q("#tool-list"), decision: q("#decision-dialog"),
    decisionReason: q("#decision-reason"), decisionSummary: q("#decision-summary")
  };

  function renderStatus(status) {
    els.webmcpStatus.className = `status-pill ${status.supported ? "status-live" : "status-neutral"}`;
    els.webmcpStatus.textContent = status.message;
  }

  function renderSearch(state) {
    els.searchStatus.textContent = state.searchStatus === "loading" ? "Fetching live data…" : state.search ? `${state.search.results.length} live records` : "No search yet";
    els.searchStatus.className = `status-pill ${state.searchStatus === "loading" ? "status-working" : state.search ? "status-live" : "status-neutral"}`;
    els.error.hidden = !state.searchError;
    els.error.textContent = state.searchError;
    els.sourceLine.textContent = state.search
      ? `Live from ${state.search.source} · fetched ${dateTime.format(new Date(state.search.fetchedAt))} · ${state.search.total.toLocaleString()} matching records reported`
      : "Every result will show its source and fetch time. No fixture fallback exists.";
    const results = state.search?.results ?? [];
    els.empty.hidden = results.length > 0 || state.searchStatus === "loading";
    els.resultList.replaceChildren(...results.map((product) => {
      const card = el("li", "product-card");
      const media = el("div", "product-media");
      if (product.imageUrl) {
        const image = el("img");
        image.src = product.imageUrl;
        image.alt = `${product.name} package from Open Food Facts`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        media.append(image);
      } else media.append(el("span", "image-missing", "No image"));
      const body = el("div", "product-body");
      const source = el("a", "source-link", "Open Food Facts ↗");
      source.href = product.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      const heading = el("h3", "", product.name);
      const brand = el("p", "product-brand", `${product.brand}${product.quantity ? ` · ${product.quantity}` : ""}`);
      const facts = el("div", "fact-row");
      facts.append(
        el("span", `grade grade-${product.nutriScore}`, `Nutri-Score ${product.nutriScore.toUpperCase()}`),
        el("span", "", `${product.completeness}% complete`),
        el("span", "", freshness(product.lastModified)),
        el("span", "", `Barcode ${product.code}`)
      );
      const allergen = el("p", "allergen-line", product.allergens.length ? `Recorded allergens: ${product.allergens.join(", ")}` : "Allergen data not recorded — verify the package.");
      const ingredients = el("p", "ingredients", product.ingredients || "Ingredients not recorded — verify the package.");
      const controls = el("div", "card-actions");
      const compare = el("button", "button button-quiet", "Compare"); compare.type = "button"; compare.addEventListener("click", () => actions.toggleCompare(product.id));
      const stage = el("button", "button button-primary", "Stage for verification"); stage.type = "button"; stage.addEventListener("click", () => actions.stageChoice(product.id));
      controls.append(compare, stage, source);
      body.append(heading, brand, facts, allergen, ingredients, controls);
      card.append(media, body);
      return card;
    }));

    const selected = els.productSelect.value;
    els.productSelect.replaceChildren(el("option", "", "Choose a live result…"), ...results.map((product) => {
      const option = el("option", "", `${product.name} · ${product.code}`); option.value = product.id; return option;
    }));
    if (results.some((p) => p.id === selected)) els.productSelect.value = selected;
  }

  function renderChecks(state) {
    els.checkCount.textContent = String(state.checks.length);
    els.checks.replaceChildren(...state.checks.slice().reverse().map((check) => {
      const item = el("li", `check-item outcome-${check.outcome}`);
      item.append(el("strong", "", `${friendly(check.checkType)} · ${friendly(check.outcome)}`), el("p", "", check.note), el("small", "", `${check.productId} · ${check.source === "agent" ? "recorded through agent" : "recorded by person"}`));
      return item;
    }));
  }

  function renderComparison(state) {
    els.comparison.hidden = state.comparison.length < 2;
    if (state.comparison.length < 2) return els.comparisonWrap.replaceChildren();
    const table = el("table", "comparison-table");
    const head = el("tr");
    ["Product", "Nutri-Score", "Sugar/100g", "Allergens", "Completeness", "Freshness"].forEach((label) => head.append(el("th", "", label)));
    const thead = el("thead"); thead.append(head); const tbody = el("tbody");
    state.comparison.forEach((product) => {
      const row = el("tr");
      [product.name, product.nutriScore.toUpperCase(), product.sugar100g == null ? "Not recorded" : `${product.sugar100g} g`, product.allergens.join(", ") || "Not recorded", `${product.completeness}%`, freshness(product.lastModified)].forEach((value) => row.append(el("td", "", value)));
      tbody.append(row);
    });
    table.append(thead, tbody); els.comparisonWrap.replaceChildren(table);
  }

  function renderChoice(state) {
    const choice = state.stagedChoice;
    els.choiceEmpty.hidden = Boolean(choice);
    els.choiceCard.hidden = !choice;
    if (!choice) {
      els.choiceStatus.textContent = "Nothing staged";
      els.choiceStatus.className = "status-pill status-neutral";
      return;
    }
    const approved = choice.status === "human_approved";
    els.choiceStatus.textContent = approved ? "Human approved" : "Awaiting human verification";
    els.choiceStatus.className = `status-pill ${approved ? "status-live" : "status-working"}`;
    els.choiceTitle.textContent = choice.name;
    els.choiceBrand.textContent = `${choice.brand} · barcode ${choice.productId}`;
    els.choiceRationale.textContent = choice.rationale;
    els.requiredChecks.replaceChildren(...(choice.requiredChecks.length
      ? choice.requiredChecks.map((type) => el("li", "required", `${friendly(type)} still required`))
      : [el("li", "complete", "Barcode and ingredients checks match the physical package.")]));
    els.consent.disabled = approved || choice.requiredChecks.length > 0;
    els.consent.checked = approved;
    els.approve.disabled = approved || choice.requiredChecks.length > 0 || !els.consent.checked;
    els.approve.textContent = approved ? "Approved by the person" : "Approve this verified choice";
    els.approvalNote.textContent = approved ? `Approved ${dateTime.format(new Date(choice.approvedAt))}.` : "No WebMCP tool can approve. Product records may be incomplete; the package label remains authoritative.";
  }

  function renderActivity(state) {
    els.activity.replaceChildren(...state.activity.slice(0, 8).map((item) => {
      const li = el("li", "activity-item"); li.append(el("strong", "", `${item.actor} · ${item.action}`), el("span", "", item.detail), el("time", "", dateTime.format(new Date(item.at)))); return li;
    }));
  }

  function renderTools() {
    els.tools.replaceChildren(...tools.map((tool) => {
      const item = el("div", "tool-chip"); item.append(el("code", "", tool.name), el("small", "", tool.annotations.readOnlyHint ? "Read-only" : "Updates shared state")); return item;
    }));
  }

  function renderDecision(state) {
    if (!state.decisionRequest || !state.stagedChoice) return;
    els.decisionReason.textContent = state.decisionRequest.reason;
    els.decisionSummary.textContent = `${state.stagedChoice.name}; ${state.stagedChoice.requiredChecks.length} physical check(s) remain; no approval recorded.`;
    if (!els.decision.open) els.decision.showModal();
  }

  function render(state) {
    renderSearch(state); renderChecks(state); renderComparison(state); renderChoice(state); renderActivity(state); renderDecision(state);
  }
  renderTools(); render(store.getState()); store.subscribe(render);
  return { renderStatus, render };
}
