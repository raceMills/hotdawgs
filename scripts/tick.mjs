// The pool's background clock, run every 10 minutes by GitHub Actions.
//  - Opens the draft once the week's field is posted (PGA Tour field.json or ESPN)
//  - Auto-picks for whoever's pick clock has run out (their queue first)
//  - Settles finished weeks: winner and payouts, straight from the final leaderboard
//  - Sends phone notifications: draft open, on the clock, auto-picked, draft done, results
// Uses the same rules file as the app (core.js). Notifications need the
// VAPID_PRIVATE_KEY repository secret; without it everything else still runs.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../core.js");

const html = readFileSync("index.html", "utf8");
const DB = html.match(/SUPABASE_URL = "([^"]+)"/)[1];
const KEY = html.match(/SUPABASE_KEY = "([^"]+)"/)[1];
const APP_URL = process.env.APP_URL || "https://racemills.github.io/hotdawgs/";
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "BAyYGAS98RtfK9KtuSmWJwE_GpNDsmOUo6mEDEClKumfHA26w38r7xM41C3FAj5exzCe_mFEEkUdV4EU3hL_x_s";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const NOW = Number(process.env.TICK_NOW) || Date.now();
const DRY = process.env.DRY_RUN === "1";
const log = (...a) => console.log(...a);
const QUIET = C.quietAt(NOW); // 11pm–7am Central: notifications wait for morning

