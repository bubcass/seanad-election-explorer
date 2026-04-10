---
title: "Seanad Éireann"
header: false
sidebar: false
footer: false
toc: false
---

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";
import { electionBarRace } from "./components/electionBarRace.js";
import { panelSelect } from "./components/panel-select.js";
import { renderTimelineControls } from "./components/renderTimelineControls.js";

const format = d3.format(",d");
const heroImagePromise = FileAttachment("media/seanad_election.jpg").url();

const normalisedPromise = FileAttachment(
  "data/derived/election-2025-normalised.json"
).json();

const finalRowsPromise = FileAttachment(
  "data/derived/election-2025-final-rows.json"
).json();

const barRacePromise = FileAttachment(
  "data/derived/bar-race.json"
).json();

const seanadMembersPromise = FileAttachment(
  "data/seanad-members.json"
).json();

const subPanelColorMap = new Map([
  ["Nominating Bodies", "#1f77b4"],
  ["Oireachtas", "#ff7f0e"]
]);

const statusColorMap = new Map([
  ["Deemed Elected", "#ff7f0e"],
  ["Continuing", "#1f77b4"],
  ["Excluded", "#dadbdc"]
]);

if (typeof window !== "undefined" && !window.__electionsResizeObserver) {
  let resizeRaf = null;
  let lastHeight = 0;

  window.__electionsResizeObserver = new ResizeObserver(([entry]) => {
    const nextHeight = entry.target.scrollHeight;
    if (nextHeight === lastHeight) return;
    lastHeight = nextHeight;

    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      parent.postMessage({ height: nextHeight }, "*");
    });
  });

  window.__electionsResizeObserver.observe(document.body);
}

if (!window.electionsState) {
  window.electionsState = {
    panel: null,
    count: null,
    colorMode: "subPanel",
    tableSort: "status",
    candidateFocus: null
  };
}

function getState() {
  return window.electionsState;
}

function chartPlaceholder(height = 320, text = "Updating…") {
  const wrap = document.createElement("div");
  wrap.className = "chart-loading";
  wrap.style.minHeight = `${height}px`;
  wrap.style.display = "grid";
  wrap.style.alignItems = "center";
  wrap.style.justifyItems = "center";
  wrap.style.border = "1px solid var(--border)";
  wrap.style.background = "rgba(255,255,255,0.55)";
  wrap.style.padding = "1rem";
  wrap.textContent = text;
  return wrap;
}

function mountReactive(className, renderFn, options = {}) {
  if (typeof className === "function") {
    options = renderFn ?? {};
    renderFn = className;
    className = "";
  }

  const { debounceMs = 50, skeletonDelay = 120 } = options;
  const el = document.createElement("div");
  if (className) el.className = className;

  let timeoutId = null;
  let runId = 0;
  let hasRenderedOnce = false;

  const run = () => {
    const currentRun = ++runId;

    requestAnimationFrame(async () => {
      const isCurrent = () => currentRun === runId;

      if (!hasRenderedOnce) {
        await renderFn(el, { skeletonOnly: true, isCurrent });
        await new Promise((resolve) => setTimeout(resolve, skeletonDelay));
        if (!isCurrent()) return;
      }

      await renderFn(el, { skeletonOnly: false, isCurrent });

      if (isCurrent()) hasRenderedOnce = true;
    });
  };

  run();

  const onChange = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(run, debounceMs);
  };

  window.addEventListener("elections:change", onChange);
  return el;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalPersonName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fixPlotAria(svgOrRoot) {
  const root =
    svgOrRoot instanceof SVGElement
      ? svgOrRoot
      : svgOrRoot?.querySelector?.("svg");

  if (!root) return;

  root.querySelectorAll("g[aria-label]").forEach((node) => {
    const role = node.getAttribute("role");
    const labelledBy = node.getAttribute("aria-labelledby");

    if (!role && !labelledBy) {
      node.removeAttribute("aria-label");
    }
  });
}

function renderColorLegend(colorChoice) {
  const wrap = document.createElement("div");
  wrap.className = "election-legend";

  const items = document.createElement("div");
  items.className = "election-legend__items";

  colorChoice.domain.forEach((label, i) => {
    const item = document.createElement("div");
    item.className = "election-legend__item";

    const swatch = document.createElement("span");
    swatch.className = "election-legend__swatch";
    swatch.style.background = colorChoice.range[i] ?? "#666666";

    const text = document.createElement("span");
    text.className = "election-legend__label";
    text.textContent = label;

    item.appendChild(swatch);
    item.appendChild(text);
    items.appendChild(item);
  });

  wrap.appendChild(items);
  return wrap;
}

function renderStatusLegend() {
  return renderColorLegend({
    domain: ["Deemed Elected", "Continuing", "Excluded"],
    range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
  });
}

