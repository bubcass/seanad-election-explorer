export function electionTimelineControls({
  state = {
    count: null,
  },
  resultsPromise = Promise.resolve([]),
  getPanel = () => null,
  getConstituency = null,
  onChange = () => {},
} = {}) {
  const container = document.createElement("div");
  container.className = "pq-controls pq-controls--timeline";

  let rowsCache = [];

  function getRowsForActiveGrouping() {
    const panel = typeof getPanel === "function" ? getPanel() : null;
    if (panel) {
      return rowsCache.filter((d) => d.panel === panel);
    }

    const constituency =
      typeof getConstituency === "function" ? getConstituency() : null;
    if (constituency) {
      return rowsCache.filter((d) => d.constituency === constituency);
    }

    return [];
  }

  function getAvailableCounts() {
    return Array.from(
      new Set(
        getRowsForActiveGrouping()
          .map((d) => d.count)
          .filter(Number.isFinite),
      ),
    ).sort((a, b) => a - b);
  }

  function ensureValidState() {
    const counts = getAvailableCounts();

    if (!counts.length) {
      state.count = null;
    } else if (!counts.includes(state.count)) {
      state.count = counts[counts.length - 1];
    }
  }

  function render() {
    ensureValidState();

    const counts = getAvailableCounts();
    const minCount = counts[0] ?? 1;
    const maxCount = counts[counts.length - 1] ?? 1;
    const currentCount = state.count ?? maxCount;
    const disabled = counts.length === 0;

    container.innerHTML = `
      <div class="control control--count">
        <label for="timeline-count-range" class="control-label">
          Select a count
        </label>

        <div class="count-slider-wrap">
          <div class="count-slider-meta">
            <span class="count-slider-meta__current">Count ${currentCount}</span>
            <span class="count-slider-meta__range">of ${maxCount}</span>
          </div>

          <input
            id="timeline-count-range"
            name="count-range"
            class="control-input control-input--range"
            type="range"
            min="${minCount}"
            max="${maxCount}"
            step="1"
            value="${currentCount}"
            ${disabled ? "disabled" : ""}
          />

          <label for="timeline-count-select" class="control-label control-label--sr-only">
            Jump to count
          </label>
          <select
            id="timeline-count-select"
            class="control-input control-input--count-select"
            ${disabled ? "disabled" : ""}
          >
            ${counts
              .map(
                (count) => `
                  <option value="${count}" ${count === currentCount ? "selected" : ""}>
                    Count ${count}
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>
      </div>
    `;

    const rangeInput = container.querySelector("#timeline-count-range");
    const selectInput = container.querySelector("#timeline-count-select");

    rangeInput?.addEventListener("input", () => {
      state.count = Number(rangeInput.value);
      if (selectInput) selectInput.value = String(state.count);
      onChange(state);
    });

    selectInput?.addEventListener("change", () => {
      state.count = Number(selectInput.value);
      if (rangeInput) rangeInput.value = String(state.count);
      onChange(state);
    });
  }

  Promise.resolve(resultsPromise)
    .then((rows) => {
      rowsCache = Array.isArray(rows) ? rows : [];
      render();
    })
    .catch(() => {
      rowsCache = [];
      render();
    });

  window.addEventListener("elections:change", () => {
    render();
  });

  return container;
}
