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
  const html = await r.text();
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`${path}: no page data`);
  const queries = ((((JSON.parse(m[1]).props || {}).pageProps || {}).dehydratedState) || {}).queries || [];
  const get = (name) => { const q = queries.find(x => Array.isArray(x.queryKey) && x.queryKey[0] === name); return q && q.state ? q.state.data : null; };
  get.all = queries;
  get.html = html;
  return get;
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

// Odds to win, when the PGA Tour has posted them (usually a few days before the event).
// Field names vary, so this reads them defensively and skips anything it doesn't recognize.
function oddsMap(data) {
  const out = new Map();
  const rows = data && (data.players || data.odds || (data.oddsToWin && data.oddsToWin.players)) || [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = r.player || r;
    const nm = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.displayName || p.playerName || p.name || "";
    let o = r.odds ?? r.oddsToWin ?? r.currentOdds ?? r.oddsValue ?? r.value;
    if (o && typeof o === "object") o = o.odds ?? o.value ?? o.displayOdds;
    if (typeof o === "number") o = (o > 0 ? "+" : "") + o;
    if (nm && typeof o === "string" && /^[+-]?\d+(\/\d+)?$/.test(o.trim())) out.set(normName(nm), o.trim());
  }
  return out;
}
const normName = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
// The odds page lists each golfer as: aria-label="Odds to win for Jackson Koivun: +1300"
function oddsFromHtml(html) {
  const out = new Map(), re = /Odds to win for ([^":<]+): ([+-]?\d+)/g;
  let x;
  while ((x = re.exec(html || ""))) out.set(normName(x[1].replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")), x[2]);
  return out;
}
async function oddsFor(t, get) {
  let m = oddsMap(get("oddsToWin"));
  if (!m.size) m = oddsFromHtml(get.html);
  if (m.size) return m;
  try {
    const page = await pageData(`/tournaments/${t.start.slice(0, 4)}/x/${t.id}/odds`);
    m = oddsMap(page("oddsToWin"));
    if (!m.size) m = oddsFromHtml(page.html);
  } catch (e) { m = new Map(); }
  return m;
}

// TV, streaming and radio windows from the tournament page ("broadcastCoverage")
const KIND = { BroadcastFullTelecast: "TV", BroadcastFeaturedGroup: "Featured groups", BroadcastFeaturedHole: "Featured holes",
  BroadcastAudioStream: "Radio", BroadcastLiveStream: "Live stream" };
// Where the tournament is (for the weather forecast): city from the tournament page,
// coordinates from Open-Meteo's free geocoder
function findById(o, id) {
  if (!o || typeof o !== "object") return null;
  if (!Array.isArray(o) && o.id === id && o.city) return o;
  for (const v of Object.values(o)) { const f = findById(v, id); if (f) return f; }
  return null;
}
async function placeFor(t, get) {
  const info = findById(get.all, t.id);
  if (!info) return null;
  const course = ((info.courses || []).find(c => c.hostCourse) || (info.courses || [])[0] || {}).courseName || "";
  const where = { city: info.city, state: info.state || "", country: info.country || "", course, tz: info.timezone || "" };
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=${encodeURIComponent(info.city)}`);
    const hits = ((await r.json()).results || []);
    const iso3 = { USA: "US", MEX: "MX", CAN: "CA", GBR: "GB", ENG: "GB", SCO: "GB", JPN: "JP", BHS: "BS", BER: "BM", PUR: "PR", DOM: "DO", KOR: "KR", AUS: "AU", ARE: "AE" }[info.country] || "";
    const hit = hits.find(h => (!iso3 || h.country_code === iso3) && (!info.state || h.admin1 === info.state)) || hits.find(h => !iso3 || h.country_code === iso3) || hits[0];
    if (hit) Object.assign(where, { lat: hit.latitude, lon: hit.longitude });
  } catch (e) { console.log(`geocode: ${e.message}`); }
  return where;
}
let lastPlace = null;
async function watchFor(t) {
  try {
    const get = await pageData(`/tournaments/${t.start.slice(0, 4)}/x/${t.id}`);
    try { lastPlace = await placeFor(t, get); } catch (e) { lastPlace = null; }
    const cov = get("broadcastCoverage");
    const list = (cov && (cov.coverageType || cov.coverage)) || [];
    const seen = new Set();
    return list.map(c => ({
      round: c.roundNumber || null,
      start: Number(c.startTime) || null, end: Number(c.endTime) || null,
      kind: KIND[c.__typename] || c.channelTitle || c.streamTitle || "Coverage",
      network: (c.network && c.network.networkName) || "",
      url: (c.network && (c.network.iOSLink || c.network.url)) || ""
    })).filter(x => x.start && x.network && !seen.has(x.network + x.start + x.kind) && seen.add(x.network + x.start + x.kind))
      .sort((a, b) => a.start - b.start);
  } catch (e) { console.log(`watch: ${e.message}`); return []; }
}

const events = [];
for (const t of targets) {
  const watch = await watchFor(t);
  const where = lastPlace;
  try {
    const get = await pageData(`/tournaments/${t.start.slice(0, 4)}/x/${t.id}/field`);
    const field = get("field");
    const players = (field && field.players) || [];
    const name = (p) => `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.displayName || "";
    const rank = (p) => { const n = parseInt(p.owgr, 10); return Number.isFinite(n) ? n : null; };
    const inField = players.filter(p => !p.withdrawn && !p.alternate).map(p => ({ name: name(p), owgr: rank(p) })).filter(p => p.name);
    const alternates = players.filter(p => !p.withdrawn && p.alternate).map(p => ({ name: name(p), owgr: rank(p) })).filter(p => p.name);
    let odds = new Map();
    try { odds = await oddsFor(t, get); } catch (e) { console.log(`odds: ${e.message}`); }
    for (const p of inField.concat(alternates)) { const o = odds.get(normName(p.name)); if (o) p.odds = o; }
    events.push({ pgaTourId: t.id, name: t.name, start: t.start, updated: field && field.lastUpdated ? new Date(field.lastUpdated).toISOString() : null, players: inField, alternates, watch, where });
    console.log(`${t.name} (${t.start}): ${inField.length} in the field, ${alternates.length} alternates, ${odds.size} odds, ${watch.length} TV/stream windows, ${where && where.lat ? `${where.city} ${where.lat},${where.lon}` : "no location"}`);
  } catch (e) {
    console.log(`${t.name} (${t.start}): field not available (${e.message})`);
    events.push({ pgaTourId: t.id, name: t.name, start: t.start, updated: null, players: [], alternates: [], watch, where });
  }
}
if (!events.some(e => e.players.length)) console.log("No fields posted yet for these events.");

writeFileSync("field.json", JSON.stringify({ source: "PGA Tour", events }, null, 2) + "\n");
