import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as d3 from "d3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.resolve(__dirname, "../seanad_count.csv");
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../derived/election-2025-normalised.json",
);

function cleanString(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseStatus(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const map = new Map([
    ["continuing", "Continuing"],
    ["deemed elected", "Deemed Elected"],
    ["excluded", "Excluded"],
  ]);

  return map.get(cleaned.toLowerCase()) ?? cleaned;
}

function extractElectionDate(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const parts = cleaned.split(",").map((d) => d.trim());
  return parts[2] || null;
}

function makeCandidateName(row) {
  const first = cleanString(row.SeanadElectionCountPanelCandidateFirstName);
  const last = cleanString(row.SeanadElectionCountPanelCandidateLastName);
  const full = `${first} ${last}`.trim();

  if (full) return full;

  const fallback = cleanString(row.CandidateName);
  if (!fallback) return "";

  if (fallback.includes(",")) {
    const [lastName, firstName] = fallback.split(",").map((d) => d.trim());
    return `${firstName} ${lastName}`.trim();
  }

  return fallback;
}

function buildElectedCountLookup(rows) {
  const lookup = new Map();

  for (const row of rows) {
    const name = makeCandidateName(row);
    const count = toNumber(row.SeanadElectionCountNo);
    const status = normaliseStatus(
      row.SeanadElectionCountPanelCandidateStatusNameENG,
    );

    if (!name || !Number.isFinite(count)) continue;
    if (status !== "Deemed Elected") continue;

    const existing = lookup.get(name);
    if (existing == null || count < existing) {
      lookup.set(name, count);
    }
  }

  return lookup;
}

function sortRows(a, b) {
  return (
    d3.ascending(a.panel, b.panel) ||
    d3.ascending(a.subPanel, b.subPanel) ||
    d3.ascending(a.count, b.count) ||
    d3.ascending(a.name, b.name)
  );
}

async function main() {
  const csvText = await fs.readFile(INPUT_PATH, "utf8");
  const rawRows = d3.csvParse(csvText);

  const electedCountLookup = buildElectedCountLookup(rawRows);

  const rows = rawRows.map((d, index) => {
    const name = makeCandidateName(d);
    const firstName = cleanString(d.SeanadElectionCountPanelCandidateFirstName);
    const surname = cleanString(d.SeanadElectionCountPanelCandidateLastName);
    const count = toNumber(d.SeanadElectionCountNo);

    return {
      rowId: index + 1,
      election: "2025",
      electionLabel: "2025 Seanad election",
      house: "Seanad Éireann",

      name,
      firstName: firstName || null,
      surname: surname || null,

      panel: cleanString(d.SeanadElectionPanelNameENG) || null,
      subPanel: cleanString(d.SeanadElectionSubPanelNameENG) || null,
      area: cleanString(d.SeanadElectionCountPanelAreaNameENG) || null,

      count,
      barRaceOrder: count,

      votes: toNumber(d.Votes) ?? 0,
      transfer: toNumber(d.SeanadElectionCountDelegateVotesTransferNo) ?? 0,
      delegateVotes: toNumber(d.SeanadElectionCountDelegateVotesNo),
      quota: toNumber(d.SeanadElectionCountPanelQuota),

      status: normaliseStatus(d.SeanadElectionCountPanelCandidateStatusNameENG),
      position: toNumber(d.SeanadElectionCountStateOfThePollPositionNo),
      candidatePosition: toNumber(
        d.SeanadElectionCountPanelCandidatePositionNo,
      ),
      electedPosition: toNumber(
        d.SeanadElectionCountPanelCandidateElectedPositionNo,
      ),
      electedCount: electedCountLookup.get(name) ?? null,

      outcomeType: cleanString(d.SeanadElectionCountOutcomeTypeNameENG) || null,
      countTypeId: toNumber(d.SeanadElectionCountTypeID),

      electionDate: extractElectionDate(d.ElectionPanelNameAndArea),

      candidateNameRaw: cleanString(d.CandidateName) || null,
      note: cleanString(d.SeanadElectionCountPanelCandidateNote) || null,
    };
  });

  const cleanedRows = rows
    .filter((d) => d.name && d.panel && Number.isFinite(d.count))
    .sort(sortRows);

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(INPUT_PATH),
    rowCount: cleanedRows.length,
    fields: [
      "rowId",
      "election",
      "electionLabel",
      "house",
      "name",
      "firstName",
      "surname",
      "panel",
      "subPanel",
      "area",
      "count",
      "barRaceOrder",
      "votes",
      "transfer",
      "delegateVotes",
      "quota",
      "status",
      "position",
      "candidatePosition",
      "electedPosition",
      "electedCount",
      "outcomeType",
      "countTypeId",
      "electionDate",
      "candidateNameRaw",
      "note",
    ],
    data: cleanedRows,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Normalised ${cleanedRows.length} rows`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
