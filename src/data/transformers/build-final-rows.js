import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.resolve(
  __dirname,
  "../derived/election-2025-normalised.json",
);

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../derived/election-2025-final-rows.json",
);

function compareRows(a, b) {
  if (a.count !== b.count) return a.count - b.count;
  if (a.votes !== b.votes) return a.votes - b.votes;
  return String(a.name).localeCompare(String(b.name), "en", {
    sensitivity: "base",
  });
}

function sortFinalRows(a, b) {
  return (
    String(a.panel).localeCompare(String(b.panel), "en", {
      sensitivity: "base",
    }) ||
    Number(a.electedPosition ?? 999) - Number(b.electedPosition ?? 999) ||
    Number(b.votes ?? 0) - Number(a.votes ?? 0) ||
    String(a.name).localeCompare(String(b.name), "en", {
      sensitivity: "base",
    })
  );
}

async function main() {
  const payload = JSON.parse(await fs.readFile(INPUT_PATH, "utf8"));
  const rows = payload?.data ?? [];

  const byPanelAndCandidate = new Map();

  for (const row of rows) {
    if (!row.panel || !row.name) continue;

    const key = `${row.panel}|||${row.name}`;
    const existing = byPanelAndCandidate.get(key);

    if (!existing || compareRows(existing, row) < 0) {
      byPanelAndCandidate.set(key, row);
    }
  }

  const finalRows = Array.from(byPanelAndCandidate.values()).sort(
    sortFinalRows,
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: "election-2025-normalised.json",
    rowCount: finalRows.length,
    fields: payload?.fields ?? [],
    data: finalRows,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Built ${finalRows.length} final candidate rows`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
