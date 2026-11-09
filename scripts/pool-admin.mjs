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
  console.log("\nESPN by date 20261107:", JSON.stringify(await espn("?dates=20261107")));
  console.log("ESPN by date 20251114:", JSON.stringify(await espn("?dates=20251114")));
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

const run = { status, "start-week": startWeek, pin }[mode];
if (!run) { console.error(`Unknown mode "${mode}"`); process.exit(1); }
run().catch(e => { console.error(e.message); process.exit(1); });