// ---------- Database ----------
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
// Merge into the freshest copy so we never clobber a pick made seconds ago
async function patchRow(table, key, patch) {
  const [col, val] = Object.entries(key)[0];
  const row = await getRow(table, col, val);
  const data = deepMerge(row ? row.data : {}, patch);
  if (DRY) { log(`[dry run] ${table} ${val}:`, JSON.stringify(patch)); return data; }
  const r = await fetch(`${DB}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...key, data })
  });
  if (!r.ok) throw new Error(`Write ${table} failed: ${r.status} ${await r.text()}`);
  return data;
}
const loadWeek = async (w) => ((await getRow("pool_weeks", "week", w)) || {}).data || {};
const saveWeek = (w, patch) => patchRow("pool_weeks", { week: w }, patch);

// ---------- Golf data ----------
async function board(start) {
  try {
    const r = await fetch(ESPN + (start ? "?dates=" + start.replace(/-/g, "") : ""));
    if (!r.ok) return null;
    return C.parseScoreboard(await r.json());
  } catch (e) { return null; }
}
function savedField(start) {
  if (!existsSync("field.json")) return null;
  const e = (JSON.parse(readFileSync("field.json", "utf8")).events || []).find(x => x.start === start);
  return e && e.players.length ? e : null;
}
const rankings = existsSync("rankings.json") ? JSON.parse(readFileSync("rankings.json", "utf8")).players : [];
const rankOf = C.rankLookup(rankings);

// The week's field, the same way the app builds it: ESPN's field, else the PGA Tour's
async function weekField(doc) {
  const t = doc.tournament;
  const b = await board(t && t.start);
  const sameEvent = b && b.event && (!t || b.event.start === t.start);
  let players = sameEvent ? b.players : [];
  if (!players.length && t) {
    const saved = savedField(t.start);
    if (saved) players = saved.players.map((p, i) => ({ name: p.name, pos: i + 1 }));
  }
  return { board: sameEvent ? b : null, golfers: C.buildField(players, rankOf), tourney: t || (b && b.event) };
}
const shortName = (n) => (n || "").replace(/\s+(pres\.?|presented) by .*$/i, "");

// ---------- Notifications ----------
let webpush = null;
if (VAPID_PRIVATE) {
  try {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails("mailto:hotdawgs-bot@users.noreply.github.com", VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) { log("web-push not available:", e.message); webpush = null; }
} else log("No VAPID_PRIVATE_KEY secret yet: notifications are recorded but not sent.");

let config = {};
const outbox = []; // { to: [members], title, body, tag }
function notify(to, title, body, tag) { outbox.push({ to: [].concat(to), title, body, tag }); }
async function flush() {
  const gone = {};
  for (const n of outbox) {
    for (const m of n.to) {
      const subs = (config.push || {})[m] || {};
      for (const [k, sub] of Object.entries(subs)) {
        if (!sub || !sub.endpoint) continue;
        log(`notify ${m}: ${n.title} | ${n.body}`);
        if (!webpush || DRY) continue;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: n.title, body: n.body, tag: n.tag, url: APP_URL }), { TTL: 6 * 3600 });
        } catch (e) {
          log(`  push failed (${e.statusCode || e.message})`);
          if (e.statusCode === 404 || e.statusCode === 410) (gone[m] = gone[m] || {})[k] = null;
        }
      }
    }
  }
  if (Object.keys(gone).length) await patchRow("pool_config", { id: "main" }, { push: gone });
}

// ---------- The tick ----------
async function draftTick(w) {
  let doc = await loadWeek(w);
  const { golfers, tourney } = await weekField(doc);
  const ev = shortName(tourney && tourney.name) || `Week ${w}`;
  const sent = doc.notified || {};
  const mark = {};
  const once = (key, fn) => { if (!QUIET && !sent[key] && !mark[key]) { fn(); mark[key] = NOW; } };
  const patch = {};

  const fieldUp = golfers.length > 0;
  const open = fieldUp || !!doc.forceOpen;
  let st = C.draftState(w, doc.picks || {});
  if (fieldUp && !doc.draftOpenAt && !st.complete) { patch.draftOpenAt = NOW; doc.draftOpenAt = NOW; log(`Week ${w}: field is posted (${golfers.length} golfers). Draft open.`); }
  if (open && !st.complete) {
    once("open", () => notify(C.MEMBERS, `🌭 Week ${w} draft is open`, `The ${ev} field is set. ${st.board[0].m} picks first.`, `open-${w}`));

    // Clock ran out: auto-pick (one per tick; the next person's clock starts now)
    const ci = C.clockInfo(doc, config, NOW);
    if (ci && ci.due && golfers.length) {
      const m = st.onClock;
      const mine = (doc.picks || {})[m] || {};
      const choice = C.chooseAutoPick(golfers, C.entriesOf(doc.picks).map(e => e.name), mine, (doc.queues || {})[m]);
      if (choice) {
        const g = choice.golfer, kind = g.hot ? "hot" : "dawg";
        const pp = C.pickPatch(doc, w, m, g.name, kind, true, "clock", NOW);
        await saveWeek(w, pp);
        log(`Week ${w}: auto-picked ${g.name} (${kind}) for ${m}${choice.fromQueue ? " from their queue" : ""}.`);
        doc = await loadWeek(w);
        st = C.draftState(w, doc.picks || {});
        once(`auto-${pp.pickLog && Object.keys(pp.pickLog)[0]}`, () => notify(m, "⏱ Your clock ran out", `Auto-picked ${g.name} as your ${kind}${choice.fromQueue ? " (from your queue)" : ""}.`, `auto-${w}`));
      }
    }
    if (!st.complete) {
      const ci2 = C.clockInfo(doc, config, NOW);
      // The first picker already heard about it in the "draft is open" note
      if (st.clock === 0 && mark.open) mark["clock-0"] = NOW;
      once(`clock-${st.clock}`, () => notify(st.onClock, "🌭 You're on the clock!",
        `Week ${w} draft, pick ${st.clock + 1} of ${st.total}.${ci2 && !ci2.waiting ? ` Auto-pick in ${Math.round(ci2.leftMs / 3600000 * 10) / 10}h.` : ci2 && ci2.waiting ? " No clock until Wednesday 7am, but early picks are welcome." : ""}`, `clock-${w}`));
    }
  }
  if (st.complete && C.entriesOf(doc.picks).length) {
    once("done", () => notify(C.MEMBERS, `✅ Week ${w} draft is done`, `All ${st.total} picks are in for the ${ev}. Let the sweat begin.`, `done-${w}`));
  }
  if (Object.keys(mark).length) patch.notified = mark;
  if (Object.keys(patch).length) await saveWeek(w, patch);
}

// Chicago calendar day and hour for a moment
function chicago(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const g = (t) => parts.find(p => p.type === t).value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24 };
}
const dayBefore = (iso) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const where = (posText) => { const n = parseInt(String(posText).replace("T", ""), 10); if (!n) return posText;
  return n === 1 && !/^T/.test(posText) ? "leading the tournament" : /^T/.test(posText) ? `tied for ${ordinal(n)}` : `in ${ordinal(n)}`; };
const thruNum = (t) => t === "F" ? 18 : (parseInt(t, 10) || 0);

// Before the tournament: withdrawals and the night-before reminder.
// During it: lead changes on Sunday and eagles by pool golfers.
async function liveTick(w) {
  const doc = await loadWeek(w);
  const t = doc.tournament;
  const entries = C.entriesOf(doc.picks);
  if (!t || !entries.length) return;
  const b = await board(t.start);
  const sameEvent = b && b.event && b.event.start === t.start;
  const started = sameEvent && b.players.some(p => p.posText && p.posText !== "—");
  const sent = doc.notified || {};
  const mark = {}, patch = {};
  const once = (key, fn) => { if (!QUIET && !sent[key] && !mark[key]) { fn(); mark[key] = NOW; } };
  const ev = shortName(t.name);
  const commish = config.commissioner || "Race";

  if (!started && !(sameEvent && b.event.final)) {
    // Withdrawals: a picked golfer is no longer in a full field
    let players = sameEvent ? b.players.map(p => ({ name: p.name })) : [];
    if (players.length < 60) { const saved = savedField(t.start); players = saved ? saved.players.map(p => ({ name: p.name })) : []; }
    if (players.length >= 60) {
      C.matchPickNames(players, entries.map(e => e.name));
      for (const e of entries) {
        if (players.some(p => p.name === e.name)) continue;
        log(`Week ${w}: ${e.name} (${e.who}) is no longer in the field.`);
        once(`wd-${e.name}`, () => {
          notify(e.who, "⚠️ Your golfer withdrew", `${e.name} is out of the ${ev}. Open the app to pick a replacement (anyone who hasn't teed off).`, `wd-${w}`);
          if (commish !== e.who) notify(commish, "⚠️ Withdrawal", `${e.name} (${e.who}'s ${e.kind}) is out of the ${ev}. They can pick a replacement in the app.`, `wd-${w}`);
        });
      }
    }
    // Night before: anyone with an empty slot
    const c = chicago(NOW);
    const st = C.draftState(w, doc.picks || {});
    if (!st.complete && c.day === dayBefore(t.start) && c.hour >= 19) {
      const empty = C.MEMBERS.filter(m => { const p = (doc.picks || {})[m] || {}; return !p.hot || !p.dawg; });
      once("lockremind", () => empty.forEach(m => {
        const p = (doc.picks || {})[m] || {};
        const slot = !p.hot && !p.dawg ? "hot and dawg slots are" : !p.hot ? "hot slot is" : "dawg slot is";
        notify(m, "⏰ Tee off is tomorrow", `Your ${slot} still empty for the ${ev}. ${st.onClock === m ? "You're on the clock right now." : `${st.onClock} is on the clock.`}`, `lock-${w}`);
      }));
    }
  } else if (started && !b.event.final) {
    C.matchPickNames(b.players, entries.map(e => e.name));
    const find = (n) => b.players.find(p => p.name === n);
    const finishes = {};
    entries.forEach(e => { const p = find(e.name); finishes[e.name] = p ? p.pos : 999; });
    const ranked = b.players.filter(p => p.pos < 999).sort((x, y) => x.pos - y.pos);
    const r = C.computeWeek(entries, finishes, ranked[0] && ranked[0].name, ranked[1] && ranked[1].name, rankOf, config.amounts, t.name);
    // Lead changes: tracked all week, announced in the final round
    if (r.winner && r.winner !== doc.liveLeader) {
      patch.liveLeader = r.winner;
      if (doc.liveLeader && b.event.round >= 4 && !QUIET) {
        const best = entries.filter(e => e.who === r.winner).map(e => ({ e, p: find(e.name) })).filter(x => x.p).sort((x, y) => x.p.pos - y.p.pos)[0];
        const amt = r.rules.reduce((sum, id) => sum + C.amountFor(id, config.amounts), 0);
        notify(C.MEMBERS, `🔄 ${r.winner} takes the lead!`, `${best ? `${best.e.name} is ${where(best.p.posText)} (${best.p.toPar}${best.p.thru ? ", thru " + best.p.thru : ""}). ` : ""}${doc.liveLeader} drops out of the money. $${amt} each on the line.`, `lead-${w}`);
      }
    }
    // Eagles: a pool golfer's score drops 2+ on a single hole
    const snap = {};
    for (const e of entries) {
      const p = find(e.name);
      if (!p) continue;
      const score = C.parsePar(p.toPar), thru = thruNum(p.thru);
      snap[e.name] = [score, thru];
      const prev = (doc.liveSnap || {})[e.name];
      if (prev && thru === prev[1] + 1 && prev[0] - score >= 2 && prev[0] - score <= 3) {
        const big = prev[0] - score >= 3;
        once(`eagle-${e.name}-${b.event.round}-${thru}`, () => notify(C.MEMBERS, big ? "🤯 ALBATROSS (or an ace)!" : "🦅 EAGLE!",
          `${e.name} (${e.who}'s ${e.kind}) just made ${big ? "a 3-under" : "eagle"} on hole ${thru}. Now ${p.toPar}, ${where(p.posText)}.`, `eagle-${w}`));
      }
    }
    patch.liveSnap = snap;
  }
  if (Object.keys(mark).length) patch.notified = mark;
  if (Object.keys(patch).length) await saveWeek(w, patch);
}

