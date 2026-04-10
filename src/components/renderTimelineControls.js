export function renderTimelineControls({
  state = { count: null, panel: null },
  resultsPromise = Promise.resolve([]),
  getPanel = () => null,
  onChange = () => {},
} = {}) {
  const container = document.createElement("div");
  container.className = "pq-controls pq-controls--timeline";

  let rowsCache = [];

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) =>
      String(a).localeCompare(String(b), "en", { sensitivity: "base" }),
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getActivePanelValue() {
    const panel = getPanel();

    if (panel) return panel;

    const availablePanels = uniqueSorted(
      rowsCache.map((d) => d.panel).filter(Boolean),
    );

    const fallbackPanel = availablePanels[0] ?? null;

    if (fallbackPanel && !state.panel) {
      state.panel = fallbackPanel;
    }

    return fallbackPanel;
  }

  function getRowsForActivePanel() {
    const panel = getActivePanelValue();
    if (!panel) return [];
    return rowsCache.filter((d) => d.panel === panel);
  }

  function getAvailableCounts() {
    return Array.from(
      new Set(
        getRowsForActivePanel()
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
    const disabled = counts.length === 0;
    const currentCount = state.count ?? "";

    container.innerHTML = `
      <div class="control control--count-select">
        <label for="timeline-count-select" class="control-label">
          Select a count
        </label>
        <select
          id="timeline-count-select"
          class="control-input control-input--count-dropdown"
          ${disabled ? "disabled" : ""}
        >
          ${counts
            .map(
              (count) => `
                <option value="${count}" ${count === currentCount ? "selected" : ""}>
                  ${escapeHtml(`Count ${count}`)}
                </option>
              `,
            )
            .join("")}
        </select>
      </div>
    `;

    const select = container.querySelector("#timeline-count-select");

    select?.addEventListener("change", () => {
      state.count = Number(select.value);
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

  window.addEventListener("elections:change", render);

  return container;
}