function renderSegmentedControl({
  label = "",
  name = "",
  options = [],
  value = "",
  onChange = () => {}
} = {}) {
  const wrap = document.createElement("div");
  wrap.className = "segmented-control-wrap";

  const group = document.createElement("div");
  group.className = "segmented-control";
  group.setAttribute("role", "radiogroup");
  if (label) group.setAttribute("aria-label", label);

  for (const option of options) {
    const controlId = `${name}-${String(option.value)
      .replace(/\s+/g, "-")
      .toLowerCase()}`;

    const labelEl = document.createElement("label");
    labelEl.className = "segmented-control__option";
    labelEl.setAttribute("for", controlId);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = controlId;
    input.value = option.value;
    input.checked = option.value === value;

    input.addEventListener("change", () => {
      if (input.checked) onChange(option.value);
    });

    const text = document.createElement("span");
    text.textContent = option.label;

    labelEl.appendChild(input);
    labelEl.appendChild(text);
    group.appendChild(labelEl);
  }

  wrap.appendChild(group);
  return wrap;
}

async function getResults() {
  const payload = await normalisedPromise;
  return payload.data ?? [];
}

async function getFinalRows() {
  const payload = await finalRowsPromise;
  return payload.data ?? [];
}

async function getSeanadMembers() {
  return await seanadMembersPromise;
}

async function getAvailablePanels() {
  const rows = await getResults();
  return Array.from(new Set(rows.map((d) => d.panel).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "en")
  );
}

async function getCandidateOptions() {
  const rows = await getResults();
  const panel = await ensureValidPanelSelection();

  if (!panel) return [];

  return Array.from(
    new Set(
      rows
        .filter((d) => d.panel === panel)
        .map((d) => clean(d.name))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "en"));
}

async function ensureValidCandidateFocus() {
  const options = await getCandidateOptions();

  if (!options.length) {
    window.electionsState.candidateFocus = null;
    return null;
  }

  if (
    !window.electionsState.candidateFocus ||
    !options.includes(window.electionsState.candidateFocus)
  ) {
    window.electionsState.candidateFocus = options[0];
  }

  return window.electionsState.candidateFocus;
}

async function getCandidateRecord() {
  const rows = await getResults();
  const panel = await ensureValidPanelSelection();
  const candidate = await ensureValidCandidateFocus();

  if (!panel || !candidate) return [];

  return rows
    .filter(
      (d) => d.panel === panel && clean(d.name) === clean(candidate)
    )
    .map((d) => ({
      ...d,
      displayName: clean(d.name)
    }))
    .sort((a, b) => d3.ascending(a.count, b.count));
}

async function getCandidateNarrative() {
  const candidateRecord = await getCandidateRecord();
  if (!candidateRecord.length) return "";

  const latest = candidateRecord[candidateRecord.length - 1];
  const firstQuotaHit = candidateRecord.find(
    (d) => Number(d.votes ?? 0) >= Number(d.quota ?? Infinity)
  );

  if (firstQuotaHit) {
    return `<strong>${latest.displayName}</strong> ran on the <strong>${latest.subPanel ?? "Unknown"}</strong> sub-panel and exceeded the quota on count No. <strong>${firstQuotaHit.count}</strong>.`;
  }

  return `<strong>${latest.displayName}</strong> ran on the <strong>${latest.subPanel ?? "Unknown"}</strong> subpanel and did not exceed the quota.`;
}

async function ensureValidPanelSelection() {
  const panels = await getAvailablePanels();

  if (!panels.length) {
    window.electionsState.panel = null;
    return null;
  }

  if (!window.electionsState.panel || !panels.includes(window.electionsState.panel)) {
    window.electionsState.panel = panels[0];
  }

  return window.electionsState.panel;
}

function getMemberPageUrl(code) {
  const cleaned = clean(code);
  return cleaned
    ? `https://www.oireachtas.ie/en/members/member/${cleaned}`
    : null;
}

function getMemberImageUrl(code) {
  const cleaned = clean(code);
  return cleaned
    ? `https://data.oireachtas.ie/ie/oireachtas/member/id/${cleaned}/image/large`
    : null;
}

async function getPanelSummary() {
  const rows = await getFinalRows();
  const panel = await ensureValidPanelSelection();

  if (!panel) return null;

  const filtered = rows
    .filter((d) => d.panel === panel)
    .sort((a, b) => d3.descending(a.votes, b.votes));

  if (!filtered.length) return null;

  const elected = filtered
    .filter((d) => d.status === "Deemed Elected")
    .sort((a, b) => {
      const aPos = Number.isFinite(a.electedPosition) ? a.electedPosition : 999;
      const bPos = Number.isFinite(b.electedPosition) ? b.electedPosition : 999;
      return d3.ascending(aPos, bPos) || d3.descending(a.votes, b.votes);
    });

  return {
    panel,
    quota: filtered[0].quota,
    totalCandidates: filtered.length,
    elected,
    finalRows: filtered
  };
}

