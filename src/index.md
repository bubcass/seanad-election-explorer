---
title: Overview
header: false
sidebar: false
footer: false
toc: false
---

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";
import { constituencyMap } from "./components/constituency-map.js";
import { electionTimelineControls } from "./components/election-timeline-controls.js";
import { electionBarRace } from "./components/electionBarRace.js";

async function ensureLeafletCss() {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("leaflet-css-cdn");
  if (existing) {
    if (existing.dataset.loaded === "true") return;

    await new Promise((resolve, reject) => {
      existing.addEventListener(
        "load",
        () => {
          existing.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      existing.addEventListener("error", reject, { once: true });
    });

    return;
  }

  await new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = "leaflet-css-cdn";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

    link.addEventListener(
      "load",
      () => {
        link.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );

    link.addEventListener("error", reject, { once: true });

    document.head.appendChild(link);
  });
}

ensureLeafletCss();

const format = d3.format(",d");
const heroVideoPromise = FileAttachment("media/election.mp4").url();

const normalisedPromise = FileAttachment(
  "data/derived/election-2024-normalised.json"
).json();

const finalRowsPromise = FileAttachment(
  "data/derived/election-2024-final-rows.json"
).json();

const barRacePromise = FileAttachment(
  "data/derived/bar-race.json"
).json();

const constituenciesGeoPromise = FileAttachment(
  "data/geo/constituencies.json"
).json();

const membersLookupPromise = FileAttachment(
  "data/members-lookup.json"
).json();

const downloadHrefPromise = FileAttachment(
  "data/election_2024_cleaned.csv"
).url();

const partyColorMap = new Map([
  ["Fianna Fáil", "#2c8737"],
  ["Sinn Féin", "#088460"],
  ["Fine Gael", "#303591"],
  ["Independent", "#666666"],
  ["Labour Party", "#c82832"],
  ["Social Democrats", "#782b81"],
  ["Independent Ireland", "#087b87"],
  ["People Before Profit-Solidarity", "#be417d"],
  ["Aontú", "#b35400"],
  ["100% RDR", "#985564"],
  ["Green Party", "#6c7e26"],
  ["Irish Freedom Party", "#1f77b4"],
  ["Liberty Republic", "#ff7f0e"]
]);

if (typeof window !== "undefined" && !window.__electionsResizeObserver) {
  window.__electionsResizeObserver = new ResizeObserver(([entry]) => {
    parent.postMessage({ height: entry.target.scrollHeight }, "*");
  });

  window.__electionsResizeObserver.observe(document.body);
}

if (!window.electionsState) {
  window.electionsState = {
    constituency: "Carlow-Kilkenny",
    count: null,
    colorMode: "party",
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

function cleanConstituencyName(name) {
  return clean(name).replace(/\s*\(\d+\)\s*$/, "");
}

function canonicalPersonName(name) {
  const raw = clean(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

  if (!raw) return "";

  if (raw.includes(",")) {
    const [surname, rest] = raw.split(",", 2);
    return `${clean(rest)} ${clean(surname)}`.toLowerCase();
  }

  return raw.toLowerCase();
}

function getDisplayNameFromElection(name) {
  const raw = clean(name);
  if (!raw.includes(",")) return raw;

  const [surname, rest] = raw.split(",", 2);
  return `${clean(rest)} ${clean(surname)}`;
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

function getColorChoices(rows) {
  const partiesPalette = [
    { name: "Fianna Fáil", value: "#40b34e" },
    { name: "Sinn Féin", value: "#088460" },
    { name: "Fine Gael", value: "#303591" },
    { name: "Independent", value: "#666666" },
    { name: "Labour Party", value: "#c82832" },
    { name: "Social Democrats", value: "#782b81" },
    { name: "Independent Ireland", value: "#17becf" },
    { name: "People Before Profit-Solidarity", value: "#c5568b" },
    { name: "Aontú", value: "#ff7f0e" },
    { name: "100% RDR", value: "#985564" },
    { name: "Green Party", value: "#b4d143" },
    { name: "Irish Freedom Party", value: "#1f77b4" },
    { name: "Liberty Republic", value: "#ff7f0e" }
  ];

  const fallbackColors = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf"
  ];

  const fullMap = new Map(partiesPalette.map((d) => [d.name, d.value]));
  let fallbackIndex = 0;

  const partiesInUse = Array.from(
    new Set(rows.map((d) => d.party).filter(Boolean))
  );

  for (const party of partiesInUse) {
    if (!fullMap.has(party)) {
      fullMap.set(
        party,
        fallbackColors[fallbackIndex % fallbackColors.length]
      );
      fallbackIndex += 1;
    }
  }

  return {
    party: {
      field: "party",
      domain: partiesInUse,
      range: partiesInUse.map((p) => fullMap.get(p))
    },
    status: {
      field: "status",
      domain: ["Elected", "Continuing", "Eliminated"],
      range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
    }
  };
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
    domain: ["Elected", "Continuing", "Eliminated"],
    range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
  });
}

async function getResults() {
  const payload = await normalisedPromise;
  return payload.data ?? [];
}

async function getFinalRows() {
  const payload = await finalRowsPromise;
  return payload.data ?? [];
}

async function getBarRaceConstituency() {
  const data = await barRacePromise;
  const { constituency } = getState();
  return data.find((d) => d.constituency === constituency) ?? null;
}

async function getConstituenciesGeo() {
  return await constituenciesGeoPromise;
}

async function getMembersLookup() {
  return await membersLookupPromise;
}

async function getMembersArray() {
  const lookup = await getMembersLookup();
  return Object.values(lookup ?? {});
}

async function getFilteredConstituencyGeo() {
  const selected = getState().constituency;
  const constituenciesGeo = await getConstituenciesGeo();

  return {
    type: "FeatureCollection",
    features: constituenciesGeo.features.filter(
      (feature) =>
        cleanConstituencyName(feature?.properties?.ENG_NAME_VALUE) === selected
    )
  };
}

async function getAvailableConstituencies() {
  const rows = await getResults();
  return Array.from(new Set(rows.map((d) => d.constituency).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "en")
  );
}

async function getConstituencySummary() {
  const rows = await getFinalRows();
  const { constituency } = getState();

  const filtered = rows
    .filter((d) => d.constituency === constituency)
    .sort((a, b) => d3.descending(a.votes, b.votes));

  if (!filtered.length) return null;

  const elected = filtered
    .filter((d) => d.status === "Elected")
    .sort((a, b) => d3.descending(a.votes, b.votes));

  return {
    constituency,
    quota: filtered[0].quota,
    seats: filtered[0].seats,
    totalCandidates: filtered.length,
    elected,
    finalRows: filtered
  };
}

async function getMatchedElectedMembers() {
  const summary = await getConstituencySummary();
  const members = await getMembersArray();

  if (!summary?.elected?.length) return [];

  const constituency = clean(summary.constituency);

  const membersInConstituency = members.filter(
    (d) => clean(d.constituency) === constituency
  );

  return summary.elected.map((row) => {
    const electionNameCanonical = canonicalPersonName(row.name);

    const matched =
      membersInConstituency.find(
        (m) => canonicalPersonName(m.memberName) === electionNameCanonical
      ) ?? null;

    return {
      ...row,
      displayName: matched?.memberName ?? getDisplayNameFromElection(row.name),
      memberCode: matched?.memberCode ?? null,
      memberUrl: matched?.memberUrl ?? null,
      imageUrl: matched?.memberCode
        ? `https://data.oireachtas.ie/ie/oireachtas/member/id/${matched.memberCode}/image/large`
        : null,
      matchedParty: matched?.party ?? row.party
    };
  });
}

async function getCountRows() {
  const rows = await getResults();
  const { constituency, count } = getState();

  let filtered = rows.filter((d) => d.constituency === constituency);

  const availableCounts = Array.from(new Set(filtered.map((d) => d.count))).sort(
    (a, b) => a - b
  );

  const activeCount = Number.isFinite(count)
    ? count
    : availableCounts[availableCounts.length - 1];

  filtered = filtered.filter((d) => d.count === activeCount);

  return filtered.sort((a, b) => d3.descending(a.votes, b.votes));
}

async function getActiveCountLabel() {
  const rows = await getResults();
  const { constituency, count } = getState();

  const constituencyRows = rows.filter((d) => d.constituency === constituency);
  const availableCounts = Array.from(
    new Set(constituencyRows.map((d) => d.count))
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
  const summary = await getConstituencySummary();

  if (!rows.length || !summary) return { rows: [], quota: 0, seats: 0 };

  const quota = summary.quota ?? 0;
  const seats = summary.seats ?? 0;

  const prepared = rows
    .map((d) => ({
      ...d,
      displayName: getDisplayNameFromElection(d.name),
      surnameKey: clean(d.name).toLowerCase(),
      quotaPct: quota > 0 ? (d.votes / quota) * 100 : 0
    }))
    .sort((a, b) => d3.ascending(a.surnameKey, b.surnameKey));

  return { rows: prepared, quota, seats };
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
      fontSize: 14,
      padding: "5px"
    },
    color: {
      legend: false,
      domain: ["Elected", "Continuing", "Eliminated"],
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
        <div>Party: ${d.party ?? "—"}</div>
        <div>Electoral status: ${d.status ?? "—"}</div>
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

function renderConstituencySelect(options, selectedValue) {
  const wrap = document.createElement("div");
  wrap.className = "election-constituency-select";

  wrap.innerHTML = `
    <label class="control control--constituency">
      <span class="control-label">Select a constituency</span>
      <select class="control-input">
        ${options
          .map(
            (value) => `
              <option value="${value}" ${value === selectedValue ? "selected" : ""}>
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
    window.electionsState.constituency = select.value;
    window.electionsState.count = null;
    window.electionsState.candidateFocus = null;
    window.dispatchEvent(new CustomEvent("elections:change"));
  });

  return wrap;
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
    const controlId = `${name}-${String(option.value).replace(/\s+/g, "-").toLowerCase()}`;

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

async function getCandidateOptions() {
  const rows = await getResults();
  const { constituency } = getState();

  return Array.from(
    new Set(
      rows
        .filter((d) => d.constituency === constituency)
        .map((d) => d.name)
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
  const { constituency } = getState();
  const selectedCandidate = await ensureValidCandidateFocus();

  if (!selectedCandidate) return [];

  return rows
    .filter(
      (d) => d.constituency === constituency && d.name === selectedCandidate
    )
    .map((d) => ({
      ...d,
      displayName: getDisplayNameFromElection(d.name)
    }))
    .sort((a, b) => d3.ascending(a.count, b.count));
}

async function getCandidateNarrative() {
  const [candidateRecord, summary] = await Promise.all([
    getCandidateRecord(),
    getConstituencySummary()
  ]);

  if (!candidateRecord.length || !summary) return null;

  const candidate = candidateRecord[0];
  const quota = summary.quota ?? 0;
  const firstAboveQuota = candidateRecord.find((d) => (d.votes ?? 0) > quota);

  if (firstAboveQuota) {
    return `<strong>${candidate.displayName}</strong> ran as a <strong>${candidate.party ?? "Independent"}</strong> candidate and <strong>exceeded the quota</strong> on count No. ${firstAboveQuota.count}.`;
  }

  const peakVotes = d3.max(candidateRecord, (d) => d.votes) ?? 0;
  return `<strong>${candidate.displayName}</strong> ran as a <strong>${candidate.party ?? "Independent"}</strong> candidate and <strong>did not exceed the quota</strong>, reaching a peak of ${format(peakVotes)} votes.`;
}
```

```js
display(
  mountReactive("hero", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `<div class="hero__media skeleton-shimmer"></div>`;
      return;
    }

    const heroVideo = await heroVideoPromise;
    if (!isCurrent()) return;

    el.innerHTML = `
      <div class="hero__media">
        <video
          class="hero__video"
          src="${heroVideo}"
          autoplay
          muted
          loop
          playsinline
        ></video>
      </div>
      <div class="hero__overlay">
        <div class="hero__content">
          <p class="hero__eyebrow">Open data insights</p>
          <h1 class="hero__title">Election Explorer: 34th Dáil</h1>
          <p class="hero__subtitle">
            A data-driven exploration of the 2024 general election.
          </p>
        </div>
      </div>
    `;
  })
);
```

<div class="prose-block">

The latest election of TDs took place in November 2024 and 174 Members were returned from 43 constituencies. Take a look at how it unfolded by constituency,  count and candidate.

</div>

```js
display(
  mountReactive("constituency-top-panel", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <section class="constituency-top">
          <div class="constituency-top__row">
            <div class="constituency-top__info">
              <div class="text-skeleton">
                <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
                <div class="text-skeleton__line text-skeleton__line--w100 skeleton-shimmer"></div>
                <div class="text-skeleton__line text-skeleton__line--w92 skeleton-shimmer"></div>
              </div>
            </div>
            <div class="map-skeleton skeleton-shimmer"></div>
          </div>
          <div class="cards-skeleton">
            <div class="cards-skeleton__inner cards-skeleton__inner--winners">
              ${Array.from({ length: 5 }).map(() => `
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

    const [options, summary, geo, members] = await Promise.all([
      getAvailableConstituencies(),
      getConstituencySummary(),
      getFilteredConstituencyGeo(),
      getMatchedElectedMembers()
    ]);

    if (!isCurrent()) return;

    if (!summary) {
      el.innerHTML = `<p>No constituency summary available.</p>`;
      return;
    }

    const section = document.createElement("section");
    section.className = "constituency-top";

    const row = document.createElement("div");
    row.className = "constituency-top__row";

    const info = document.createElement("div");
    info.className = "constituency-top__info";

    const mapWrap = document.createElement("div");
    mapWrap.className = "constituency-top__map";

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "constituency-top__cards";

    info.appendChild(renderConstituencySelect(options, getState().constituency));

    const summaryBlock = document.createElement("div");
    summaryBlock.className = "constituency-top__summary";

    summaryBlock.innerHTML = `
      <h2>Elected Members</h2>
      <p>
        <strong>${summary.constituency}</strong> returned <strong>${summary.seats}</strong>
        Members to the 34th Dáil.
      </p>
      <p>
        A total of <strong>${summary.totalCandidates}</strong> candidates contested the constituency.
        The Members returned were <strong>${summary.elected.map((d) => getDisplayNameFromElection(d.name)).join(", ")}</strong>.
      </p>
      <p>
        The quota was <strong>${format(summary.quota)}</strong>.
      </p>
    `;

    info.appendChild(summaryBlock);

    if (geo?.features?.length) {
      mapWrap.appendChild(
        constituencyMap(geo, {
          height: 360,
          popupFormatter: () =>
            `The <strong>${summary.constituency}</strong> constituency returned <strong>${summary.seats} Members</strong>.`
        })
      );
    } else {
      const noMap = document.createElement("p");
      noMap.className = "chart-loading";
      noMap.textContent = "No map available for this constituency.";
      mapWrap.appendChild(noMap);
    }

    const cardsGrid = document.createElement("div");
    cardsGrid.className = "elected-strip";
    cardsGrid.dataset.count = String(members.length);

    for (const member of members) {
      const party = member.matchedParty || member.party || "Independent";
      const color = partyColorMap.get(party) ?? "#666666";

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
          <div class="elected-strip__party">${party}</div>
        </article>
      `;

      cardsGrid.appendChild(wrapper);
    }

    cardsWrap.appendChild(cardsGrid);
    row.appendChild(info);
    row.appendChild(mapWrap);
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

    const selected = await getBarRaceConstituency();

    if (!isCurrent()) return;

    if (!selected) {
      el.innerHTML = `<p class="chart-loading">No bar-race data available for this constituency.</p>`;
      return;
    }

    const chart = electionBarRace({
      data: selected,
      width: Math.max(760, Math.floor(el.clientWidth || 960)),
      visibleBars: 10,
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
  <p>Take an interactive look at how the general election unfolded in November 2024 and the story of each count.</p>
</div>

<div class="section-driver-block">
  <div class="section-driver-block__control">

```js
electionTimelineControls({
  state: window.electionsState,
  resultsPromise: getResults(),
  getConstituency: () => getState().constituency,
  onChange: () => {
    window.dispatchEvent(new CustomEvent("elections:change"));
  }
})
```

  </div>

  <div class="section-driver-block__intro">
    <p>
      Dáil elections take place over multiple counts, during which votes in excess
      of the quota or votes from eliminated candidates are redistributed. Chart shows percentage of quota attained by candidates by count.
  </div>
</div>

```js
display(
  mountReactive("prose-block reactive-prose", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="text-skeleton">
          <div class="text-skeleton__line text-skeleton__line--w72 skeleton-shimmer"></div>
        </div>
      `;
      return;
    }

    const { activeCount, maxCount } = await getActiveCountLabel();
    const constituency = getState().constituency;

    if (!isCurrent()) return;

    el.innerHTML = `
      <h3>Count ${activeCount} of ${maxCount} · ${constituency}</h3>
    `;
  })
);
```

<div class="chart-block chart-block--wide">

```js
display(
  mountReactive("", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.replaceChildren(chartPlaceholder(700));
      return;
    }

    const { rows, quota } = await getWaffleRows();

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

    wrap.appendChild(
      renderQuotaWaffleChunk(secondRow, {
        width: availableWidth
      })
    );

    el.replaceChildren(wrap);
  })
);
```

</div>

<div class="prose-block">
  <h2>Explore the vote standings through the counts</h2>
  <p>Take a look at votes cast by party or by the status of candidates in the election.</p>
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

    const [{ activeCount }, summary] = await Promise.all([
      getActiveCountLabel(),
      getConstituencySummary()
    ]);

    if (!isCurrent() || !summary) return;

    const intro = document.createElement("div");
    intro.className = "section-local-control__intro";
    intro.innerHTML = `
      <p>
        These were the vote standings after count No. <strong>${activeCount}</strong>
        in <strong>${summary.constituency}</strong>.
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
          { value: "party", label: "Party" },
          { value: "status", label: "Candidate status" }
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
      el.replaceChildren(chartPlaceholder(460));
      return;
    }

    const rows = await getCountRows();
    const summary = await getConstituencySummary();

    if (!isCurrent()) return;

    if (!rows.length || !summary) {
      el.innerHTML = `<p class="chart-loading">No data available for this count.</p>`;
      return;
    }

    const quota = summary.quota ?? 0;
    const colorChoices = getColorChoices(rows);
    const colorChoice =
      getState().colorMode === "status"
        ? colorChoices.status
        : colorChoices.party;

    const plottedRows = rows
      .map((d) => ({
        ...d,
        displayName: getDisplayNameFromElection(d.name),
        stemStart: 0
      }))
      .sort((a, b) => d3.descending(a.votes, b.votes));

    const availableWidth = Math.max(720, Math.floor(el.clientWidth || 790));

    const wrap = document.createElement("div");
    wrap.className = "election-chart-wrap";

    wrap.appendChild(renderColorLegend(colorChoice));

    const chart = Plot.plot({
      width: availableWidth,
      height: Math.max(420, plottedRows.length * 30 + 70),
      marginBottom: 40,
      marginLeft: 220,
      marginRight: 80,
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
        label: "Votes",
        nice: true
      },
      y: {
        label: null,
        tickSize: 0,
        domain: plottedRows.map((d) => d.displayName)
      },
      marks: [
        Plot.ruleX([0]),
        Plot.ruleX([quota], {
          stroke: "#6b5922",
          strokeDasharray: "4,4"
        }),
        Plot.link(plottedRows, {
          x1: "stemStart",
          x2: "votes",
          y1: "displayName",
          y2: "displayName",
          stroke: colorChoice.field,
          strokeWidth: 2.25
        }),
        Plot.dot(plottedRows, {
          x: "votes",
          y: "displayName",
          fill: colorChoice.field,
          stroke: colorChoice.field,
          r: 5,
          title: (d) =>
            `After count No. ${d.count}, ${d.displayName}, ${d.party}, had ${format(d.votes)} votes, with the quota standing at ${format(quota)}.`
        }),
        Plot.text(plottedRows, {
          x: "votes",
          y: "displayName",
          text: (d) => format(d.votes),
          dx: 26,
          textAnchor: "start",
          lineAnchor: "middle",
          fill: "#4a463d",
          fontSize: 12
        })
      ]
    });

    fixPlotAria(chart);

    wrap.appendChild(chart);
    el.replaceChildren(wrap);
  })
);
```

</div>

```js
display(
  mountReactive("section-local-control", async (el, { skeletonOnly, isCurrent }) => {
    if (skeletonOnly) {
      el.innerHTML = `
        <div class="section-local-control__intro">
          <div class="text-skeleton">
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

    const { activeCount } = await getActiveCountLabel();

    if (!isCurrent()) return;

    const intro = document.createElement("div");
    intro.className = "section-local-control__intro";
    intro.innerHTML = `
      <p>
        For count <strong>${activeCount}</strong>, explore votes alphabetically by surname or by candidate status.
      </p>
    `;

    const control = document.createElement("div");
    control.className = "section-local-control__control";

    control.appendChild(
      renderSegmentedControl({
        label: "Sort table by",
        name: "table-sort",
        value: getState().tableSort,
        options: [
          { value: "status", label: "Count status" },
          { value: "surname", label: "Surname" }
        ],
        onChange: (nextValue) => {
          window.electionsState.tableSort = nextValue;
          window.dispatchEvent(new CustomEvent("elections:change"));
        }
      })
    );

    el.replaceChildren(intro, control);
  })
);
```

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

    const statusOrder = new Map([
      ["Elected", 0],
      ["Continuing", 1],
      ["Eliminated", 2]
    ]);

    const sortedRows = rows
      .map((d) => ({
        ...d,
        displayName: getDisplayNameFromElection(d.name),
        surnameKey: clean(d.name).toLowerCase(),
        statusRank: statusOrder.get(d.status) ?? 99
      }))
      .sort((a, b) => {
        const sortMode = getState().tableSort;

        if (sortMode === "surname") {
          return d3.ascending(a.surnameKey, b.surnameKey);
        }

        return (
          d3.ascending(a.statusRank, b.statusRank) ||
          d3.descending(a.votes ?? 0, b.votes ?? 0)
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
          <th>Party</th>
          <th>Votes</th>
          <th>Transfer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows
          .map(
            (d) => `
              <tr>
                <td>${d.displayName}</td>
                <td>${d.party ?? ""}</td>
                <td>${format(d.votes ?? 0)}</td>
                <td>${format(d.transfer ?? 0)}</td>
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
        This election had <strong>${options.length} candidates</strong>. Explore their electoral path with the dropdown list.
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

    if (!isCurrent() || !candidateRecord.length || !narrative) return;

    const intro = document.createElement("div");
    intro.className = "section-local-control__intro";
    intro.innerHTML = `
      <p>${narrative}</p>
    `;

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
      getConstituencySummary()
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
        domain: ["Elected", "Continuing", "Eliminated"],
        range: ["#ff7f0e", "#1f77b4", "#dadbdc"]
      })
    );

    const chart = Plot.plot({
      marginLeft: 70,
      marginBottom: 40,
      width: availableWidth,
      height: 480,
      style: {
        fontSize: 14,
        fontFamily: "IBM Plex Sans"
      },
      color: {
        legend: false,
        domain: ["Elected", "Continuing", "Eliminated"],
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
        Plot.barY(candidateRecord, {
          x: "count",
          y: "votes",
          fill: "status",
          title: (d) =>
            `After count No. ${d.count}, ${d.displayName} had ${format(d.votes)} votes, with the quota standing at ${format(quota)} votes, and was ${String(d.status ?? "").toLowerCase()} in the count.`
        }),
        Plot.tickY(candidateRecord, {
          x: "count",
          y: "votes",
          stroke: "party",
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

</div>

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
```

</div>

```js
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
    const { constituency } = getState();
    if (!isCurrent()) return;

    const filteredRows = rows.filter((d) => d.constituency === constituency);

    const cleanedRows = filteredRows.map((d) => ({
      constituency: d.constituency ?? "",
      candidate: getDisplayNameFromElection(d.name) ?? "",
      party: d.party ?? "",
      count: d.count ?? "",
      votes: d.votes ?? 0,
      transfer: d.transfer ?? 0,
      status: d.status ?? "",
      quota: d.quota ?? 0,
      seats: d.seats ?? 0
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

    const link = document.createElement("a");
    link.className = "pq-download";
    link.href = url;
    link.download = `${constituency.toLowerCase().replace(/\s+/g, "-")}-election-results-2024.csv`;
    link.textContent = `Download full count-by-count dataset for ${constituency}`;

    el.replaceChildren(link);
  })
);
```
