// Fetches the Official World Golf Ranking and saves the top 300 to rankings.json.
// If anything goes wrong, it exits with an error and leaves the old file alone.
import { writeFileSync } from "node:fs";

const COUNT = 300;
const URL =
  "https://apiweb.owgr.com/api/owgr/rankings/getRankings" +
  `?regionId=0&pageSize=${COUNT}&pageNumber=1&countryId=0&sortString=Rank+ASC`;

// Find the first array of objects anywhere in the response
function findList(obj, depth = 0) {
  if (Array.isArray(obj) && obj.length && typeof obj[0] === "object") return obj;
  if (!obj || typeof obj !== "object" || depth > 4) return null;
  for (const v of Object.values(obj)) {
    const found = findList(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function nameOf(row) {
  const p = row.player || row.Player || row;
  if (p.fullName) return p.fullName;
  if (p.FullName) return p.FullName;
  if (p.name) return p.name;
  const first = p.firstName || p.FirstName || "";
  const last = p.lastName || p.LastName || "";
  return `${first} ${last}`.trim();
}

function rankOf(row, i) {
  const r = row.rank ?? row.Rank ?? row.position ?? row.thisWeekRank;
  const n = parseInt(r, 10);
  return Number.isFinite(n) ? n : i + 1;
}

const res = await fetch(URL, {
  headers: { Accept: "application/json", "User-Agent": "hotdawgs-golf-pool" }
});
if (!res.ok) {
  console.error(`OWGR request failed: HTTP ${res.status}`);
  process.exit(1);
}

const data = await res.json();
const list = findList(data);
if (!list) {
  console.error("Couldn't find a rankings list. Top-level keys:", Object.keys(data || {}));
  process.exit(1);
}

const players = list
  .map((row, i) => ({ name: nameOf(row), rank: rankOf(row, i) }))
  .filter((p) => p.name)
  .sort((a, b) => a.rank - b.rank);

if (players.length < 50) {
  console.error(`Only got ${players.length} players. Sample row:`, JSON.stringify(list[0]).slice(0, 500));
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync("rankings.json", JSON.stringify({ updated: today, source: "OWGR", players }, null, 2) + "\n");
console.log(`Saved ${players.length} players. #1 is ${players[0].name}.`);
