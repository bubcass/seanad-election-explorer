export function electionTimelineControls({
  state = {
    count: null,
  },
  resultsPromise = Promise.resolve([]),
  getConstituency = () => null,
  onChange = () => {},
} = {}) {
  const container = document.createElement("div");
  container.className = "pq-controls pq-controls--timeline";

  let rowsCache = [];

  function getRowsForSelectedConstituency() {
    const constituency = getConstituency();
    return rowsCache.filter((d) => d.constituency === constituency);
  }

  function getAvailableCounts() {
    return Array.from(
      new Set(
        getRowsForSelectedConstituency()
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
    const countDisabled = counts.length === 0;

    container.innerHTML = `
      <div class="control control--count">
        <label for="timeline-count" class="control-label">Select a count</label>
        <div class="count-slider-wrap">
          <input
            id="timeline-count"
            name="count"
            class="control-input control-input--range"
            type="range"
            min="${minCount}"
            max="${maxCount}"
            step="1"
            value="${currentCount}"
            ${countDisabled ? "disabled" : ""}
          />
        </div>
      </div>
    `;

    const countInput = container.querySelector("#timeline-count");

    countInput?.addEventListener("input", () => {
      state.count = Number(countInput.value);
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
