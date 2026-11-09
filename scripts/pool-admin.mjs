// Pool admin tasks that need the database, run from GitHub Actions.
//   status                     Show the pool's weeks and what ESPN is reporting.
//   start-week [week] [name] [start]
//                              Start the next pool week (or a given week) and pin it to a
//                              tournament. Without a name it uses ESPN's current event.
//   pin <week> <name> <start>  Pin an existing week to a tournament (start = YYYY-MM-DD).
// Reads the database address and public key from index.html, same as the app.
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const DB = html.match(/SUPABASE_URL = "([^"]+)"/)[1];
const KEY = html.match(/SUPABASE_KEY = "([^"]+)"/)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const [mode = "status", weekArg = "", nameArg = "", startArg = ""] = process.argv.slice(2);

const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function deepMerge(t, s) {
  for (const k of Object.keys(s)) {
    if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]);
    else t[k] = s[k];
  }
  return t;
}
async function getRow(table, col, val) {
  const r = await fetch(`${DB}/rest/v1/${table}?${col}=eq.${val}&select=*`, { headers: H });
  if (!r.ok) throw new Error(`Read ${table} failed: ${r.status} ${await r.text()}`);
  return (await r.json())[0] || null;
}
async function patchRow(table, key, patch) {
  const [col, val] = Object.entries(key)[0];
  const row = await getRow(table, col, val);
  const data = deepMerge(row ? row.data : {}, patch);
  const r = await fetch(`${DB}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...key, data })
  });
  if (!r.ok) throw new Error(`Write ${table} failed: ${r.status} ${await r.text()}`);
  return data;
}

async function espn(query = "") {
  const r = await fetch(ESPN + query);
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const d = await r.json();
  const ev = (d.events || [])[0];
  const comp = ev && (ev.competitions || [])[0];
  const c0 = comp && (comp.competitors || [])[0];
  return {
    name: ev && ev.name,
    start: ev && (ev.date || "").slice(0, 10),
    end: ev && (ev.endDate || "").slice(0, 10),
    status: ev && ev.status && ev.status.type && ev.status.type.shortDetail,
    completed: !!(ev && ev.status && ev.status.type && ev.status.type.completed),
    venue: comp && comp.venue && comp.venue.fullName,
    competitors: comp ? (comp.competitors || []).length : 0,
    sample: c0 && {
      athlete: c0.athlete && c0.athlete.displayName, order: c0.order, score: c0.score,
      position: c0.status && c0.status.position, thru: c0.status && c0.status.thru,
      statusType: c0.status && c0.status.type && c0.status.type.name
    },
    calendarEvents: ((d.leagues || [])[0] || {}).calendar ? d.leagues[0].calendar.length : 0
  };
}

// The first calendar event that hasn't finished yet
async function nextEvent() {
  const d = await (await fetch(ESPN)).json();
  const cal = ((d.leagues || [])[0] || {}).calendar || [];
  const today = new Date().toISOString().slice(0, 10);
  const e = cal.map(x => ({ name: x.label, start: (x.startDate || "").slice(0, 10), end: (x.endDate || "").slice(0, 10) }))
    .filter(x => x.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  return e || null;
}
// Raw field shapes for a date, to check how cuts and positions are reported
async function probe(date) {
  const d = await (await fetch(ESPN + "?dates=" + date)).json();
  const comp = d.events[0].competitions[0];
  const cs = comp.competitors;
  const show = (c) => ({ keys: Object.keys(c), order: c.order, score: c.score, status: c.status,
    linescores: (c.linescores || []).map(l => ({ period: l.period, value: l.value, displayValue: l.displayValue, holes: (l.linescores || []).length })) });
  console.log("\nProbe", date, d.events[0].name, "competitor count", cs.length);
  console.log("first:", JSON.stringify(show(cs[0])));
  console.log("middle:", JSON.stringify(show(cs[70])));
  console.log("last:", JSON.stringify(show(cs[cs.length - 1])));
  console.log("event status:", JSON.stringify(d.events[0].status));
}

async function status() {
  const cfg = (await getRow("pool_config", "id", "main")) || { data: {} };
  const cur = cfg.data.currentWeek || 1;
  console.log(`Current pool week: ${cur}`);
  console.log(`Venmo names saved: ${Object.keys(cfg.data.venmo || {}).length}`);
  for (let w = 1; w <= cur; w++) {
    const row = await getRow("pool_weeks", "week", w);
    const d = row ? row.data : {};
    const picks = d.picks || {};
    const full = Object.values(picks).filter(p => p && p.hot && p.dawg).length;
    const s = d.settle;
    console.log(`Week ${w}: tournament=${d.tournament ? `${d.tournament.name} (${d.tournament.start})` : "not pinned"}; ` +
      `picks=${Object.keys(picks).length} members, ${full} complete; finishes=${Object.keys(d.finishes || {}).length}; ` +
      `settled=${s && s.winner ? `${s.winner} [${(s.rules || []).join(",")}]` : "no"}; paid=${Object.values(d.paid || {}).filter(Boolean).length}`);
  }
  console.log("\nESPN current event:", JSON.stringify(await espn(), null, 1));
  const next = nextEvent ? await nextEvent() : null;
  if (next) console.log("\nNext event on ESPN's calendar:", JSON.stringify(next));
  if (next) console.log("ESPN by that date:", JSON.stringify(await espn("?dates=" + next.start.replace(/-/g, ""))));
  if (process.env.PROBE) await probe(process.env.PROBE);
}


// Look for this week's field in every ESPN source we know of, and report which
// ones have players and allow a browser to read them (CORS).
async function fieldProbe() {
  let start = startArg;
  if (!start) {
    const cfg = (await getRow("pool_config", "id", "main")) || { data: {} };
    const row = await getRow("pool_weeks", "week", cfg.data.currentWeek || 1);
    start = row && row.data.tournament ? row.data.tournament.start : "";
  }
  const d = await (await fetch(ESPN + "?dates=" + start.replace(/-/g, ""))).json();
  const ev = d.events[0], comp = ev.competitions[0];
  console.log(`Event ${ev.id} "${ev.name}" competition ${comp.id}; scoreboard competitors: ${(comp.competitors || []).length}`);
  const count = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 6) return [];
    const found = [];
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object" && (k === "competitors" || k === "items" || k === "athletes" || k === "players"))
        found.push(`${k}:${v.length}`);
      else if (typeof v === "object") found.push(...count(v, depth + 1));
    }
    return found;
  };
  const urls = [
    `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${ev.id}`,
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard?event=${ev.id}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard/players?event=${ev.id}`,
    `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${ev.id}/competitions/${comp.id}/competitors?limit=300`,
    `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${ev.id}`,
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard/${ev.id}`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { Origin: "https://racemills.github.io" } });
      const text = await r.text();
      let summary = "";
      try { const j = JSON.parse(text); summary = `keys=${Object.keys(j).slice(0, 8).join(",")} lists=[${count(j).slice(0, 6).join(" ")}]` + (j.count != null ? ` count=${j.count}` : ""); }
      catch (e) { summary = "not JSON: " + text.slice(0, 120).replace(/\s+/g, " "); }
      console.log(`\n${r.status} cors=${r.headers.get("access-control-allow-origin")} ${u}\n   ${summary}`);
      if (u.includes("/competitors?") && r.ok) {
        const j = JSON.parse(text);
        const first = (j.items || [])[0];
        if (first) console.log("   first item:", JSON.stringify(first).slice(0, 400));
      }
    } catch (e) { console.log(`\nERR ${u} ${e.message}`); }
  }
}

async function startWeek() {
  const cfg = (await getRow("pool_config", "id", "main")) || { data: {} };
  const cur = cfg.data.currentWeek || 1;
  const week = Number(weekArg) || cur + 1;
  let name = nameArg, start = startArg;
  if (!name) { const e = await espn(); name = e.name; start = e.start; }
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start || "")) throw new Error(`Need a tournament name and YYYY-MM-DD start (got "${name}", "${start}")`);
  await patchRow("pool_weeks", { week }, { tournament: { name, start } });
  await patchRow("pool_config", { id: "main" }, { currentWeek: week });
  console.log(`Started week ${week}: ${name} (${start}). Was on week ${cur}.`);
}

async function pin() {
  const week = Number(weekArg);
  if (!week || !nameArg || !/^\d{4}-\d{2}-\d{2}$/.test(startArg)) throw new Error("Usage: pin <week> <name> <YYYY-MM-DD>");
  await patchRow("pool_weeks", { week }, { tournament: { name: nameArg, start: startArg } });
  console.log(`Pinned week ${week} to ${nameArg} (${startArg}).`);
}

const run = { status, "start-week": startWeek, pin, field: fieldProbe }[mode];
if (!run) { console.error(`Unknown mode "${mode}"`); process.exit(1); }
run().catch(e => { console.error(e.message); process.exit(1); });
