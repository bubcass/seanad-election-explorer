export function electionControls({
  state = {
    election: "2024",
    constituency: "All constituencies",
    count: null,
    party: "All parties",
    candidate: "All candidates",
  },
  resultsPromise = Promise.resolve([]),
  onChange = () => {},
} = {}) {
  const container = document.createElement("div");
  container.className = "pq-controls";

  const uid = `election-controls-${Math.random().toString(36).slice(2, 10)}`;
  const electionId = `${uid}-election`;
  const constituencyId = `${uid}-constituency`;
  const countId = `${uid}-count`;
  const countOutputId = `${uid}-count-output`;
  const countJumpId = `${uid}-count-jump`;
  const partyId = `${uid}-party`;
  const candidateId = `${uid}-candidate`;

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

  function getRowsForConstituency(constituency) {
    if (!Array.isArray(rowsCache)) return [];
    if (!constituency || constituency === "All constituencies") {
      return rowsCache;
    }
    return rowsCache.filter((d) => d.constituency === constituency);
  }

  function getAvailableCounts(constituency) {
    const rows = getRowsForConstituency(constituency);
    return Array.from(
      new Set(rows.map((d) => d.count).filter(Number.isFinite)),
    ).sort((a, b) => a - b);
  }

  function getAvailableParties(constituency) {
    return uniqueSorted(
      getRowsForConstituency(constituency)
        .map((d) => d.party)
        .filter(Boolean),
    );
  }

  function getAvailableCandidates(constituency) {
    return uniqueSorted(
      getRowsForConstituency(constituency)
        .map((d) => d.name)
        .filter(Boolean),
    );
  }

  function ensureValidState() {
    const allConstituencies = uniqueSorted(
      rowsCache.map((d) => d.constituency).filter(Boolean),
    );

    if (
      state.constituency !== "All constituencies" &&
      !allConstituencies.includes(state.constituency)
    ) {
      state.constituency = allConstituencies[0] ?? "All constituencies";
    }

    const availableCounts = getAvailableCounts(state.constituency);
    if (!availableCounts.length) {
      state.count = null;
    } else if (!availableCounts.includes(state.count)) {
      state.count = availableCounts[availableCounts.length - 1];
    }

    const parties = getAvailableParties(state.constituency);
    if (state.party !== "All parties" && !parties.includes(state.party)) {
      state.party = "All parties";
    }

    const candidates = getAvailableCandidates(state.constituency);
    if (
      state.candidate !== "All candidates" &&
      !candidates.includes(state.candidate)
    ) {
      state.candidate = "All candidates";
    }
  }

  function updateCountUI(currentCount, maxCount) {
    const countOutput = container.querySelector(
      `#${CSS.escape(countOutputId)}`,
    );
    const countInput = container.querySelector(`#${CSS.escape(countId)}`);
    const countJump = container.querySelector(`#${CSS.escape(countJumpId)}`);

    if (countOutput) {
      countOutput.textContent =
        maxCount == null
          ? "No counts available"
          : `Count ${currentCount} of ${maxCount}`;
    }

    if (countInput && String(countInput.value) !== String(currentCount)) {
      countInput.value = String(currentCount);
    }

    if (countJump && String(countJump.value) !== String(currentCount)) {
      countJump.value = String(currentCount);
    }
  }

  function render() {
    ensureValidState();

    const constituencies = uniqueSorted(
      rowsCache.map((d) => d.constituency).filter(Boolean),
    );

    const availableCounts = getAvailableCounts(state.constituency);
    const availableParties = getAvailableParties(state.constituency);
    const availableCandidates = getAvailableCandidates(state.constituency);

    const minCount = availableCounts[0] ?? 1;
    const maxCount = availableCounts[availableCounts.length - 1] ?? 1;
    const currentCount = state.count ?? maxCount ?? 1;
    const countDisabled = availableCounts.length === 0;

    container.innerHTML = `
      <div class="control">
        <label for="${electionId}" class="control-label">Election</label>
        <select id="${electionId}" name="election" class="control-input">
          <option value="2024" ${state.election === "2024" ? "selected" : ""}>2024 general election</option>
        </select>
      </div>

      <div class="control">
        <label for="${constituencyId}" class="control-label">Constituency</label>
        <select id="${constituencyId}" name="constituency" class="control-input">
          ${constituencies
            .map(
              (value) =>
                `<option value="${escapeHtml(value)}" ${
                  state.constituency === value ? "selected" : ""
                }>${escapeHtml(value)}</option>`,
            )
            .join("")}
        </select>
      </div>

      <div class="control control--count">
        <label for="${countId}" class="control-label">Count</label>
        <div class="count-slider-wrap">
          <input
            id="${countId}"
            name="count"
            class="control-input control-input--range"
            type="range"
            min="${minCount}"
            max="${maxCount}"
            step="1"
            value="${currentCount}"
            ${countDisabled ? "disabled" : ""}
          />
          <div id="${countOutputId}" class="count-output">
            ${countDisabled ? "No counts available" : `Count ${currentCount} of ${maxCount}`}
          </div>
          <select
            id="${countJumpId}"
            name="count-jump"
            class="control-input control-input--count-select"
            ${countDisabled ? "disabled" : ""}
          >
            ${availableCounts
              .map(
                (value) =>
                  `<option value="${value}" ${
                    currentCount === value ? "selected" : ""
                  }>Count ${value}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="control">
        <label for="${partyId}" class="control-label">Party</label>
        <select id="${partyId}" name="party" class="control-input">
          <option value="All parties" ${state.party === "All parties" ? "selected" : ""}>All parties</option>
          ${availableParties
            .map(
              (value) =>
                `<option value="${escapeHtml(value)}" ${
                  state.party === value ? "selected" : ""
                }>${escapeHtml(value)}</option>`,
            )
            .join("")}
        </select>
      </div>

      <div class="control">
        <label for="${candidateId}" class="control-label">Candidate</label>
        <select id="${candidateId}" name="candidate" class="control-input">
          <option value="All candidates" ${state.candidate === "All candidates" ? "selected" : ""}>All candidates</option>
          ${availableCandidates
            .map(
              (value) =>
                `<option value="${escapeHtml(value)}" ${
                  state.candidate === value ? "selected" : ""
                }>${escapeHtml(value)}</option>`,
            )
            .join("")}
        </select>
      </div>
    `;

    const electionSelect = container.querySelector(
      `#${CSS.escape(electionId)}`,
    );
    const constituencySelect = container.querySelector(
      `#${CSS.escape(constituencyId)}`,
    );
    const countInput = container.querySelector(`#${CSS.escape(countId)}`);
    const countJump = container.querySelector(`#${CSS.escape(countJumpId)}`);
    const partySelect = container.querySelector(`#${CSS.escape(partyId)}`);
    const candidateSelect = container.querySelector(
      `#${CSS.escape(candidateId)}`,
    );

    electionSelect?.addEventListener("change", () => {
      state.election = electionSelect.value;
      onChange(state);
    });

    constituencySelect?.addEventListener("change", () => {
      state.constituency = constituencySelect.value;

      const counts = getAvailableCounts(state.constituency);
      state.count = counts.length ? counts[counts.length - 1] : null;
      state.party = "All parties";
      state.candidate = "All candidates";

      render();
      onChange(state);
    });

    countInput?.addEventListener("input", () => {
      state.count = Number(countInput.value);
      updateCountUI(state.count, maxCount);
      onChange(state);
    });

    countJump?.addEventListener("change", () => {
      state.count = Number(countJump.value);
      updateCountUI(state.count, maxCount);
      onChange(state);
    });

    partySelect?.addEventListener("change", () => {
      state.party = partySelect.value;
      onChange(state);
    });

    candidateSelect?.addEventListener("change", () => {
      state.candidate = candidateSelect.value;
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

  return container;
}
