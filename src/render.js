import { computeCaseConfidence } from "./engine.js";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function riskLabel(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)} risk`;
}

export function createRenderer({ store, tools, actions }) {
  const els = {
    webmcpStatus: document.querySelector("#webmcp-status"),
    deviceModel: document.querySelector("#device-model"),
    budget: document.querySelector("#budget"),
    riskLimit: document.querySelector("#risk-limit"),
    caseConfidence: document.querySelector("#case-confidence"),
    evidenceCount: document.querySelector("#evidence-count"),
    evidenceList: document.querySelector("#evidence-list"),
    rankingState: document.querySelector("#ranking-state"),
    recommendationEmpty: document.querySelector("#recommendation-empty"),
    recommendationResults: document.querySelector("#recommendation-results"),
    rankingExplanation: document.querySelector("#ranking-explanation"),
    productList: document.querySelector("#product-list"),
    comparisonPanel: document.querySelector("#comparison-panel"),
    comparisonWrap: document.querySelector("#comparison-table-wrap"),
    planStatus: document.querySelector("#plan-status"),
    planEmpty: document.querySelector("#plan-empty"),
    planCard: document.querySelector("#plan-card"),
    planRisk: document.querySelector("#plan-risk"),
    planVersion: document.querySelector("#plan-version"),
    planTitle: document.querySelector("#plan-title"),
    planSteps: document.querySelector("#plan-steps"),
    planAssumptions: document.querySelector("#plan-assumptions"),
    approvalCheckbox: document.querySelector("#approval-checkbox"),
    approveButton: document.querySelector("#approve-button"),
    approvalNote: document.querySelector("#approval-note"),
    lunaSummary: document.querySelector("#luna-summary"),
    lunaSuggestions: document.querySelector("#luna-suggestions"),
    lunaTimestamp: document.querySelector("#luna-timestamp"),
    activityLog: document.querySelector("#activity-log"),
    toolList: document.querySelector("#tool-list"),
    decisionDialog: document.querySelector("#decision-dialog"),
    decisionReason: document.querySelector("#decision-reason"),
    decisionSummary: document.querySelector("#decision-summary")
  };

  function renderStatus(status) {
    els.webmcpStatus.textContent = "";
    const dot = element("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    els.webmcpStatus.append(dot, document.createTextNode(status.message));
    els.webmcpStatus.className = `status-pill ${status.supported ? "status-ready" : "status-neutral"}`;
  }

  function renderEvidence(state) {
    els.evidenceCount.textContent = String(state.evidence.length);
    els.evidenceList.replaceChildren(
      ...state.evidence.map((item) => {
        const li = element("li", "evidence-item");
        li.dataset.source = item.source;
        const p = element("p", "", item.text);
        const meta = element("div", "evidence-meta");
        meta.append(
          element("span", "evidence-tag", item.tag),
          element("span", "", `${Math.round(item.confidence * 100)}% confidence`),
          element("span", "", item.source === "agent" ? "recorded through agent" : "recorded by person")
        );
        li.append(p, meta);
        return li;
      })
    );
  }

  function renderProducts(state) {
    const search = state.search;
    const hasResults = Boolean(search?.results?.length);
    els.recommendationEmpty.hidden = hasResults;
    els.recommendationResults.hidden = !hasResults;

    if (!hasResults) {
      els.rankingState.textContent = "Awaiting search";
      els.productList.replaceChildren();
      return;
    }

    els.rankingState.textContent = `${search.results.length} ranked`;
    els.rankingExplanation.textContent = search.explanation;
    els.productList.replaceChildren(
      ...search.results.map((item, index) => {
        const li = element("li", `product-card${index === 0 ? " top" : ""}`);
        const rank = element("span", "product-rank", String(index + 1));
        const body = element("div");
        const title = element("h3", "", item.name);
        const description = element("p", "", item.description);
        const facts = element("div", "product-facts");
        facts.append(
          element("span", "", money.format(item.price)),
          element("span", "", `${item.confidence}% fit`),
          element("span", "", item.compatibility.label),
          element("span", "", riskLabel(item.repairRisk)),
          element("span", "", `${item.leadDays} day lead`)
        );
        const breakdown = element("div", "score-breakdown");
        for (const reason of item.reasons.filter((entry) => entry.points > 0).slice(0, 3)) {
          breakdown.append(element("span", "", `+${reason.points} ${reason.label}`));
        }
        const actionsWrap = element("div", "product-actions");
        const compare = element("button", "button button-quiet", "Compare");
        compare.type = "button";
        compare.addEventListener("click", () => actions.toggleCompare(item.id));
        const stage = element("button", "button button-primary", "Stage plan");
        stage.type = "button";
        stage.addEventListener("click", () => actions.stagePlan(item.id));
        actionsWrap.append(compare, stage);
        body.append(title, description, facts, breakdown, actionsWrap);
        li.append(rank, body);
        return li;
      })
    );
  }

  function renderComparison(state) {
    if (state.comparison.length < 2) {
      els.comparisonPanel.hidden = true;
      els.comparisonWrap.replaceChildren();
      return;
    }
    els.comparisonPanel.hidden = false;
    const table = element("table", "comparison-table");
    const thead = element("thead");
    const headRow = element("tr");
    ["Candidate", "Price", "Fit", "Compatibility", "Risk", "Lead"].forEach((label) => {
      headRow.append(element("th", "", label));
    });
    thead.append(headRow);
    const tbody = element("tbody");
    for (const item of state.comparison) {
      const row = element("tr");
      row.append(
        element("td", "", item.name),
        element("td", "", money.format(item.price)),
        element("td", "", `${item.confidence}%`),
        element("td", "", item.compatibility),
        element("td", "", item.risk),
        element("td", "", `${item.leadDays} days`)
      );
      tbody.append(row);
    }
    table.append(thead, tbody);
    els.comparisonWrap.replaceChildren(table);
  }

  function renderPlan(state) {
    const plan = state.stagedPlan;
    els.planEmpty.hidden = Boolean(plan);
    els.planCard.hidden = !plan;

    if (!plan) {
      els.planStatus.textContent = "No draft";
      els.planStatus.className = "status-pill status-neutral";
      els.approvalCheckbox.checked = false;
      els.approveButton.disabled = true;
      return;
    }

    const approved = plan.status === "approved";
    els.planStatus.textContent = approved ? "Human approved" : "Staged · unapproved";
    els.planStatus.className = `status-pill ${approved ? "status-ready" : "status-warning"}`;
    els.planRisk.textContent = riskLabel(plan.risk);
    els.planVersion.textContent = `Draft ${plan.version}`;
    els.planTitle.textContent = plan.title;
    els.planSteps.replaceChildren(
      ...plan.steps.map((step) => {
        const li = element("li");
        li.append(
          element("strong", "", step.title),
          document.createTextNode(` — ${step.detail}`),
          element("span", "stop-condition", `Stop condition: ${step.stopCondition}`)
        );
        return li;
      })
    );
    els.planAssumptions.replaceChildren(...plan.assumptions.map((assumption) => element("li", "", assumption)));

    els.approvalCheckbox.disabled = approved;
    els.approvalCheckbox.checked = approved;
    els.approveButton.disabled = approved || !els.approvalCheckbox.checked;
    els.approveButton.textContent = approved ? "Approved by the person" : "Approve as the person at the bench";
    els.approvalNote.textContent = approved
      ? `Approval recorded ${new Date(plan.approvedAt).toLocaleString()}.`
      : "No agent tool has approval authority.";
  }

  function renderLuna(state) {
    const review = state.luna;
    if (!review) return;
    els.lunaSummary.textContent = `${review.score}/${review.maxScore}. ${Object.values(review.dimensions).filter((score) => score === 5).length}/6 dimensions at full score.`;
    els.lunaSuggestions.replaceChildren(
      ...(review.suggestions.length
        ? review.suggestions.map((suggestion) => element("li", "", suggestion))
        : [element("li", "", "No blocking improvement found. Preserve the authority boundary.")])
    );
    els.lunaTimestamp.textContent = `Last run ${time.format(new Date(review.reviewedAt))} · reruns after changes and every 60 seconds`;
  }

  function renderActivity(state) {
    els.activityLog.replaceChildren(
      ...state.activity.slice(0, 8).map((item) => {
        const li = element("li", "activity-item");
        li.append(
          element("strong", "", `${item.actor} · ${item.action}`),
          element("span", "", item.detail),
          element("time", "", time.format(new Date(item.at)))
        );
        return li;
      })
    );
  }

  function renderTools() {
    els.toolList.replaceChildren(
      ...tools.map((tool) => {
        const item = element("div", "tool-chip");
        item.append(
          element("code", "", tool.name),
          element("small", "", tool.annotations?.readOnlyHint ? "Read-only" : "Updates visible state")
        );
        return item;
      })
    );
  }

  function renderDecision(state) {
    if (!state.decisionRequest || !state.stagedPlan) return;
    els.decisionReason.textContent = state.decisionRequest.reason;
    els.decisionSummary.textContent = `${state.stagedPlan.title}. ${state.stagedPlan.steps.length} visible steps; ${state.stagedPlan.risk} risk; still unapproved.`;
    if (!els.decisionDialog.open) els.decisionDialog.showModal();
  }

  function render(state) {
    els.deviceModel.textContent = `${state.device.model} · ${state.device.voltage} V`;
    els.budget.textContent = money.format(state.constraints.budget);
    els.riskLimit.textContent = state.constraints.maxRisk[0].toUpperCase() + state.constraints.maxRisk.slice(1);
    els.caseConfidence.textContent = `${computeCaseConfidence(state)}%`;
    renderEvidence(state);
    renderProducts(state);
    renderComparison(state);
    renderPlan(state);
    renderLuna(state);
    renderActivity(state);
    renderDecision(state);
  }

  renderTools();
  render(store.getState());
  store.subscribe(render);

  return { renderStatus, render, elements: els };
}
