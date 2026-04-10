#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error(
    "Usage: node build-bar-race.js <input-normalised.json> <output.json>",
  );
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const payload = JSON.parse(raw);
const rows = Array.isArray(payload?.data) ? payload.data : [];

const membersPath = path.resolve(
  path.dirname(inputPath),
  "../seanad-members.json",
);
const membersRaw = fs.readFileSync(membersPath, "utf8");
const members = JSON.parse(membersRaw);

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalPersonName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findMatchingMember(name, panel) {
  const canonName = canonicalPersonName(name);
  const cleanPanel = clean(panel);

  return (
    members.find(
      (m) =>
        clean(m.Constituency) === cleanPanel &&
        canonicalPersonName(m.Senator) === canonName,
    ) ?? null
  );
}

const byPanel = new Map();

for (const row of rows) {
  if (!row.panel || !row.name || !Number.isFinite(row.count)) continue;

  const matched = findMatchingMember(row.name, row.panel);

  if (!byPanel.has(row.panel)) {
    byPanel.set(row.panel, []);
  }

  byPanel.get(row.panel).push({
    name: row.name,
    firstName: row.firstName ?? null,
    surname: row.surname ?? null,
    party: matched?.Party ?? null,
    subPanel: row.subPanel ?? null,
    count: Number(row.count),
    transfer: Number(row.transfer) || 0,
    value: Number(row.votes) || 0,
    status: row.status || "Continuing",
    panel: row.panel,
    quota: Number(row.quota) || 0,
    electedPosition: Number(row.electedPosition) || null,
    electedCount: Number(row.electedCount) || null,
  });
}

const output = Array.from(byPanel, ([panel, records]) => {
  const quota = records[0]?.quota ?? 0;
  const maxValue = Math.max(...records.map((d) => d.value), 0);
  const maxCount = Math.max(...records.map((d) => d.count), 0);

  const candidates = Array.from(
    new Map(
      records.map((d) => [
        d.name,
        {
          name: d.name,
          firstName: d.firstName,
          surname: d.surname,
          party: d.party,
          subPanel: d.subPanel,
          electedPosition: d.electedPosition,
          electedCount: d.electedCount,
        },
      ]),
    ).values(),
  ).sort((a, b) => {
    return (
      String(a.surname ?? a.name).localeCompare(
        String(b.surname ?? b.name),
        "en",
        { sensitivity: "base" },
      ) ||
      String(a.name).localeCompare(String(b.name), "en", {
        sensitivity: "base",
      })
    );
  });

  const countsMap = new Map();

  for (const row of records) {
    if (!countsMap.has(row.count)) {
      countsMap.set(row.count, {
        count: row.count,
        values: {},
        transfers: {},
        status: {},
      });
    }

    const frame = countsMap.get(row.count);
    frame.values[row.name] = row.value;
    frame.transfers[row.name] = row.transfer;
    frame.status[row.name] = row.status;
  }

  const counts = Array.from(countsMap.values()).sort(
    (a, b) => a.count - b.count,
  );

  return {
    panel,
    quota,
    maxValue,
    maxCount,
    candidates,
    counts,
  };
}).sort((a, b) =>
  String(a.panel).localeCompare(String(b.panel), "en", {
    sensitivity: "base",
  }),
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Built bar-race data for ${output.length} panels`);
console.log(`Saved to ${outputPath}`);
