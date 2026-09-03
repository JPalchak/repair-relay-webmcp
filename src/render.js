import { buildVerifiedLabelSummary, correctionUrl } from "./engine.js";

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

function checkAttribution(check) {
  if (check.confirmationStatus === "pending_human_confirmation") return "relayed through agent · awaiting your confirmation";
  if (check.confirmationStatus === "rejected") return "relayed through agent · rejected by person";
  if (check.source === "agent_relay") return "relayed through agent · confirmed by person";
  return "attested directly by person";
}

export function createRenderer({ store, tools, actions }) {
  const q = (selector) => document.querySelector(selector);
  const els = {
    webmcpStatus: q("#webmcp-status"),
    searchStatus: q("#search-status"),
    sourceLine: q("#source-line"),
    error: q("#search-error"),
    errorText: q("#search-error-text"),
    retry: q("#retry-search-button"),
    resultList: q("#product-list"),
    empty: q("#result-empty"),
    comparison: q("#comparison-panel"),
    comparisonWrap: q("#comparison-wrap"),
    checks: q("#check-list"),
    checkCount: q("#check-count"),
    productSelect: q("#check-product"),
    choiceEmpty: q("#choice-empty"),
    choiceCard: q("#choice-card"),
    choiceStatus: q("#choice-status"),
    choiceTitle: q("#choice-title"),
    choiceBrand: q("#choice-brand"),
    choiceRationale: q("#choice-rationale"),
    requiredChecks: q("#required-checks"),
    choiceVerdict: q("#choice-verdict"),
    correctionLink: q("#correction-link"),
    consent: q("#approval-checkbox"),
    approve: q("#approve-button"),
    approvalNote: q("#approval-note"),
    verifiedOutcome: q("#verified-outcome"),
    verifiedSummary: q("#verified-summary"),
    verifiedSource: q("#verified-source-link"),
    copyVerified: q("#copy-verified-summary-button"),
    activity: q("#activity-log"),
    tools: q("#tool-list"),
    decision: q("#decision-dialog"),
    decisionReason: q("#decision-reason"),
    decisionSummary: q("#decision-summary")
  };

  function renderStatus(status) {
    els.webmcpStatus.className = `status-pill ${status.supported ? "status-live" : "status-neutral"}`;
    els.webmcpStatus.textContent = status.message;
  }

  function renderSearch(state) {
    els.searchStatus.textContent = state.searchStatus === "loading"
      ? "Fetching live data…"
      : state.search
        ? `${state.search.results.length} live record${state.search.results.length === 1 ? "" : "s"}`
        : "No search yet";
    els.searchStatus.className = `status-pill ${state.searchStatus === "loading" ? "status-working" : state.search ? "status-live" : "status-neutral"}`;
    els.error.hidden = !state.searchError;
    els.errorText.textContent = state.searchError;
    els.retry.hidden = !state.searchError;
    els.sourceLine.textContent = state.search
      ? `Live from ${state.search.source} · ${state.search.searchScope ?? "current catalog"} · fetched ${dateTime.format(new Date(state.search.fetchedAt))} · ${state.search.total.toLocaleString()} matching records reported`
      : "Every result shows its source and fetch time. No fixture fallback exists.";

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
      } else {
        media.append(el("span", "image-missing", "No image"));
      }

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
        el("span", "", `OFF completeness ${product.completeness}%`),
        el("span", "", freshness(product.lastModified)),
        el("span", "", `Barcode ${product.code}`)
      );
      const allergen = el(
        "p",
        "allergen-line",
        product.allergens.length
          ? `Recorded allergens: ${product.allergens.join(", ")}`
          : "Allergen data not recorded — read the package before relying on this record."
      );
      const language = product.ingredients
        ? `Ingredients (${product.ingredientsLanguage.toLowerCase()}): ${product.ingredients}`
        : "Ingredients not recorded — read the package before relying on this record.";
      const ingredients = el("p", "ingredients", language);
      const controls = el("div", "card-actions");
      const compare = el("button", "button button-quiet", "Compare");
      compare.type = "button";
      compare.addEventListener("click", () => actions.toggleCompare(product.id));
      const stage = el("button", "button button-primary", "Stage for verification");
      stage.type = "button";
      stage.addEventListener("click", () => actions.stageChoice(product.id));
      controls.append(compare, stage, source);
      body.append(heading, brand, facts, allergen, ingredients, controls);
      card.append(media, body);
      return card;
    }));

    const selected = els.productSelect.value;
    els.productSelect.replaceChildren(
      el("option", "", "Choose a live result…"),
      ...results.map((product) => {
        const option = el("option", "", `${product.name} · ${product.code}`);
        option.value = product.id;
        return option;
      })
    );
    if (results.some((product) => product.id === selected)) els.productSelect.value = selected;
  }

  function renderChecks(state) {
    els.checkCount.textContent = String(state.checks.length);
    els.checks.replaceChildren(...state.checks.slice().reverse().map((check) => {
      const pending = check.confirmationStatus === "pending_human_confirmation";
      const rejected = check.confirmationStatus === "rejected";
      const item = el("li", `check-item outcome-${check.outcome}${pending ? " check-pending" : ""}${rejected ? " check-rejected" : ""}`);
      item.append(
        el("strong", "", `${friendly(check.checkType)} · ${friendly(check.outcome)}`),
        el("p", "", check.note),
        el("small", "", `${check.productId} · ${checkAttribution(check)}`)
      );

      if (pending) {
        const actionsWrap = el("div", "attestation-actions");
        const confirm = el("button", "button button-confirm", "Confirm I said this");
        confirm.type = "button";
        confirm.addEventListener("click", (event) => actions.confirmRelayedCheck(check.id, event));
        const reject = el("button", "button button-quiet", "Reject statement");
        reject.type = "button";
        reject.addEventListener("click", (event) => actions.rejectRelayedCheck(check.id, event));
        actionsWrap.append(confirm, reject);
        item.append(actionsWrap);
      }

      if (!pending && !rejected && check.outcome === "mismatch") {
        const correction = el("a", "correction-link-inline", "Correct this Open Food Facts record ↗");
        correction.href = correctionUrl(check.productId);
        correction.target = "_blank";
        correction.rel = "noopener noreferrer";
        item.append(correction);
      }
      return item;
    }));
  }

  function renderComparison(state) {
    els.comparison.hidden = state.comparison.length < 2;
    if (state.comparison.length < 2) {
      els.comparisonWrap.replaceChildren();
      return;
    }
    const table = el("table", "comparison-table");
    const head = el("tr");
    ["Product", "Nutri-Score", "Sugar/100g", "Allergens", "OFF completeness", "Freshness"].forEach((label) => head.append(el("th", "", label)));
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    state.comparison.forEach((product) => {
      const row = el("tr");
      [
        product.name,
        product.nutriScore.toUpperCase(),
        product.sugar100g == null ? "Not recorded" : `${product.sugar100g} g`,
        product.allergens.join(", ") || "Not recorded",
        `${product.completeness}%`,
        freshness(product.lastModified)
      ].forEach((value) => row.append(el("td", "", value)));
      tbody.append(row);
    });
    table.append(thead, tbody);
    els.comparisonWrap.replaceChildren(table);
  }

  function renderVerifiedOutcome(state) {
    const summary = buildVerifiedLabelSummary(state);
    els.verifiedOutcome.hidden = !summary;
    if (!summary) {
      els.verifiedSummary.replaceChildren();
      els.copyVerified.disabled = true;
      return;
    }
    const ingredients = summary.product.ingredients || "Not recorded in Open Food Facts";
    const allergens = summary.product.allergens.length ? summary.product.allergens.join(", ") : "Not recorded";
    const definition = el("dl", "summary-grid");
    for (const [label, value] of [
      ["Product", `${summary.product.name} · ${summary.product.brand}`],
      ["Barcode", summary.product.id],
      ["Ingredients", ingredients],
      ["Recorded allergens", allergens],
      ["Confirmed attestations", String(summary.attestations.length)]
    ]) {
      definition.append(el("dt", "", label), el("dd", "", value));
    }
    const note = el("p", "attestation-note", summary.limitations[0]);
    els.verifiedSummary.replaceChildren(definition, note);
    els.verifiedSource.href = summary.product.sourceUrl;
    els.copyVerified.disabled = false;
  }

  function renderChoice(state) {
    const choice = state.stagedChoice;
    els.choiceEmpty.hidden = Boolean(choice);
    els.choiceCard.hidden = !choice;
    if (!choice) {
      els.choiceStatus.textContent = "Nothing staged";
      els.choiceStatus.className = "status-pill status-neutral";
      els.choiceVerdict.hidden = true;
      els.correctionLink.hidden = true;
      renderVerifiedOutcome(state);
      return;
    }

    const approved = choice.status === "human_approved";
    const mismatch = choice.status === "record_mismatch";
    els.choiceStatus.textContent = approved ? "Human approved" : mismatch ? "Record mismatch" : "Awaiting human verification";
    els.choiceStatus.className = `status-pill ${approved ? "status-live" : mismatch ? "status-error" : "status-working"}`;
    els.choiceTitle.textContent = choice.name;
    els.choiceBrand.textContent = `${choice.brand} · barcode ${choice.productId}`;
    els.choiceRationale.textContent = choice.rationale;

    const required = [];
    if (choice.pendingAttestationIds?.length) {
      required.push(el("li", "pending", `${choice.pendingAttestationIds.length} agent-relayed statement${choice.pendingAttestationIds.length === 1 ? "" : "s"} awaiting your confirmation below.`));
    }
    if (choice.requiredChecks.length) {
      required.push(...choice.requiredChecks.map((type) => el("li", "required", `${friendly(type)} still required`)));
    } else if (!mismatch) {
      required.push(el("li", "complete", "Barcode and ingredients attestations match the package."));
    }
    els.requiredChecks.replaceChildren(...required);

    els.choiceVerdict.hidden = !mismatch;
    els.choiceVerdict.textContent = mismatch
      ? "Do not use this community record for the package in hand. A package statement confirmed by the person conflicts with the Open Food Facts record."
      : "";
    els.correctionLink.hidden = !mismatch;
    els.correctionLink.href = choice.correctionUrl;

    els.consent.disabled = approved || mismatch || choice.requiredChecks.length > 0 || choice.pendingAttestationIds?.length > 0;
    els.consent.checked = approved;
    els.approve.disabled = approved || mismatch || choice.requiredChecks.length > 0 || choice.pendingAttestationIds?.length > 0 || !els.consent.checked;
    els.approve.textContent = approved ? "Approved by the person" : mismatch ? "Approval blocked by mismatch" : "Approve this attested match";
    els.approvalNote.textContent = approved
      ? `Approved ${dateTime.format(new Date(choice.approvedAt))}. A verified label summary is now available to the person and agent.`
      : mismatch
        ? "The package remains authoritative. Review or correct the community record before using it for this package."
        : "Label Relay records your attestation; it cannot see whether you actually looked at the package. No WebMCP tool can confirm or approve for you.";
    renderVerifiedOutcome(state);
  }

  function renderActivity(state) {
    els.activity.replaceChildren(...state.activity.slice(0, 10).map((item) => {
      const li = el("li", "activity-item");
      li.append(
        el("strong", "", `${item.actor} · ${item.action}`),
        el("span", "", item.detail),
        el("time", "", dateTime.format(new Date(item.at)))
      );
      return li;
    }));
  }

  function renderTools() {
    els.tools.replaceChildren(...tools.map((tool) => {
      const item = el("div", "tool-chip");
      item.append(
        el("code", "", tool.name),
        el("small", "", tool.annotations.readOnlyHint ? "Reads shared state" : "Updates visible shared state")
      );
      return item;
    }));
  }

  function renderDecision(state) {
    if (!state.decisionRequest || !state.stagedChoice) return;
    els.decisionReason.textContent = state.decisionRequest.reason;
    const choice = state.stagedChoice;
    els.decisionSummary.textContent = choice.status === "record_mismatch"
      ? `${choice.name}; a confirmed mismatch blocks approval. Review the package statement and correction link.`
      : `${choice.name}; ${choice.requiredChecks.length} required check(s) and ${choice.pendingAttestationIds?.length ?? 0} pending confirmation(s) remain; no approval recorded.`;
    if (!els.decision.open) els.decision.showModal();
  }

  function render(state) {
    renderSearch(state);
    renderChecks(state);
    renderComparison(state);
    renderChoice(state);
    renderActivity(state);
    renderDecision(state);
  }

  renderTools();
  render(store.getState());
  store.subscribe(render);
  return { renderStatus, render };
}