async function getMatchedElectedMembers() {
  const [summary, members] = await Promise.all([
    getPanelSummary(),
    getSeanadMembers()
  ]);

  if (!summary?.elected?.length) return [];

  const membersInPanel = members.filter(
    (d) => clean(d.Constituency) === clean(summary.panel)
  );

  return summary.elected
    .map((row) => {
      const matched =
        membersInPanel.find(
          (m) =>
            canonicalPersonName(m.Senator) ===
            canonicalPersonName(row.name)
        ) ?? null;

      const code = matched?.Code ?? null;

      return {
        ...row,
        displayName: matched?.Senator ?? row.name,
        matchedParty: matched?.Party ?? null,
        memberUrl: getMemberPageUrl(code),
        imageUrl: getMemberImageUrl(code),
        subPanel: row.subPanel ?? null
      };
    })
    .sort((a, b) => {
      const aPos = Number.isFinite(a.electedPosition) ? a.electedPosition : 999;
      const bPos = Number.isFinite(b.electedPosition) ? b.electedPosition : 999;
      return d3.ascending(aPos, bPos) || d3.ascending(a.displayName, b.displayName);
    });
}

async function getBarRacePanel() {
  const data = await barRacePromise;
  const panel = await ensureValidPanelSelection();

  if (!panel) return null;

  return data.find((d) => d.panel === panel) ?? null;
}

async function getCountRows() {
  const rows = await getResults();
  const panel = await ensureValidPanelSelection();
  const { count } = getState();

  if (!panel) return [];

  let filtered = rows.filter((d) => d.panel === panel);

  const availableCounts = Array.from(
    new Set(filtered.map((d) => d.count).filter(Number.isFinite))
  ).sort((a, b) => a - b);

  const activeCount = Number.isFinite(count)
    ? count
    : availableCounts[availableCounts.length - 1];

  filtered = filtered.filter((d) => d.count === activeCount);

  return filtered.sort((a, b) => d3.descending(a.votes, b.votes));
}

async function getActiveCountLabel() {
  const rows = await getResults();
  const panel = await ensureValidPanelSelection();
  const { count } = getState();

  if (!panel) {
    return { activeCount: null, maxCount: null };
  }

  const panelRows = rows.filter((d) => d.panel === panel);
  const availableCounts = Array.from(
    new Set(panelRows.map((d) => d.count).filter(Number.isFinite))
  ).sort((a, b) => a - b);

  const activeCount = Number.isFinite(count)
    ? count
    : availableCounts[availableCounts.length - 1];

  return {
    activeCount,
    maxCount: availableCounts[availableCounts.length - 1] ?? activeCount ?? 1
  };
}

async function getWaffleRows() {
  const rows = await getCountRows();
  const summary = await getPanelSummary();

  if (!rows.length || !summary) return { rows: [], quota: 0 };

  const quota = summary.quota ?? 0;

  const prepared = rows
    .map((d) => ({
      ...d,
      displayName: clean(d.name),
      surnameKey: clean(d.surname ?? d.name).toLowerCase(),
      quotaPct: quota > 0 ? (d.votes / quota) * 100 : 0
    }))
    .sort((a, b) => d3.ascending(a.surnameKey, b.surnameKey));

  return { rows: prepared, quota };
}

function splitIntoTwoRows(rows) {
  if (!rows.length) return [[], []];
  const half = Math.ceil(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)];
}

function renderQuotaWaffleChunk(rows, { width = 1000 } = {}) {
  const backgroundRows = rows.map((d) => ({
    ...d,
    baseline: 100
  }));

  const wrap = document.createElement("div");
  wrap.className = "election-waffle-chart";
  wrap.style.position = "relative";

  const tooltip = document.createElement("div");
  tooltip.className = "election-hover-tooltip";
  tooltip.style.position = "absolute";
  tooltip.style.pointerEvents = "none";
  tooltip.style.opacity = "0";
  tooltip.style.zIndex = "40";

  const chart = Plot.plot({
    style: {
      fontFamily: "IBM Plex Sans",
      fontSize: 11,
      padding: "5px"
    },
    color: {
      legend: false,
      domain: ["Deemed Elected", "Continuing", "Excluded"],
      range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
    },
    axis: null,
    width,
    label: null,
    height: 300,
    marginTop: 12,
    marginBottom: 90,
    fx: {
      padding: 0.3,
      domain: rows.map((d) => d.displayName)
    },
    marks: [
      Plot.axisFx({
        lineWidth: 1,
        anchor: "bottom",
        dy: 30,
        fontWeight: "bold"
      }),
      Plot.waffleY(backgroundRows, {
        fx: "displayName",
        y: "baseline",
        fill: "#d8d1c2",
        fillOpacity: 0.7,
        rx: "100%"
      }),
      Plot.waffleY(rows, {
        fx: "displayName",
        y: (d) => d.quotaPct,
        fill: "status",
        rx: "100%"
      }),
      Plot.text(rows, {
        fx: "displayName",
        text: (d) => `${Math.floor(d.quotaPct)}%`,
        frameAnchor: "bottom",
        lineAnchor: "top",
        dy: 8,
        fill: (d) => (d.quotaPct > 0 ? d.status : "#c6c2b9"),
        fontSize: 20,
        fontFamily: "IBM Plex Sans",
        fontWeight: "bold"
      })
    ]
  });

  fixPlotAria(chart);

  const overlay = document.createElement("div");
  overlay.className = "election-waffle-overlay";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.display = "grid";
  overlay.style.gridTemplateColumns = `repeat(${rows.length}, minmax(0, 1fr))`;
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "20";

  rows.forEach((d) => {
    const zone = document.createElement("div");
    zone.className = "election-waffle-overlay__zone";
    zone.style.pointerEvents = "auto";
    zone.style.cursor = "pointer";
    zone.style.minWidth = "0";

    zone.addEventListener("mousemove", (event) => {
      tooltip.innerHTML = `
        <div><strong>${d.displayName}</strong></div>
        <div>Votes: ${format(d.votes)}</div>
        <div>Sub-panel: ${d.subPanel ?? "—"}</div>
        <div>Status: ${d.status ?? "—"}</div>
      `;

      const wrapRect = wrap.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || 180;
      const tooltipHeight = tooltip.offsetHeight || 72;

      let left = event.clientX - wrapRect.left + 12;
      let top = event.clientY - wrapRect.top - 12;

      if (left + tooltipWidth > wrapRect.width - 8) {
        left = wrapRect.width - tooltipWidth - 8;
      }

      if (top + tooltipHeight > wrapRect.height - 8) {
        top = wrapRect.height - tooltipHeight - 8;
      }

      if (top < 8) top = 8;
      if (left < 8) left = 8;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.opacity = "1";
    });

    zone.addEventListener("mouseleave", () => {
      tooltip.style.opacity = "0";
    });

    overlay.appendChild(zone);
  });

  wrap.addEventListener("mouseleave", () => {
    tooltip.style.opacity = "0";
  });

  wrap.appendChild(chart);
  wrap.appendChild(overlay);
  wrap.appendChild(tooltip);

  return wrap;
}

