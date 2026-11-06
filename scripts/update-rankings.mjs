// Fetches the Official World Golf Ranking (up to 1,000 players) and saves it to rankings.json.
// If anything goes wrong, it exits with an error and leaves the old file alone.
import { writeFileSync } from "node:fs";

const PAGE_SIZE = 250;
const MAX_PAGES = 4; // 4 x 250 = top 1,000
const pageUrl = (page) =>
  "https://apiweb.owgr.com/api/owgr/rankings/getRankings" +
  `?regionId=0&pageSize=${PAGE_SIZE}&pageNumber=${page}&countryId=0&sortString=Rank+ASC`;

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
  const first = p.firstName || p.FirstName || "";
  const last = p.lastName || p.LastName || "";
  // Prefer "First Last" built from parts, since full-name fields are sometimes "Last, First"
  if (first && last) return `${first} ${last}`.trim();
  return p.fullName || p.FullName || p.name || `${first} ${last}`.trim();
}

function rankOf(row, i) {
  const r = row.rank ?? row.Rank ?? row.position ?? row.thisWeekRank;
  const n = parseInt(r, 10);
  return Number.isFinite(n) ? n : i + 1;
}

const byName = new Map();
for (let page = 1; page <= MAX_PAGES; page++) {
  const res = await fetch(pageUrl(page), {
    headers: { Accept: "application/json", "User-Agent": "hotdawgs-golf-pool" }
  });
  if (!res.ok) {
    if (page === 1) {
      console.error(`OWGR request failed: HTTP ${res.status}`);
      process.exit(1);
    }
    console.log(`Page ${page} failed (HTTP ${res.status}); keeping what we have.`);
    break;
  }
  const data = await res.json();
  const list = findList(data);
  if (!list) {
    if (page === 1) {
      console.error("Couldn't find a rankings list. Top-level keys:", Object.keys(data || {}));
      process.exit(1);
    }
    break;
  }
  const before = byName.size;
  list.forEach((row, i) => {
    const name = nameOf(row);
    if (name && !byName.has(name)) byName.set(name, rankOf(row, (page - 1) * PAGE_SIZE + i));
  });
  console.log(`Page ${page}: ${list.length} rows, ${byName.size - before} new players.`);
  if (byName.size === before || list.length < PAGE_SIZE) break; // no more pages
}

const players = [...byName].map(([name, rank]) => ({ name, rank })).sort((a, b) => a.rank - b.rank);
if (players.length < 50) {
  console.error(`Only got ${players.length} players.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync("rankings.json", JSON.stringify({ updated: today, source: "OWGR", players }, null, 2) + "\n");
console.log(`Saved ${players.length} players. #1 is ${players[0].name}.`);
