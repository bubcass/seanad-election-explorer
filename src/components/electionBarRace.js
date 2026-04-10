import * as d3 from "npm:d3";

const DEFAULT_SUBPANEL_COLORS = new Map([
  ["Nominating Bodies", "#1f77b4"],
  ["Oireachtas", "#ff7f0e"],
]);

export function electionBarRace({
  data,
  width = 960,
  visibleBars = 10,
  barSize = 42,
  duration = 180,
  subPanelColors = DEFAULT_SUBPANEL_COLORS,
} = {}) {
  const fallback = document.createElement("div");
  fallback.className = "chart-loading";

  if (!data || !Array.isArray(data.counts) || !Array.isArray(data.candidates)) {
    fallback.textContent = "No bar-race data available.";
    return fallback;
  }

  if (!data.counts.length || !data.candidates.length) {
    fallback.textContent = "No bar-race data available.";
    return fallback;
  }

  const n = Math.min(visibleBars, data.candidates.length);
  const marginTop = 40;
  const marginRight = 140;
  const marginBottom = 24;
  const marginLeft = 0;
  const height = marginTop + barSize * (n + 1) + marginBottom;

  const formatNumber = d3.format(",d");
  const formatCount = d3.format("d");

  const names = data.candidates.map((d) => d.name);
  const quota = Number(data.quota) || 0;
  const maxCount =
    Number(data.maxCount) || d3.max(data.counts, (d) => Number(d.count)) || 1;
  const maxValue =
    Number(data.maxValue) ||
    d3.max(data.counts, (frame) =>
      d3.max(Object.values(frame.values ?? {}), (v) => Number(v)),
    ) ||
    1;

  const subPanelByName = new Map(
    data.candidates.map((candidate) => [candidate.name, candidate.subPanel]),
  );

  const x = d3.scaleLinear([0, maxValue], [marginLeft, width - marginRight]);

  const y = d3
    .scaleBand()
    .domain(d3.range(n + 1))
    .rangeRound([marginTop, marginTop + barSize * (n + 1 + 0.15)])
    .padding(0.12);

  function getSubPanelColor(name) {
    return subPanelColors.get(subPanelByName.get(name)) ?? "#8a8578";
  }

  function rank(value) {
    const ranked = Array.from(names, (name) => ({
      name,
      value: value(name) || 0,
    }));

    ranked.sort((a, b) => d3.descending(a.value, b.value));

    for (let i = 0; i < ranked.length; ++i) {
      ranked[i].rank = Math.min(n, i);
    }

    return ranked;
  }

  const countvalues = data.counts
    .map((frame) => [
      Number(frame.count),
      new Map(names.map((name) => [name, Number(frame.values?.[name]) || 0])),
    ])
    .sort((a, b) => d3.ascending(a[0], b[0]));

  const k = 12;
  const keyframes = [];

  if (countvalues.length > 1) {
    for (const [[ka, a], [kb, b]] of d3.pairs(countvalues)) {
      for (let i = 0; i < k; ++i) {
        const t = i / k;
        keyframes.push([
          ka * (1 - t) + kb * t,
          rank((name) => (a.get(name) || 0) * (1 - t) + (b.get(name) || 0) * t),
        ]);
      }
    }

    const [lastCount, lastMap] = countvalues[countvalues.length - 1];
    keyframes.push([lastCount, rank((name) => lastMap.get(name) || 0)]);
  } else {
    const [onlyCount, onlyMap] = countvalues[0];
    keyframes.push([onlyCount, rank((name) => onlyMap.get(name) || 0)]);
  }

  const nameframes = d3.groups(
    keyframes.flatMap(([, ranked]) => ranked),
    (d) => d.name,
  );

  const prev = new Map(
    nameframes.flatMap(([, ranked]) => d3.pairs(ranked, (a, b) => [b, a])),
  );

  const next = new Map(nameframes.flatMap(([, ranked]) => d3.pairs(ranked)));

  function getFrameByCount(count) {
    const rounded = Math.round(count);
    return data.counts.find((d) => Number(d.count) === rounded) ?? null;
  }

  function getStatus(count, name) {
    const frame = getFrameByCount(count);
    return frame?.status?.[name] ?? "Continuing";
  }

  function textTween(a, b) {
    const interpolate = d3.interpolateNumber(a, b);
    return function (t) {
      this.textContent = formatNumber(Math.round(interpolate(t)));
    };
  }

  const wrapper = document.createElement("div");
  wrapper.className = "election-bar-race";

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr(
      "style",
      "max-width: 100%; height: auto; display: block; overflow: visible;",
    );

  const axisGroup = svg
    .append("g")
    .attr("transform", `translate(0,${marginTop})`);

  const axis = d3
    .axisTop(x)
    .ticks(width / 160, d3.format(",d"))
    .tickSizeOuter(0)
    .tickSizeInner(-barSize * (n + y.padding()));

  function updateAxis(transition) {
    axisGroup.transition(transition).call(axis);
    axisGroup.select(".tick:first-of-type text").remove();
    axisGroup
      .selectAll(".tick:not(:first-of-type) line")
      .attr("stroke", "#8a8578")
      .attr("stroke-opacity", 0.35);
    axisGroup.select(".domain").remove();
    axisGroup
      .selectAll("text")
      .style("font-family", "IBM Plex Sans")
      .style("font-size", "12px")
      .attr("fill", "#5f5a50");
  }

  if (quota > 0) {
    const quotaGroup = svg.append("g");

    quotaGroup
      .append("line")
      .attr("x1", x(quota))
      .attr("x2", x(quota))
      .attr("y1", marginTop)
      .attr("y2", height - marginBottom)
      .attr("stroke", "#7F6C2E")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.9);

    quotaGroup
      .append("text")
      .attr("x", x(quota) + 6)
      .attr("y", height - marginBottom - 8)
      .attr("text-anchor", "start")
      .attr("fill", "#7F6C2E")
      .style("font-family", "IBM Plex Sans")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .text("Quota");
  }

  let bar = svg.append("g").selectAll("rect");

  function updateBars([count, ranked], transition) {
    bar = bar
      .data(ranked.slice(0, n), (d) => d.name)
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("fill", (d) => getSubPanelColor(d.name))
            .attr("fill-opacity", (d) =>
              getStatus(count, d.name) === "Excluded" ? 0.35 : 1,
            )
            .attr("stroke", (d) =>
              getStatus(count, d.name) === "Deemed Elected"
                ? "#7F6C2E"
                : "none",
            )
            .attr("stroke-width", (d) =>
              getStatus(count, d.name) === "Deemed Elected" ? 2 : 0,
            )
            .attr("rx", 3)
            .attr("height", y.bandwidth())
            .attr("x", x(0))
            .attr("y", (d) => y((prev.get(d) || d).rank))
            .attr("width", (d) => x((prev.get(d) || d).value) - x(0)),
        (update) => update,
        (exit) =>
          exit
            .transition(transition)
            .remove()
            .attr("y", (d) => y((next.get(d) || d).rank))
            .attr("width", (d) => x((next.get(d) || d).value) - x(0)),
      );

    bar
      .transition(transition)
      .attr("y", (d) => y(d.rank))
      .attr("width", (d) => x(d.value) - x(0))
      .attr("fill", (d) => getSubPanelColor(d.name))
      .attr("fill-opacity", (d) =>
        getStatus(count, d.name) === "Excluded" ? 0.35 : 1,
      )
      .attr("stroke", (d) =>
        getStatus(count, d.name) === "Deemed Elected" ? "#7F6C2E" : "none",
      )
      .attr("stroke-width", (d) =>
        getStatus(count, d.name) === "Deemed Elected" ? 2 : 0,
      );
  }

  let label = svg
    .append("g")
    .style("font-family", "IBM Plex Sans")
    .style("font-size", "14px")
    .style("font-weight", "700")
    .style("font-variant-numeric", "tabular-nums")
    .attr("text-anchor", "end")
    .selectAll("text");

  function updateLabels([, ranked], transition) {
    label = label
      .data(ranked.slice(0, n), (d) => d.name)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr(
              "transform",
              (d) =>
                `translate(${x((prev.get(d) || d).value)},${y((prev.get(d) || d).rank)})`,
            )
            .attr("y", y.bandwidth() / 2)
            .attr("x", -8)
            .attr("dy", "-0.22em")
            .attr("fill", "white")
            .text((d) => d.name)
            .call((text) =>
              text
                .append("tspan")
                .attr("x", -8)
                .attr("dy", "1.15em")
                .attr("fill-opacity", 1)
                .attr("font-weight", "400"),
            ),
        (update) => update,
        (exit) =>
          exit
            .transition(transition)
            .remove()
            .attr(
              "transform",
              (d) =>
                `translate(${x((next.get(d) || d).value)},${y((next.get(d) || d).rank)})`,
            )
            .call((group) =>
              group
                .select("tspan")
                .tween("text", (d) =>
                  textTween(d.value, (next.get(d) || d).value),
                ),
            ),
      );

    label
      .transition(transition)
      .attr("transform", (d) => `translate(${x(d.value)},${y(d.rank)})`)
      .call((group) =>
        group
          .select("tspan")
          .tween("text", (d) => textTween((prev.get(d) || d).value, d.value)),
      );
  }

  const ticker = svg
    .append("text")
    .style("font-family", "IBM Plex Sans")
    .style("font-size", `${barSize}px`)
    .style("font-weight", "700")
    .style("font-variant-numeric", "tabular-nums")
    .attr("fill", "#444444")
    .attr("text-anchor", "end")
    .attr("x", width - 6)
    .attr("y", marginTop + barSize * (n - 0.45))
    .attr("dy", "0.32em")
    .text(`Count ${formatCount(Math.round(keyframes[0]?.[0] ?? 1))}`);

  function updateTicker([count], transition) {
    transition
      .end()
      .then(() => {
        const rounded = Math.round(count);
        ticker.text(
          rounded >= maxCount ? "Final count" : `Count ${formatCount(rounded)}`,
        );
      })
      .catch(() => {});
  }

  wrapper.appendChild(svg.node());

  let stopped = false;

  async function run() {
    for (const keyframe of keyframes) {
      if (stopped) break;

      const transition = svg
        .transition()
        .duration(duration)
        .ease(d3.easeLinear);

      updateAxis(transition);
      updateBars(keyframe, transition);
      updateLabels(keyframe, transition);
      updateTicker(keyframe, transition);

      await transition.end().catch(() => {});
    }
  }

  run();

  wrapper.destroy = () => {
    stopped = true;
    svg.interrupt();
  };

  return wrapper;
}