function getLollipopColorChoice(mode = "subPanel") {
  if (mode === "status") {
    return {
      label: "Status in poll",
      domain: ["Deemed Elected", "Continuing", "Excluded"],
      range: ["#ff7f0e", "#1f77b4", "#dadbdc"],
      value: (d) => d.status ?? "Continuing"
    };
  }

  return {
    label: "Sub-panel type",
    domain: ["Nominating Bodies", "Oireachtas"],
    range: ["#1f77b4", "#ff7f0e"],
    value: (d) => d.subPanel ?? "Nominating Bodies"
  };
}

async function getLollipopRows() {
  const [rows, summary, { activeCount }] = await Promise.all([
    getCountRows(),
    getPanelSummary(),
    getActiveCountLabel()
  ]);

  if (!rows.length || !summary) {
    return { rows: [], quota: 0, count: activeCount };
  }

  const prepared = rows
    .map((d) => ({
      ...d,
      displayName: clean(d.name)
    }))
    .sort((a, b) => {
      const aPos = Number.isFinite(a.position) ? a.position : 999;
      const bPos = Number.isFinite(b.position) ? b.position : 999;
      return d3.ascending(aPos, bPos) || d3.descending(a.votes, b.votes);
    });

  return {
    rows: prepared,
    quota: summary.quota ?? 0,
    count: activeCount
  };
}