async function settleTick(w) {
  const doc = await loadWeek(w);
  const t = doc.tournament;
  if (!C.entriesOf(doc.picks).length) return;
  let settle = doc.settle;
  if (!(settle && settle.winner)) {
    const b = t ? await board(t.start) : null;
    if (!b || !b.event || !b.event.final || (t && b.event.start !== t.start)) return;
    const patch = C.settlePatch(doc, b, rankOf, config.amounts, NOW);
    if (!patch) return;
    await saveWeek(w, patch);
    settle = patch.settle;
    log(`Week ${w}: final. ${settle.winner} wins (${settle.rules.join(", ")}).`);
  }
  if ((doc.notified || {}).settled || QUIET) return;
  const amt = settle.rules.reduce((s, id) => s + C.amountFor(id, config.amounts), 0);
  const ev = shortName(t && t.name) || `Week ${w}`;
  notify(settle.winner, `🏆 You won week ${w}!`, `The ${ev} is final. Everyone owes you $${amt}. Watch for those Venmos.`, `paid-${w}`);
  notify(C.MEMBERS.filter(m => m !== settle.winner), `🏁 ${settle.winner} wins week ${w}`, `The ${ev} is final. You owe ${settle.winner} $${amt}. Pay in the app.`, `paid-${w}`);
  await saveWeek(w, { notified: { settled: NOW } });
}

config = ((await getRow("pool_config", "id", "main")) || {}).data || {};
const cur = config.currentWeek || 1;
if (QUIET) log("Quiet hours (11pm–7am Central): the pick clock is paused and notifications wait until morning.");
for (const w of [cur - 1, cur]) {
  if (w < 1) continue;
  try { await settleTick(w); } catch (e) { log(`Week ${w} settle: ${e.message}`); }
}
try { await draftTick(cur); } catch (e) { log(`Week ${cur} draft: ${e.message}`); }
try { await liveTick(cur); } catch (e) { log(`Week ${cur} live: ${e.message}`); }
await flush();
