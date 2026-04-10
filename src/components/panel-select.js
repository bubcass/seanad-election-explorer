export function panelSelect({
  state = {
    panel: null,
  },
  resultsPromise = Promise.resolve([]),
  onChange = () => {},
} = {}) {
  const container = document.createElement("div");
  container.className = "pq-controls pq-controls--single";

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

  function render(options = []) {
    if (!state.panel && options.length) {
      state.panel = options[0];
    }

    container.innerHTML = `
      <div class="control control--panel">
        <label for="panel-select" class="control-label">Select a panel</label>
        <select id="panel-select" name="Select a panel" class="control-input">
          ${options
            .map(
              (value) => `
                <option value="${escapeHtml(value)}" ${
                  state.panel === value ? "selected" : ""
                }>
                  ${escapeHtml(value)}
                </option>
              `,
            )
            .join("")}
        </select>
      </div>
    `;

    const select = container.querySelector("select");
    select?.addEventListener("change", () => {
      state.panel = select.value;
      onChange(state);
    });
  }

  Promise.resolve(resultsPromise)
    .then((rows) => {
      const options = uniqueSorted(
        (Array.isArray(rows) ? rows : []).map((d) => d.panel).filter(Boolean),
      );

      render(options);
    })
    .catch(() => {
      render([]);
    });

  return container;
}
