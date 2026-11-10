// Hotdawgs pool rules, shared by the app (as window.HDCore) and the background
// tick task (as a Node module), so phones and the server always agree.
//   - Golfer names: matching spellings across ESPN, the PGA Tour and the rankings
//   - ESPN: reading a scoreboard into positions, ties, cuts and holes played
//   - Draft: snake order, whose turn it is, the pick clock, and auto-pick choices
//   - Payouts: who wins the week and which rules they triggered
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HDCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const MEMBERS = ["Jacob", "Michael", "Pat", "Ryan", "Zach", "Race"];

  // Each amount is what every other member pays the winner
  const RULES = {
    weekly: [
      { id: "hotTourney", label: "Hot tourney winner", amount: 10 },
      { id: "dawgTourney", label: "Dawg tourney winner", amount: 15 },
      { id: "hotGroup", label: "Hot group winner", amount: 5 },
      { id: "dawgGroup", label: "Dawg group winner", amount: 10 },
      { id: "top2None", label: "Top two in group, no winner", amount: 15 },
      { id: "top2Hot", label: "Top two in group and hot wins", amount: 20 },
      { id: "top2Dawg", label: "Top two in group and dawg wins", amount: 25 },
      { id: "trueTop2", label: "True top 2, either order", amount: 30 }
    ],
    majors: [
      { id: "mHotLeader", label: "Hot group leader", amount: 15 },
      { id: "mDawgLeader", label: "Dawg group leader", amount: 20 },
      { id: "mHotWin", label: "Hot tourney winner", amount: 25 },
      { id: "mDawgWin", label: "Dawg winner", amount: 30 },
      { id: "mTop2None", label: "Top two, no winner", amount: 25 },
      { id: "mTop2Hot", label: "Top two and hot wins", amount: 30 },
      { id: "mTop2Dawg", label: "Top two and dawg wins", amount: 35 },
      { id: "mTrueTop2", label: "True top 2", amount: 40 }
    ]
  };
  const MAJOR_RULE = { hotTourney: "mHotWin", dawgTourney: "mDawgWin", hotGroup: "mHotLeader", dawgGroup: "mDawgLeader",
    top2None: "mTop2None", top2Hot: "mTop2Hot", top2Dawg: "mTop2Dawg", trueTop2: "mTrueTop2" };
  // The four majors, by name (sponsor tags like "presented by" removed)
  const isMajor = (name) => /^(the )?(masters( tournament)?|pga championship|u\.?s\.? open( championship)?|open championship|open)$/i
    .test(String(name || "").replace(/\s+(pres\.?|presented)\s+by\s+.*$/i, "").trim());
  function amountFor(id, amounts) {
    if (amounts && amounts[id] != null) return amounts[id];
    const r = RULES.weekly.concat(RULES.majors).find(x => x.id === id);
    return r ? r.amount : 0;
  }

  // ---------------- Golfer names ----------------
  // Handles accents, "Last, First", hyphens, initials (J.J.), and Jr./III
  function nameKey(s) {
    let n = String(s || "").trim();
    if (n.includes(",")) {
      const parts = n.split(",").map(x => x.trim());
      const last = parts.shift();
      if (parts.join(" ")) n = parts.join(" ") + " " + last;
    }
    return n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[-]/g, " ").replace(/[.']/g, "").replace(/[^a-z ]/g, "")
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
  }
  const compactKey = (n) => nameKey(n).replace(/ /g, "");
  const lastInitial = (n) => { const p = nameKey(n).split(" "); return p[p.length - 1] + "|" + (p[0] || "").charAt(0); };
  // A lookup that finds a golfer's world rank across spelling differences (999 = unranked)
  function rankLookup(ranked) {
    const byFull = new Map(), byLI = new Map();
    for (const p of ranked || []) {
      const k = compactKey(p.name);
      if (!k) continue;
      if (!byFull.has(k)) byFull.set(k, p.rank);
      const li = lastInitial(p.name);
      byLI.set(li, byLI.has(li) ? -1 : p.rank); // -1 = two golfers share it
    }
    return (name) => {
      const k = compactKey(name);
      if (!k) return 999;
      if (byFull.has(k)) return byFull.get(k);
      const r = byLI.get(lastInitial(name));
      return r && r > 0 ? r : 999;
    };
  }
  // Rename leaderboard entries to the exact names the pool drafted
  function matchPickNames(players, picked) {
    for (const name of picked || []) {
      if (!name || players.some(p => p.name === name)) continue;
      let hit = players.find(p => compactKey(p.name) === compactKey(name));
      if (!hit) { const c = players.filter(p => lastInitial(p.name) === lastInitial(name)); if (c.length === 1) hit = c[0]; }
      if (hit) hit.name = name;
    }
    return players;
  }
  // The draft list: the field ranked by world rank; the 10 best-ranked are hot
  function buildField(players, rankOfName) {
    const field = (players || []).map(p => {
      const r = rankOfName(p.name);
      return { name: p.name, rank: r < 999 ? r : (p.owgr || 999), odds: p.odds || "" };
    });
    field.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return field.map((g, i) => ({ ...g, hot: i < 10 && g.rank < 999 }));
  }

  // ---------------- ESPN scoreboard ----------------
  const isoDay = (s) => String(s || "").slice(0, 10);
  const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const parsePar = (v) => { const s = String(v == null ? "" : v).trim(); if (!s || /^e$/i.test(s)) return 0; const n = parseInt(s.replace("+", ""), 10); return Number.isFinite(n) ? n : 0; };
  // ESPN gives each golfer an order and round-by-round scores but no printed
  // position, so ties, missed cuts and holes played are worked out here
  function parseScoreboard(data) {
    const ev = ((data && data.events) || [])[0];
    const comp = ev && (ev.competitions || [])[0];
    const final = !!(ev && ev.status && ev.status.type && ev.status.type.completed);
    const raw = ((comp && comp.competitors) || []).map((c, i) => {
      const rounds = (c.linescores || []).filter(l => l.period >= 1 && l.period <= 4 && ((l.linescores || []).length || l.value != null));
      const last = rounds[rounds.length - 1];
      return {
        name: (c.athlete && (c.athlete.displayName || c.athlete.fullName)) || "",
        order: c.order || i + 1,
        toPar: c.score && typeof c.score === "object" ? (c.score.displayValue || "") : String(c.score == null ? "" : c.score),
        round: last ? last.period : 0,
        holes: last ? (last.linescores || []).length : 0
      };
    }).filter(p => p.name).sort((x, y) => x.order - y.order);
    const maxRound = raw.reduce((m, p) => Math.max(m, p.round), 0);
    const missedCut = (p) => maxRound >= 3 && p.round <= 2;
    const withdrew = (p) => final && maxRound >= 4 && !missedCut(p) && (p.round < 4 || (p.holes > 0 && p.holes < 18));
    const inPlay = raw.filter(p => !missedCut(p) && !withdrew(p));
    const score = (p) => parsePar(p.toPar);
    const started = maxRound > 0;
    const players = raw.map(p => {
      if (missedCut(p) || withdrew(p)) return { name: p.name, pos: 999, posText: missedCut(p) ? "MC" : "WD", toPar: p.toPar, thru: "" };
      if (!started) return { name: p.name, pos: p.order, posText: "—", toPar: "", thru: "" };
      const s = score(p);
      let pos = 1 + inPlay.filter(q => score(q) < s).length;
      let tied = inPlay.filter(q => score(q) === s).length > 1;
      if (final && pos === 1) { // one winner, even after a playoff
        if (p === inPlay[0]) tied = false;
        else { pos = 2; tied = inPlay.filter(q => q !== inPlay[0] && score(q) === s).length > 1; }
      }
      return { name: p.name, pos, posText: (tied ? "T" : "") + pos, toPar: p.toPar, thru: final ? "" : (p.holes >= 18 ? "F" : p.holes ? String(p.holes) : "") };
    });
    const calendar = ((((data && data.leagues) || [])[0] || {}).calendar || []).map(e => ({
      name: e.label || e.name || "", start: isoDay(e.startDate), end: isoDay(e.endDate), where: ""
    })).filter(e => e.name);
    const espnStatus = (ev && ev.status && ev.status.type && (ev.status.type.shortDetail || ev.status.type.detail)) || "";
    const event = ev ? {
      name: ev.name || ev.shortName || "",
      start: isoDay(ev.date), end: isoDay(ev.endDate),
      where: (comp && comp.venue && comp.venue.fullName) || "",
      round: final ? 4 : maxRound,
      status: final ? "Final" : started ? (/round/i.test(espnStatus) ? espnStatus : `Round ${maxRound} · in progress`) : (ev.date ? `Starts ${fmtDay(isoDay(ev.date))}` : ""),
      final
    } : null;
    return { event, players, calendar };
  }

  // ---------------- Draft ----------------
  // Two-round snake; the first pick moves back one spot each week
  function draftOrder(week, members) {
    const m = members || MEMBERS, s = (week - 1) % m.length;
    return m.slice(s).concat(m.slice(0, s));
  }
  function draftState(week, picks, members) {
    const o = draftOrder(week, members), slots = o.concat(o.slice().reverse());
    const count = (m) => { const p = (picks || {})[m] || {}; return (p.hot ? 1 : 0) + (p.dawg ? 1 : 0); };
    const seen = {};
    let clock = -1;
    const board = slots.map((m, i) => {
      seen[m] = (seen[m] || 0) + 1;
      const nth = seen[m], done = count(m) >= nth;
      if (!done && clock < 0) clock = i;
      return { m, i, nth, round: i < o.length ? 1 : 2, done };
    });
    return { board, clock, onClock: clock >= 0 ? slots[clock] : null, complete: clock < 0, total: slots.length };
  }
  const needOf = (mine) => { mine = mine || {}; return mine.hot && mine.dawg ? null : !mine.hot && !mine.dawg ? "either" : !mine.hot ? "hot" : "dawg"; };

  // The pick clock doesn't run overnight (11pm–7am Central)
  const QUIET = { tz: "America/Chicago", from: 23, to: 7 };
  let hourFmt = null;
  function chicagoHour(ms) {
    hourFmt = hourFmt || new Intl.DateTimeFormat("en-US", { timeZone: QUIET.tz, hour: "numeric", hourCycle: "h23" });
    return Number(hourFmt.formatToParts(new Date(ms)).find(p => p.type === "hour").value) % 24;
  }
  const quietAt = (ms) => { const h = chicagoHour(ms); return h >= QUIET.from || h < QUIET.to; };
  // Clock time that has passed between two moments, not counting quiet hours
  function activeMs(startMs, endMs) {
    const STEP = 5 * 60000;
    let t = startMs, total = 0;
    while (t < endMs) { const step = Math.min(STEP, endMs - t); if (!quietAt(t)) total += step; t += step; }
    return total;
  }
  // On-the-clock nudges: original lines riffing on Caddyshack and Happy Gilmore.
  // {m} is the person on the clock.
  const NUDGES = [
    "@{m}, the gopher has drafted faster than you. Get in the app.",
    "@{m}, a hockey player with a 400-yard slap shot just made his pick in two seconds. Your turn.",
    "@{m}, find your happy place. Your happy place is the draft screen.",
    "@{m}, Judge Smails has ruled: pick now or lose your egg beer privileges.",
    "@{m}, Carl the groundskeeper has plastic explosives and more patience than this group. Pick.",
    "@{m}, Shooter McGavin is smirking at your empty slot. Don't give him the satisfaction.",
    "@{m}, Ty Webb would tell you to become the pick. We're telling you to make it.",
    "@{m}, Happy's grandma's house is on the line and you're still scrolling.",
    "@{m}, somebody dropped a candy bar in the Bushwood pool. Everyone's out of the water, so you have time to draft.",
    "@{m}, Carl has a theory you're scared of the dawgs. Prove him wrong.",
    "@{m}, the alligator on 12 makes decisions faster than you.",
    "@{m}, Danny Noonan needs this scholarship and you need a golfer. Go.",
    "@{m}, Happy just putted with a hockey stick. You can at least tap a name.",
    "@{m}, the Bushwood snack bar is out of hot dogs because you're holding up the line. Pick."
  ];
  const nudgeLine = (m, seed) => NUDGES[Math.abs(seed == null ? Math.floor(Math.random() * 1e6) : seed) % NUDGES.length].replace("{m}", m);

  // Week numbers keep counting across seasons; this is the number people see
  // (week 1 of the current season = config.seasonStartWeek).
  function seasonWeek(w, cfg) { return w - ((cfg && cfg.seasonStartWeek) || 1) + 1; }

  // The pick clock never runs before 7am Central on the Wednesday of tournament week
  // (the day before a Thursday start). Picks made earlier are just early birds.
  function clockFloor(weekDoc) {
    const start = weekDoc && weekDoc.tournament && weekDoc.tournament.start;
    if (!start) return 0;
    const d = new Date(start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    for (const utcHour of [12, 13]) { // 7am Central is 12:00 UTC in summer, 13:00 in winter
      const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), utcHour);
      if (chicagoHour(ms) === 7) return ms;
    }
    return 0;
  }
  // When the current pick's clock started: the last pick, when the draft opened,
  // or Wednesday 7am, whichever is latest
  function clockStart(weekDoc) {
    const log = Object.values((weekDoc && weekDoc.pickLog) || {});
    const last = log.reduce((m, x) => Math.max(m, x && x.at ? x.at : 0), 0);
    const opened = Math.max(last, (weekDoc && weekDoc.draftOpenAt) || 0);
    return opened ? Math.max(opened, clockFloor(weekDoc)) : null;
  }
  // { limitMs, leftMs, due } for the pick on the clock (null if the clock is off)
  function clockInfo(weekDoc, cfg, now) {
    const hours = cfg && cfg.autoPickHours != null ? Number(cfg.autoPickHours) : 4;
    const start = clockStart(weekDoc);
    if (!hours || !start || (weekDoc && weekDoc.clockPaused)) return null;
    const limitMs = hours * 3600000;
    if (now < start) return { limitMs, usedMs: 0, leftMs: limitMs, due: false, quiet: false, waiting: true, startsAt: start };
    const used = activeMs(start, now);
    return { limitMs, usedMs: used, leftMs: Math.max(0, limitMs - used), due: used >= limitMs, quiet: quietAt(now), startsAt: start };
  }
  // The golfer auto-pick takes: first available golfer from your queue that fills a
  // slot you still need; otherwise the best-ranked available golfer you can take
  function chooseAutoPick(golfers, takenNames, mine, queue) {
    const need = needOf(mine);
    if (!need) return null;
    const taken = new Set((takenNames || []).map(compactKey));
    const ok = (g) => !taken.has(compactKey(g.name)) && (need === "either" || (need === "hot") === !!g.hot);
    for (const q of queue || []) {
      const g = golfers.find(x => compactKey(x.name) === compactKey(q));
      if (g && ok(g)) return { golfer: g, fromQueue: true };
    }
    const pool = golfers.filter(ok).sort((a, b) => a.rank - b.rank);
    const g = need === "either" ? (pool.find(x => x.hot) || pool[0]) : pool[0];
    return g ? { golfer: g, fromQueue: false } : null;
  }
  // The write that records one pick (merged into the week's row)
  function pickPatch(weekDoc, week, member, golfer, kind, auto, by, now) {
    const st = draftState(week, (weekDoc && weekDoc.picks) || {});
    const mine = ((weekDoc && weekDoc.picks) || {})[member] || {};
    const entry = { [kind]: golfer };
    if (!mine.hot && !mine.dawg) entry.first = kind;
    return { picks: { [member]: entry }, pickLog: { [st.clock]: { m: member, kind, name: golfer, at: now, auto: !!auto, by: by || member } } };
  }

  // ---------------- Payouts ----------------
  // entries: [{ who, name, kind }]; finishes: { golfer: position, 999 = no finish }
  // W/R: tournament winner and runner-up; rankOf: world rank (worse rank wins ties)
  function computeWeek(entries, finishes, W, R, rankOf, amounts, eventName) {
    const fin = finishes || {};
    const posOf = (n) => (fin[n] != null ? Number(fin[n]) : 999);
    const all = entries.slice().sort((a, b) => posOf(a.name) - posOf(b.name) || rankOf(b.name) - rankOf(a.name));
    const hits = {};
    const add = (who, id) => { (hits[who] = hits[who] || []).push(id); };
    const we = entries.find(e => e.name === W);
    if (we) add(we.who, we.kind === "hot" ? "hotTourney" : "dawgTourney");
    if (all[0] && posOf(all[0].name) < 999 && all[0].name !== W) add(all[0].who, all[0].kind === "hot" ? "hotGroup" : "dawgGroup");
    const t2 = [W, R].map(n => entries.find(e => e.name === n)).filter(Boolean);
    const t2Owners = [...new Set(t2.map(e => e.who))];
    const flags = [];
    if (t2.length === 2 && t2Owners.length === 1) hits[t2Owners[0]] = ["trueTop2"];
    if (t2.length === 2 && t2Owners.length === 2) flags.push("The two top finishers were picked by different members, so set the true top 2 payout by hand.");
    if (all.length > 1 && all[0].who === all[1].who && posOf(all[1].name) < 999 && !all.some(e => e.name === W)) {
      hits[all[0].who] = [all[0].kind === "hot" ? "top2Hot" : "top2Dawg"];
      flags.push("Top two payout set by the top pick's type. If the top two are a hot and a dawg, confirm the amount.");
    }
    const major = isMajor(eventName);
    const rid = (id) => major ? MAJOR_RULE[id] : id;
    const totals = Object.entries(hits)
      .map(([who, ids]) => { const r = ids.map(rid); return { who, ids: r, total: r.reduce((s, id) => s + amountFor(id, amounts), 0) }; })
      .sort((a, b) => b.total - a.total);
    if (totals.length > 1) flags.push("More than one member triggered a payout. Confirm the winner.");
    return { totals, winner: totals[0] ? totals[0].who : "", rules: totals[0] ? totals[0].ids : [], kind: major ? "majors" : "weekly", flags };
  }
  // Entries for a week's picks
  function entriesOf(picks) {
    const out = [];
    for (const [who, p] of Object.entries(picks || {})) {
      if (p && p.hot) out.push({ who, name: p.hot, kind: "hot" });
      if (p && p.dawg) out.push({ who, name: p.dawg, kind: "dawg" });
    }
    return out;
  }
  // Final leaderboard -> what gets saved for the week when it settles automatically
  function settlePatch(weekDoc, board, rankOf, amounts, now) {
    const entries = entriesOf(weekDoc.picks);
    if (!entries.length || !board || !board.event || !board.event.final || !board.players.length) return null;
    matchPickNames(board.players, entries.map(e => e.name));
    const finishes = {};
    for (const e of entries) { const p = board.players.find(x => x.name === e.name); finishes[e.name] = p ? p.pos : 999; }
    const ranked = board.players.filter(p => p.pos < 999).sort((a, b) => a.pos - b.pos);
    const W = ranked[0] ? ranked[0].name : null, R = ranked[1] ? ranked[1].name : null;
    const r = computeWeek(entries, finishes, W, R, rankOf, amounts, board.event.name);
    if (!r.winner) return null;
    return { finishes, resultWinner: W, resultRunner: R, settle: { winner: r.winner, kind: r.kind, rules: r.rules, auto: true, at: now, flags: r.flags } };
  }

  return { MEMBERS, RULES, amountFor, isMajor, nameKey, compactKey, rankLookup, matchPickNames, buildField,
    parsePar, parseScoreboard, isoDay, draftOrder, draftState, needOf, activeMs, quietAt, clockFloor, seasonWeek, NUDGES, nudgeLine, clockStart, clockInfo,
    chooseAutoPick, pickPatch, computeWeek, entriesOf, settlePatch };
});