function renderLollipopChart(
  rows,
  {
    width = 790,
    quota = 0,
    count = null,
    colorMode = "subPanel"
  } = {}
) {
  const colorChoice = getLollipopColorChoice(colorMode);

  const chartRows = rows.map((d) => ({
    ...d,
    colorKey: colorChoice.value(d) ?? colorChoice.domain[0]
  }));

  const yDomain = chartRows
    .slice()
    .sort((a, b) => {
      const aPos = Number.isFinite(a.position) ? a.position : 999;
      const bPos = Number.isFinite(b.position) ? b.position : 999;
      return d3.ascending(aPos, bPos) || d3.descending(a.votes, b.votes);
    })
    .map((d) => d.displayName ?? d.name);

  const chart = Plot.plot({
    width,
    height: Math.max(420, chartRows.length * 30 + 70),
    marginBottom: 45,
    marginLeft: 210,
    marginRight: 90,
    color: {
      legend: false,
      domain: colorChoice.domain,
      range: colorChoice.range
    },
    style: {
      fontSize: 14,
      fontFamily: "IBM Plex Sans"
    },
    x: {
      tickPadding: 6,
      tickSize: 5,
      grid: true,
      tickRotate: -10,
      label: "Votes"
    },
    y: {
      label: null,
      tickSize: 0,
      domain: yDomain
    },
    marks: [
      Plot.ruleX([quota], {
        stroke: "#6b5922",
        strokeWidth: 2,
        strokeDasharray: "4,4"
      }),
      Plot.ruleY(chartRows, {
        x: "votes",
        y: "displayName",
        strokeWidth: 2,
        stroke: "colorKey",
        title: (d) =>
          `After count No. ${d.count}, ${d.displayName ?? d.name} had ${format(
            d.votes
          )} votes. Quota: ${format(quota)}.`
      }),
      Plot.text(
        chartRows.filter((d) => d.votes > 0),
        {
          x: "votes",
          y: "displayName",
          text: (d) => format(d.votes),
          dx: 30,
          dy: 0,
          textAnchor: "start",
          fill: "#4a463d",
          fontSize: 12
        }
      ),
      Plot.dot(chartRows, {
        x: "votes",
        y: "displayName",
        fill: "colorKey",
        r: 5,
        title: (d) =>
          `After count No. ${d.count}, ${d.displayName ?? d.name} had ${format(
            d.votes
          )} votes. Quota: ${format(quota)}.`
      })
    ]
  });

  fixPlotAria(chart);
  return chart;
}
```

```js
display(
  mountReactive("hero", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `<div class="hero__media skeleton-shimmer"></div>`;
      return;
    }

    const heroImage = await heroImagePromise;
    if (!isCurrent()) return;

    el.innerHTML = `
      <div class="hero__media">
        <img
          class="hero__image"
          src="${heroImage}"
          alt="Seanad chamber"
        />
      </div>
      <div class="hero__overlay">
        <div class="hero__content">
          <p class="hero__eyebrow">Open data insights</p>
          <h1 class="hero__title">Election Explorer: 27th Seanad</h1>
          <p class="hero__subtitle">
            A data-driven exploration of the 2025 Seanad general election.
          </p>
        </div>
      </div>
    `;
  })
);
```

<div class="prose-block">

The 2025 Seanad election returned Senators across the vocational panels. Take a look at how the election unfolded by panel, count and candidate.

</div>

```js
display(
  mountReactive("panel-top-panel", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <section class="panel-top">
          <div class="panel-top__row">
            <div class="panel-top__info">
              <div class="text-skeleton">
                <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
                <div class="text-skeleton__line text-skeleton__line--w100 skeleton-shimmer"></div>
                <div class="text-skeleton__line text-skeleton__line--w92 skeleton-shimmer"></div>
              </div>
            </div>
          </div>
          <div class="cards-skeleton">
            <div class="cards-skeleton__inner cards-skeleton__inner--winners">
              ${Array.from({ length: 11 }).map(() => `
                <div class="cards-skeleton__card cards-skeleton__card--winner">
                  <div class="cards-skeleton__avatar skeleton-shimmer"></div>
                  <div class="cards-skeleton__line cards-skeleton__line--name skeleton-shimmer"></div>
                  <div class="cards-skeleton__line cards-skeleton__line--short skeleton-shimmer"></div>
                </div>
              `).join("")}
            </div>
          </div>
        </section>
      `;
      return;
    }

    if (!isCurrent()) return;

    const section = document.createElement("section");
    section.className = "panel-top";

    const row = document.createElement("div");
    row.className = "panel-top__row";

    const info = document.createElement("div");
    info.className = "panel-top__info";

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "panel-top__cards";

    info.appendChild(
      panelSelect({
        state: window.electionsState,
        resultsPromise: getResults(),
        onChange: () => {
          window.electionsState.count = null;
          window.electionsState.candidateFocus = null;
          window.dispatchEvent(new CustomEvent("elections:change"));
        }
      })
    );

    const [summary, members] = await Promise.all([
      getPanelSummary(),
      getMatchedElectedMembers()
    ]);

    if (!isCurrent()) return;

    if (!summary) {
      const empty = document.createElement("div");
      empty.className = "panel-top__summary";
      empty.innerHTML = `<p>Select a panel to view summary information.</p>`;
      info.appendChild(empty);

      row.appendChild(info);
      section.appendChild(row);
      el.replaceChildren(section);
      return;
    }

    const summaryBlock = document.createElement("div");
    summaryBlock.className = "panel-top__summary";

    const electedNames = members
      .map((d) => d.displayName ?? d.name)
      .join(", ");

    summaryBlock.innerHTML = `
      <h2>Elected Members</h2>
      <p>
        The <strong>${summary.panel}</strong> returned <strong>${summary.elected.length}</strong>
        Senators.
      </p>
      <p>
        A total of <strong>${summary.totalCandidates}</strong> candidates contested the panel.
        Those deemed elected were <strong>${electedNames}</strong>.
      </p>
      <p>
        The quota was <strong>${format(summary.quota)}</strong>.
      </p>
    `;

    info.appendChild(summaryBlock);

    if (!members.length) {
      const noCards = document.createElement("p");
      noCards.className = "chart-loading";
      noCards.textContent = "No elected member cards available for this panel.";
      cardsWrap.appendChild(noCards);
    } else {
      const cardsGrid = document.createElement("div");
      cardsGrid.className = "elected-strip";
      cardsGrid.dataset.count = String(members.length);

      for (const member of members) {
        const subPanel = member.subPanel || "Unknown";
        const color = subPanelColorMap.get(subPanel) ?? "#666666";

        const wrapper = document.createElement(member.memberUrl ? "a" : "div");
        wrapper.className = member.memberUrl
          ? "elected-strip__card-link"
          : "elected-strip__card-link elected-strip__card-link--static";

        if (member.memberUrl) {
          wrapper.href = member.memberUrl;
          wrapper.target = "_blank";
          wrapper.rel = "noreferrer";
        }

        const imageMarkup = member.imageUrl
          ? `
            <img
              class="elected-strip__image"
              src="${member.imageUrl}"
              alt="${member.displayName}"
              loading="lazy"
            />
          `
          : `
            <div class="elected-strip__placeholder">
              ${member.displayName.slice(0, 1)}
            </div>
          `;

        wrapper.innerHTML = `
          <article class="elected-strip__card">
            <div class="elected-strip__media" style="--party-color:${color}">
              <div class="elected-strip__ring">
                ${imageMarkup}
              </div>
            </div>
            <div class="elected-strip__name">${member.displayName}</div>
            <div class="elected-strip__party">${subPanel}</div>
          </article>
        `;

        cardsGrid.appendChild(wrapper);
      }

      cardsWrap.appendChild(cardsGrid);
    }

    row.appendChild(info);
    section.appendChild(row);
    section.appendChild(cardsWrap);

    el.replaceChildren(section);
  })
);
```

<div class="chart-block chart-block--wide">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(640));
      return;
    }

    const selected = await getBarRacePanel();

    if (!isCurrent()) return;

    if (!selected) {
      el.innerHTML = `<p class="chart-loading">No bar-race data available for this panel.</p>`;
      return;
    }

    const chart = electionBarRace({
      data: selected,
      width: Math.max(760, Math.floor(el.clientWidth || 960)),
      visibleBars: 11,
      barSize: 42,
      duration: 180
    });

    el.replaceChildren(chart);
  }, { debounceMs: 80, skeletonDelay: 120 })
);
```

</div>

<div class="prose-block">
  <h2>Explore the election as it happened</h2>
  <p>Take an interactive look at how the Seanad general election unfolded in 2025 and the story of each count.</p>
</div>

<div class="section-driver-block section-driver-block--timeline">
  <div class="section-driver-block__control">

```js
renderTimelineControls({
  state: window.electionsState,
  resultsPromise: getResults(),
  getPanel: () => getState().panel,
  onChange: () => {
    window.dispatchEvent(new CustomEvent("elections:change"));
  }
})
```

  </div>

  <div class="section-driver-block__intro">
    <p>
      Seanad panel elections unfold over multiple counts, with exclusions and transfers changing the standing of candidates. Chart shows the percentage of quota attained by each candidate at the selected count.
    </p>
  </div>
</div>

<div class="chart-block chart-block--wide">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(700));
      return;
    }

    const { rows } = await getWaffleRows();

    if (!isCurrent()) return;

    if (!rows.length) {
      el.innerHTML = `<p class="chart-loading">No data available for this count.</p>`;
      return;
    }

    const [firstRow, secondRow] = splitIntoTwoRows(rows);
    const availableWidth = Math.max(760, Math.floor(el.clientWidth || 1000));

    const wrap = document.createElement("div");
    wrap.className = "election-waffle-wrap";

    wrap.appendChild(renderStatusLegend());

    wrap.appendChild(
      renderQuotaWaffleChunk(firstRow, {
        width: availableWidth
      })
    );

    if (secondRow.length) {
      wrap.appendChild(
        renderQuotaWaffleChunk(secondRow, {
          width: availableWidth
        })
      );
    }

    el.replaceChildren(wrap);
  })
);
```

