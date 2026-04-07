export function constituencySelect({
  state = {
    constituency: null,
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
    if (!state.constituency && options.length) {
      state.constituency = options[0];
    }

    container.innerHTML = `
      <div class="control control--constituency">
        <label for="constituency-select" class="control-label">Select a constituency</label>
        <select id="constituency-select" name="Select a constituency" class="control-input">
          ${options
            .map(
              (value) => `
                <option value="${escapeHtml(value)}" ${
                  state.constituency === value ? "selected" : ""
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
      state.constituency = select.value;
      onChange(state);
    });
  }

  Promise.resolve(resultsPromise)
    .then((rows) => {
      const options = uniqueSorted(
        (Array.isArray(rows) ? rows : [])
          .map((d) => d.constituency)
          .filter(Boolean),
      );

      render(options);
    })
    .catch(() => {
      render([]);
    });

  return container;
}
