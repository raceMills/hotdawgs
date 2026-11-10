// Record book (all-time, every season) and new-season rollover.
// Records live in the Clubhouse; the Herald calls out any record a week breaks.
// Seasons: config.seasonStartWeek is week 1 of the current season and
// config.seasons[name] = {from, to} keeps the finished ones. Load after fun.js.

(function () {
  const C = HDCore;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ord = (n) => { if (!n || n >= 999) return "MC"; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const seasonOf = (w) => {
    for (const [name, s] of Object.entries(config.seasons || {})) if (s && w >= s.from && w <= s.to) return name;
    return seasonName();
  };
  const label = (w) => `${seasonOf(w)} wk ${w - (Object.values(config.seasons || {}).find(s => s && w >= s.from && w <= s.to) || { from: seasonStart() }).from + 1}`;

  // All records using settled weeks up to `upTo`
  function compute(upTo) {
    const weeks = [];
    for (let w = 1; w <= upTo; w++) if (HD.settledWeek(w)) weeks.push(w);
    if (!weeks.length) return [];
    const recs = [];
    const better = (key, cand, cmp) => { if (!cand) return; const cur = recs.find(r => r.key === key); if (!cur) recs.push(cand); else if (cmp(cand, cur)) Object.assign(cur, cand); };
    const wins = {}, eggs = {}, mcs = {}, streakW = {}, streakL = {}, curW = {}, curL = {};
    for (const w of weeks) {
      const s = weekOf(w).settle, es = HD.entriesWithPos(w);
      const per = (s.rules || []).reduce((t, id) => t + C.amountFor(id, config.amounts), 0);
      const haul = per * (MEMBERS.length - 1);
      better("payday", { key: "payday", title: "Biggest payday", holder: s.winner, value: `$${haul} (${label(w)})`, n: haul, w }, (a, b) => a.n > b.n);
      const wp = es.filter(e => e.who === s.winner).sort((a, b) => a.pos - b.pos)[0];
      if (wp && wp.rank < 999) better("longshot", { key: "longshot", title: "Longest shot to cash", holder: s.winner, value: `${wp.name}, world No. ${wp.rank} (${label(w)})`, n: wp.rank, w }, (a, b) => a.n > b.n);
      es.filter(e => e.kind === "dawg" && e.pos < 999).forEach(e => better("dawg", { key: "dawg", title: "Best dawg finish", holder: e.who, value: `${e.name}, ${ord(e.pos)} (${label(w)})`, n: e.pos, r: e.rank, w }, (a, b) => a.n < b.n || (a.n === b.n && a.r > b.r)));
      es.filter(e => e.pos >= 999 && e.rank < 999).forEach(e => better("bust", { key: "bust", title: "Highest-ranked missed cut", holder: e.who, value: `${e.name}, world No. ${e.rank} (${label(w)})`, n: e.rank, w }, (a, b) => a.n < b.n));
      es.filter(e => e.pos >= 999).forEach(e => mcs[e.who] = (mcs[e.who] || 0) + 1);
      wins[s.winner] = (wins[s.winner] || 0) + 1;
      const lp = HD.lastPlace(w);
      if (lp) eggs[lp.who] = (eggs[lp.who] || 0) + 1;
      for (const m of MEMBERS) {
        if (!es.some(e => e.who === m)) continue;
        if (m === s.winner) { curW[m] = (curW[m] || 0) + 1; curL[m] = 0; } else { curL[m] = (curL[m] || 0) + 1; curW[m] = 0; }
        if (curW[m] > (streakW[m] || 0)) streakW[m] = curW[m];
        if (curL[m] > (streakL[m] || 0)) streakL[m] = curL[m];
      }
    }
    const top = (key, title, obj, fmt) => {
      const e = Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
      if (e && e[1] > 0) recs.push({ key, title, holder: e[0], value: fmt(e[1]), n: e[1] });
    };
    top("wins", "Most weekly wins", wins, n => `${n} win${n === 1 ? "" : "s"}`);
    const atLeast2 = (o) => Object.fromEntries(Object.entries(o).filter(([, n]) => n >= 2));
    top("hotstreak", "Longest win streak", atLeast2(streakW), n => `${n} straight weeks`);
    top("coldstreak", "Longest losing streak", atLeast2(streakL), n => `${n} straight weeks`);
    top("eggs", "Most egg beers owed", eggs, n => `${n} egg beer${n === 1 ? "" : "s"}`);
    top("mcs", "Most missed cuts", mcs, n => `${n} golfer${n === 1 ? "" : "s"} sent home Friday`);
    const order = ["payday", "wins", "hotstreak", "longshot", "dawg", "coldstreak", "bust", "mcs", "eggs"];
    return recs.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  // Records that changed hands or got bigger in week w
  function recordsBrokenIn(w) {
    if (!HD.settledWeek(w)) return [];
    const before = compute(w - 1), after = compute(w);
    if (!before.length) return [];
    return after.filter(r => {
      const b = before.find(x => x.key === r.key);
      return b && (b.holder !== r.holder || b.n !== r.n) && (r.w === w || ["wins", "hotstreak", "coldstreak", "eggs", "mcs"].includes(r.key));
    }).filter(r => !["coldstreak", "mcs"].includes(r.key) || r.n >= 4);
  }
  // Season champions: best net money in each finished season (+ current leader)
  function champions() {
    const out = [];
    const net = (from, to) => {
      const tot = Object.fromEntries(MEMBERS.map(m => [m, 0]));
      for (let w = from; w <= to; w++) {
        if (!HD.settledWeek(w)) continue;
        const s = weekOf(w).settle, per = (s.rules || []).reduce((t, id) => t + C.amountFor(id, config.amounts), 0);
        const players = new Set(C.entriesOf(weekOf(w).picks).map(e => e.who));
        players.forEach(m => { if (m === s.winner) tot[m] += per * (players.size - 1); else tot[m] -= per; });
      }
      return Object.entries(tot).sort((a, b) => b[1] - a[1])[0];
    };
    Object.entries(config.seasons || {}).sort((a, b) => b[1].from - a[1].from).forEach(([name, s]) => { const c = net(s.from, s.to); if (c && c[1] > 0) out.push({ name, m: c[0], amt: c[1], done: true }); });
    const c = net(seasonStart(), currentWeek());
    if (c && c[1] > 0) out.unshift({ name: seasonName(), m: c[0], amt: c[1], done: false });
    return out;
  }

  function recordCard() {
    const recs = compute(currentWeek()), champs = champions();
    return `<div class="card" id="recordBook"><h2>🏅 Record book</h2>
      <p class="hint">All-time, every season. The Herald announces it when one falls.</p>
      ${champs.length ? `<div style="margin:8px 0 4px;font-weight:900">🏆 Season champions</div>${champs.map(c => `<div class="rule"><span style="flex:1"><b>${esc(c.name)}</b>${c.done ? "" : " (so far)"}</span><span>${esc(c.m)} · +$${c.amt}</span></div>`).join("")}` : ""}
      ${recs.length ? recs.map(r => `<div class="rule" style="align-items:flex-start"><span style="flex:1"><b>${esc(r.title)}</b><br><span class="hint" style="margin:0">${esc(r.value)}</span></span><b>${esc(r.holder)}</b></div>`).join("")
        : `<p class="hint">Records start once the first week is settled.</p>`}</div>`;
  }

  // ---------- New season (commissioner) ----------
  function seasonCard() {
    const cur = currentWeek(), hasPicks = C.entriesOf(weekOf(cur).picks).length > 0;
    const next = String(Number(seasonName()) + 1 || "");
    return `<div class="card" id="seasonCard"><h2>📅 Seasons</h2>
      <p class="hint">Current season: <b>${esc(seasonName())}</b>, week ${wk(cur)}. Starting a new season archives this one (history, records and the Herald stay), resets the season standings, Wrapped and Egg Beer Court, and makes the next week "Week 1".</p>
      <div class="field"><label>New season name</label><input id="newSeasonName" value="${esc(next)}" placeholder="2027"></div>
      <button class="btn ghost" data-season="go">Start the ${esc(next || "new")} season</button>
      ${hasPicks ? `<p class="hint" style="margin-top:6px">This week already has picks, so the new season starts next week.</p>` : ""}</div>`;
  }
  let armed = false;
  async function startSeason() {
    const name = (document.getElementById("newSeasonName").value || "").trim();
    if (!name) return toast("Give the new season a name.");
    if (name === seasonName() || (config.seasons || {})[name]) return toast("That season name is taken.");
    if (!armed) { armed = true; toast("Tap again to start the new season."); setTimeout(() => armed = false, 4000); return; }
    armed = false;
    const cur = currentWeek(), hasPicks = C.entriesOf(weekOf(cur).picks).length > 0;
    const first = hasPicks ? cur + 1 : cur;
    await write("config", 0, { seasons: { [seasonName()]: { from: seasonStart(), to: first - 1 } }, seasonStartWeek: first, seasonName: name, currentWeek: first });
    toast(`🎉 Welcome to the ${name} season. Fresh dogs on the grill.`);
  }

  const baseSettings = renderSettings;
  renderSettings = function () {
    baseSettings();
    const wrap = document.getElementById("settingsWrap");
    if (!wrap || me !== (config.commissioner || "Race") || wrap.querySelector("#seasonCard")) return;
    const anchor = wrap.querySelector("#hdCommish");
    if (!anchor) return;
    const box = document.createElement("div");
    box.innerHTML = seasonCard();
    anchor.after(box.firstElementChild);
    wrap.querySelector("[data-season=go]").onclick = startSeason;
  };
  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    const a = document.querySelector("section.active");
    if (a && a.id === "clubhouse") {
      const club = document.getElementById("hdFunClub");
      if (club && !document.getElementById("recordBook")) {
        const box = document.createElement("div");
        box.innerHTML = recordCard();
        const court = club.querySelector("#eggCourt");
        court ? court.after(box.firstElementChild) : club.appendChild(box.firstElementChild);
      }
    }
  };

  window.HD = Object.assign(window.HD || {}, { records: compute, recordsBrokenIn, champions, startSeason });
})();