</div>

<div class="prose-block">
  <h2>Explore the vote standings through the counts</h2>
  <p>Take a look at votes cast by subpanel or by the status of candidates in the poll.</p>
</div>

```js
display(
  mountReactive("section-local-control", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="section-local-control__intro">
          <div class="text-skeleton">
            <div class="text-skeleton__line text-skeleton__line--w84 skeleton-shimmer"></div>
            <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
          </div>
        </div>
        <div class="section-local-control__control">
          <div class="text-skeleton">
            <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
          </div>
        </div>
      `;
      return;
    }

    const [{ count }, summary] = await Promise.all([
      getLollipopRows(),
      getPanelSummary()
    ]);

    if (!isCurrent() || !summary) return;

    const intro = document.createElement("div");
    intro.className = "section-local-control__intro";
    intro.innerHTML = `
      <p>
        These were the vote standings after <strong>count No. ${count}</strong>
        for the <strong>${summary.panel}</strong>.
      </p>
      <p>
        The quota was <strong>${format(summary.quota)}</strong>.
      </p>
    `;

    const control = document.createElement("div");
    control.className = "section-local-control__control";

    control.appendChild(
      renderSegmentedControl({
        label: "Colour lollipop chart by",
        name: "color-mode",
        value: getState().colorMode,
        options: [
          { value: "subPanel", label: "Subpanel" },
          { value: "status", label: "Status" }
        ],
        onChange: (nextValue) => {
          window.electionsState.colorMode = nextValue;
          window.dispatchEvent(new CustomEvent("elections:change"));
        }
      })
    );

    el.replaceChildren(intro, control);
  })
);
```

<div class="chart-block chart-block--wide">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(760));
      return;
    }

    const { rows, quota, count } = await getLollipopRows();

    if (!isCurrent()) return;

    if (!rows.length) {
      el.innerHTML = `<p class="chart-loading">No standings data available for this count.</p>`;
      return;
    }

    const colorChoice = getLollipopColorChoice(
      getState().colorMode ?? "subPanel"
    );

    const wrap = document.createElement("div");
    wrap.className = "election-chart-wrap";

    wrap.appendChild(
      renderColorLegend({
        domain: colorChoice.domain,
        range: colorChoice.range
      })
    );

    const chart = renderLollipopChart(rows, {
      width: Math.max(760, Math.floor(el.clientWidth || 790)),
      quota,
      count,
      colorMode: getState().colorMode ?? "subPanel"
    });

    wrap.appendChild(chart);
    el.replaceChildren(wrap);
  })
);
```

