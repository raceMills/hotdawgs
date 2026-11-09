// Saves this week's and next week's tournament fields to field.json, from the
// PGA Tour's public schedule and field pages. The PGA Tour posts fields days
// before ESPN does, so the draft can start as soon as the field is set.
// Unofficial source: if anything looks wrong, this exits with an error and leaves
// the old file alone.
import { writeFileSync } from "node:fs";

const SITE = "https://www.pgatour.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (hotdawgs golf pool; weekly field check)", Accept: "text/html" };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function pageData(path) {
  const r = await fetch(SITE + path, { headers: HEADERS });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(await r.text());
  if (!m) throw new Error(`${path}: no page data`);
  const queries = ((((JSON.parse(m[1]).props || {}).pageProps || {}).dehydratedState) || {}).queries || [];
  return (name) => { const q = queries.find(x => Array.isArray(x.queryKey) && x.queryKey[0] === name); return q && q.state ? q.state.data : null; };
}

// Every object in a tree that looks like a schedule entry
function findTournaments(o, out = []) {
  if (!o || typeof o !== "object") return out;
  if (!Array.isArray(o) && o.tournamentId && o.displayDate) out.push(o);
  for (const v of Object.values(o)) findTournaments(v, out);
  return out;
}

// "Nov 12 - 15" or "Oct 30 - Nov 2" with year "2026" -> "2026-11-12"
function startDate(t) {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/.exec((t.displayDate || "").trim());
  const month = m && MONTHS[m[1].toLowerCase()];
  if (!month || !t.year) return null;
  return `${t.year}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

const schedule = (await pageData("/schedule"))("schedule");
const list = findTournaments(schedule)
  .map(t => ({ id: t.tournamentId, name: t.name, start: startDate(t), status: t.status, thisWeek: !!t.thisWeek }))
  .filter(t => t.id && t.start && /^R/.test(t.id));
const seen = new Set();
const tournaments = list.filter(t => !seen.has(t.id) && seen.add(t.id)).sort((a, b) => a.start.localeCompare(b.start));
if (!tournaments.length) { console.error("No tournaments found on the schedule page."); process.exit(1); }

// This week's event (or the next one coming up), plus the one after it
const today = new Date().toISOString().slice(0, 10);
let i = tournaments.findIndex(t => t.thisWeek);
if (i < 0) i = tournaments.findIndex(t => t.start >= today);
const targets = tournaments.slice(Math.max(i, 0), Math.max(i, 0) + 2);

const events = [];
for (const t of targets) {
  try {
    const field = (await pageData(`/tournaments/${t.start.slice(0, 4)}/x/${t.id}/field`))("field");
    const players = (field && field.players) || [];
    const name = (p) => `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.displayName || "";
    const rank = (p) => { const n = parseInt(p.owgr, 10); return Number.isFinite(n) ? n : null; };
    const inField = players.filter(p => !p.withdrawn && !p.alternate).map(p => ({ name: name(p), owgr: rank(p) })).filter(p => p.name);
    const alternates = players.filter(p => !p.withdrawn && p.alternate).map(p => ({ name: name(p), owgr: rank(p) })).filter(p => p.name);
    events.push({ pgaTourId: t.id, name: t.name, start: t.start, updated: field && field.lastUpdated ? new Date(field.lastUpdated).toISOString() : null, players: inField, alternates });
    console.log(`${t.name} (${t.start}): ${inField.length} in the field, ${alternates.length} alternates`);
  } catch (e) {
    console.log(`${t.name} (${t.start}): field not available (${e.message})`);
    events.push({ pgaTourId: t.id, name: t.name, start: t.start, updated: null, players: [], alternates: [] });
  }
}
if (!events.some(e => e.players.length)) console.log("No fields posted yet for these events.");

writeFileSync("field.json", JSON.stringify({ source: "PGA Tour", events }, null, 2) + "\n");