</div>

<div class="section-local-control">
  <div class="section-local-control__intro">
    <p>
      For the selected count, explore candidates by <strong>status of poll</strong> or by <strong>surname</strong>.
    </p>
  </div>
  <div class="section-local-control__control">

```js
display(
  renderSegmentedControl({
    label: "Sort table by",
    name: "table-sort",
    value: getState().tableSort,
    options: [
      { value: "status", label: "Status of poll" },
      { value: "surname", label: "Surname" }
    ],
    onChange: (nextValue) => {
      window.electionsState.tableSort = nextValue;
      window.dispatchEvent(new CustomEvent("elections:change"));
    }
  })
);
```

  </div>
</div>

<div class="chart-block">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(420));
      return;
    }

    const rows = await getCountRows();

    if (!isCurrent()) return;

    if (!rows.length) {
      el.innerHTML = `<p class="chart-loading">No data available for this count.</p>`;
      return;
    }

    const sortedRows = rows
      .map((d) => ({
        ...d,
        displayName: clean(d.name),
        surnameKey: clean(d.surname ?? d.name).toLowerCase()
      }))
      .sort((a, b) => {
        const sortMode = getState().tableSort;

        if (sortMode === "surname") {
          return (
            d3.ascending(a.surnameKey, b.surnameKey) ||
            d3.ascending(a.displayName, b.displayName)
          );
        }

        const aInvalid = a.position === null || Number.isNaN(a.position);
        const bInvalid = b.position === null || Number.isNaN(b.position);

        if (aInvalid && !bInvalid) return 1;
        if (bInvalid && !aInvalid) return -1;

        return (
          d3.ascending(a.position, b.position) ||
          d3.ascending(a.surnameKey, b.surnameKey)
        );
      });

    const tableWrap = document.createElement("div");
    tableWrap.className = "results-table-wrap";

    const table = document.createElement("table");
    table.className = "results-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Sub-panel</th>
          <th>Votes</th>
          <th>Transfer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((d) => `
          <tr>
            <td>${d.displayName}</td>
            <td>${d.subPanel ?? ""}</td>
            <td>${format(d.votes ?? 0)}</td>
            <td>${format(d.transfer ?? 0)}</td>
            <td>${d.status ?? ""}</td>
          </tr>
        `).join("")}
      </tbody>
    `;

    tableWrap.appendChild(table);
    el.replaceChildren(tableWrap);
  })
);
```

</div>

```js
display(
  mountReactive("prose-block reactive-prose", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="text-skeleton">
          <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
          <div class="text-skeleton__line text-skeleton__line--w100 skeleton-shimmer"></div>
        </div>
      `;
      return;
    }

    const options = await getCandidateOptions();

    if (!isCurrent()) return;

    el.innerHTML = `
      <h2>Explore by candidate</h2>
      <p>
        This panel had <strong>${options.length} candidates</strong>. Explore their electoral path with the dropdown list.
      </p>
    `;
  })
);
```

```js
display(
  mountReactive("section-local-control", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="section-local-control__intro">
          <div class="text-skeleton">
            <div class="text-skeleton__line text-skeleton__line--w84 skeleton-shimmer"></div>
            <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
          </div>
        </div>
        <div class="section-local-control__control">
          <div class="text-skeleton">
            <div class="text-skeleton__line text-skeleton__line--w100 skeleton-shimmer"></div>
          </div>
        </div>
      `;
      return;
    }

    const options = await getCandidateOptions();
    const selected = await ensureValidCandidateFocus();
    const [candidateRecord, narrative] = await Promise.all([
      getCandidateRecord(),
      getCandidateNarrative()
    ]);

    if (!isCurrent()) return;

    const intro = document.createElement("div");
    intro.className = "section-local-control__intro";

    intro.innerHTML = candidateRecord.length && narrative
      ? `<p>${narrative}</p>`
      : `<p>Select a candidate to explore their progress through the counts.</p>`;

    const control = document.createElement("div");
    control.className = "section-local-control__control";

    const wrap = document.createElement("div");
    wrap.className = "election-candidate-select";

    wrap.innerHTML = `
      <label class="control">
        <span class="control-label">Select a candidate</span>
        <select class="control-input">
          ${options
            .map(
              (value) => `
                <option value="${value}" ${value === selected ? "selected" : ""}>
                  ${value}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
    `;

    const select = wrap.querySelector("select");
    select?.addEventListener("change", () => {
      window.electionsState.candidateFocus = select.value;
      window.dispatchEvent(new CustomEvent("elections:change"));
    });

    control.appendChild(wrap);
    el.replaceChildren(intro, control);
  })
);

```

<div class="chart-block chart-block--wide">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(460));
      return;
    }

    const [candidateRecord, summary] = await Promise.all([
      getCandidateRecord(),
      getPanelSummary()
    ]);

    if (!isCurrent()) return;

    if (!candidateRecord.length || !summary) {
      el.innerHTML = `<p class="chart-loading">No candidate data available.</p>`;
      return;
    }

    const quota = summary.quota ?? 0;
    const availableWidth = Math.max(720, Math.floor(el.clientWidth || 790));

    const wrap = document.createElement("div");
    wrap.className = "election-chart-wrap";

    wrap.appendChild(
      renderColorLegend({
        domain: ["Deemed Elected", "Continuing", "Excluded"],
        range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
      })
    );

    const chart = Plot.plot({
      marginLeft: 70,
      marginBottom: 35,
      style: {
        fontSize: 14,
        fontFamily: "IBM Plex Sans"
      },
      width: availableWidth,
      height: 480,
      color: {
        legend: false,
        domain: ["Deemed Elected", "Continuing", "Excluded"],
        range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
      },
      x: {
        label: "Count No.",
        labelAnchor: "center"
      },
      y: {
        grid: true,
        label: "↑ Votes"
      },
      marks: [
        () => {
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.innerHTML = `
            <defs>
              <linearGradient id="candidate-gradient" gradientTransform="rotate(90)">
                <stop offset="100%" stop-color="#7F6C2E" stop-opacity="0.95"></stop>
                <stop offset="90%" stop-color="#666666" stop-opacity="0.5"></stop>
              </linearGradient>
            </defs>
          `;
          return svg;
        },
        Plot.barY(candidateRecord, {
          x: "count",
          y: "votes",
          fill: "status",
          title: (d) =>
            `After count No. ${d.count}, ${d.displayName ?? d.name} had ${format(
              d.votes
            )} votes, with the quota standing at ${format(quota)} votes, and was ${
              String(d.status ?? "").toLowerCase()
            } in the count.`
        }),
        Plot.tickY(candidateRecord, {
          x: "count",
          y: "votes",
          stroke: "subPanel",
          strokeWidth: 2
        }),
        Plot.ruleY([0])
      ]
    });

    fixPlotAria(chart);

    wrap.appendChild(chart);
    el.replaceChildren(wrap);
  })
);

```

<div class="chart-block">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(320));
      return;
    }

    const candidateRecord = await getCandidateRecord();

    if (!isCurrent()) return;

    if (!candidateRecord.length) {
      el.innerHTML = `<p class="chart-loading">No candidate data available.</p>`;
      return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "results-table-wrap";

    const table = document.createElement("table");
    table.className = "results-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>After count No.</th>
          <th>Transfer</th>
          <th>Votes</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${candidateRecord
          .map(
            (d) => `
              <tr>
                <td>${d.count ?? ""}</td>
                <td>${format(d.transfer ?? 0)}</td>
                <td>${format(d.votes ?? 0)}</td>
                <td>${d.status ?? ""}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    `;

    tableWrap.appendChild(table);
    el.replaceChildren(tableWrap);
  })
);

display(
  mountReactive("download-block", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="text-skeleton">
          <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
        </div>
      `;
      return;
    }

    const rows = await getResults();
    const { panel } = getState();

    if (!isCurrent()) return;
    if (!panel) {
      el.innerHTML = `<p class="chart-loading">No panel selected.</p>`;
      return;
    }

    const filteredRows = rows.filter((d) => d.panel === panel);

    const cleanedRows = filteredRows.map((d) => ({
      panel: d.panel ?? "",
      subPanel: d.subPanel ?? "",
      candidate: clean(d.name) ?? "",
      count: d.count ?? "",
      votes: d.votes ?? 0,
      transfer: d.transfer ?? 0,
      status: d.status ?? "",
      quota: d.quota ?? 0,
      electedPosition: d.electedPosition ?? "",
      electedCount: d.electedCount ?? ""
    }));

    const csv = "\uFEFF" + d3.csvFormat(cleanedRows);

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);

    if (el.dataset.downloadUrl) {
      URL.revokeObjectURL(el.dataset.downloadUrl);
    }
    el.dataset.downloadUrl = url;

    const safePanel = panel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const link = document.createElement("a");
    link.className = "pq-download";
    link.href = url;
    link.download = `${safePanel}-seanad-election-2025-counts.csv`;
    link.textContent = `Download full count-by-count dataset for the ${panel}`;

    el.replaceChildren(link);
  })
);
