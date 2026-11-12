// Watch party: watch the tournament together on FaceTime + SharePlay, with the app
// as the second screen (live pool standings, your golfers, a play-by-play of pool
// moments and emoji reactions that fly across everyone's screen).
// Who's watching uses Supabase realtime presence; nothing is stored for that.
// Starting a party saves week.party = {host, at, network} so the background clock
// can ping everyone. Load after watch.js and fun.js.

(function () {
  const C = HDCore;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const REACTS = ["🔥", "🤡", "🥚", "🌭", "🍺", "😱", "⛳"];

  const style = document.createElement("style");
  style.textContent = `
    .wp-card { background: linear-gradient(135deg, #1b2a1f, #0e1712); color: #fff; border-color: #0b0f0c; }
    .wp-card h2 { color: #ffd77a; }
    .wp-card .hint { color: #cfe3d4; }
    .wp-faces { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 10px; }
    .wp-face { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,.12); border-radius: 999px; padding: 3px 10px 3px 4px; font-weight: 800; font-size: 13px; }
    .wp-face i { width: 22px; height: 22px; border-radius: 50%; background: var(--mustard); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-weight: 900; font-size: 12px; }
    .wp-live { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ff3b3b; margin-right: 6px; animation: tvPulse 1.2s infinite; }

    .wp { position: fixed; inset: 0; z-index: 160; background: #0e1712; color: #fff; display: flex; flex-direction: column;
      padding: calc(10px + env(safe-area-inset-top, 0px)) 12px calc(10px + env(safe-area-inset-bottom, 0px)); animation: hdFade .25s ease-out; }
    .wp-top { display: flex; align-items: center; gap: 8px; }
    .wp-top h3 { margin: 0; flex: 1; font-family: "Rockwell", Georgia, serif; font-size: 20px; color: #ffd77a; }
    .wp-x { width: 38px; height: 38px; border-radius: 50%; border: 2px solid #fff; background: transparent; color: #fff; font: inherit; font-weight: 900; font-size: 16px; }
    .wp-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; margin: 8px 0; }
    .wp-sec { background: rgba(255,255,255,.07); border-radius: 14px; padding: 10px 12px; margin-bottom: 10px; }
    .wp-sec h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #9fd0ae; }
    .wp-money { font-family: "Rockwell", Georgia, serif; font-size: 22px; font-weight: 900; }
    .wp-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 14px; }
    .wp-row:last-child { border-bottom: 0; }
    .wp-row .p { width: 26px; font-weight: 900; text-align: center; }
    .wp-row .n { flex: 1; min-width: 0; }
    .wp-row .g { font-size: 12px; opacity: .8; }
    .wp-row.lead { background: rgba(255,215,122,.16); border-radius: 10px; padding: 6px; }
    .wp-sc { font-variant-numeric: tabular-nums; font-weight: 900; }
    .wp-sc.under { color: #ff8a8a; }
    .wp-feed div { padding: 5px 0; font-size: 14px; border-bottom: 1px dashed rgba(255,255,255,.1); }
    .wp-feed div:last-child { border-bottom: 0; }
    .wp-feed small { opacity: .6; margin-right: 6px; }
    .wp-bar { display: flex; gap: 6px; justify-content: space-between; }
    .wp-bar button { flex: 1; font-size: 24px; padding: 8px 0; border-radius: 12px; border: 0; background: rgba(255,255,255,.12); }
    .wp-bar button:active { transform: scale(.9); }
    .wp-fly { position: fixed; bottom: 90px; z-index: 170; font-size: 38px; pointer-events: none; animation: wpFly 2.6s ease-out forwards; text-align: center; }
    .wp-fly small { display: block; font-size: 11px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000; }
    @keyframes wpFly { 0% { transform: translateY(0) scale(.6); opacity: 0; } 10% { opacity: 1; transform: translateY(-20px) scale(1.1); }
      100% { transform: translateY(-62vh) scale(1); opacity: 0; } }
    .wp-how { font-size: 13px; line-height: 1.45; }
    .wp-how ol { margin: 4px 0 0; padding-left: 20px; }
    .wp-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .wp-btns .btn { margin: 0; padding: 10px 6px; font-size: 14px; }
  `;
  document.head.appendChild(style);

  // ---------- Presence and reactions (realtime, nothing saved) ----------
  let chan = null, watchers = {}, inParty = false;
  function joinChannel() {
    if (chan || !sb || !me) return;
    chan = sb.channel("hotdawgs-party", { config: { presence: { key: me }, broadcast: { self: false } } });
    chan.on("presence", { event: "sync" }, () => {
      const st = chan.presenceState();
      watchers = {};
      Object.entries(st).forEach(([k, metas]) => { if (metas.some(x => x.watching)) watchers[k] = metas[0]; });
      if (inParty) renderParty(); else refreshCards();
    });
    chan.on("broadcast", { event: "rx" }, ({ payload }) => { if (payload) { fly(payload.e, payload.m); if (inParty) addFeed(`${payload.m} ${payload.e}`, true); } });
    chan.subscribe((status) => { if (status === "SUBSCRIBED" && inParty) chan.track({ watching: true, at: Date.now() }); });
  }
  const watchingNow = () => Object.keys(watchers).filter(m => MEMBERS.includes(m));

  // ---------- What's on ----------
  function onAir() {
    const ws = (window.HD && HD.watchWindows) ? HD.watchWindows() : [];
    const now = Date.now();
    const on = ws.filter(w => w.kind !== "Radio" && w.start - 30 * 60000 <= now && now < w.end);
    return on.sort((a, b) => (a.kind === "TV" ? -1 : 1) - (b.kind === "TV" ? -1 : 1));
  }
  const isLiveGolf = () => live.event && !live.event.final && live.players.some(p => p.posText && p.posText !== "—");

  // ---------- Live pool standings ----------
  function standings() {
    const w = currentWeek();
    const entries = C.entriesOf(weekOf(w).picks);
    if (!entries.length || !live.players.length) return null;
    const find = (n) => live.players.find(p => p.name === n);
    const finishes = {};
    entries.forEach(e => { const p = find(e.name); finishes[e.name] = p ? p.pos : 999; });
    const ranked = live.players.filter(p => p.pos < 999).sort((a, b) => a.pos - b.pos);
    const rankOf = (n) => (golfers.find(g => g.name === n) || { rank: 999 }).rank;
    const t = weekTourney(w);
    const r = C.computeWeek(entries, finishes, ranked[0] && ranked[0].name, ranked[1] && ranked[1].name, rankOf, config.amounts, t && t.name);
    const per = (r.rules || []).reduce((s, id) => s + C.amountFor(id, config.amounts), 0);
    const rows = MEMBERS.map(m => {
      const mine = entries.filter(e => e.who === m).map(e => Object.assign({}, e, { p: find(e.name) })).sort((a, b) => (a.p ? a.p.pos : 999) - (b.p ? b.p.pos : 999));
      return { m, best: mine[0] && mine[0].p ? mine[0].p.pos : 999, mine };
    }).sort((a, b) => a.best - b.best);
    return { winner: r.winner, per, rows };
  }

  // ---------- Play-by-play from score changes ----------
  let feed = [], snap = {}, lastLeader = null;
  function addFeed(text, quiet) {
    feed.unshift({ t: Date.now(), text });
    feed = feed.slice(0, 30);
    if (inParty && !quiet) renderParty();
  }
  function diff() {
    if (!live.players.length) return;
    const entries = C.entriesOf(weekOf(currentWeek()).picks);
    const next = {};
    for (const e of entries) {
      const p = live.players.find(x => x.name === e.name);
      if (!p || !p.toPar) continue;
      const s = C.parsePar(p.toPar), thru = p.thru === "F" ? 18 : (parseInt(p.thru, 10) || 0);
      next[e.name] = [s, thru];
      const prev = snap[e.name];
      if (!prev || thru !== prev[1] + 1) continue;
      const d = prev[0] - s, who = e.who === me ? "your" : `${e.who}'s`;
      if (d === 1) addFeed(`🐦 ${e.name} (${who} ${e.kind}) birdies ${thru}. ${p.toPar}, ${p.posText}`, true);
      else if (d >= 2) addFeed(`🦅 ${e.name} (${who} ${e.kind}) EAGLES ${thru}! ${p.toPar}, ${p.posText}`, true);
      else if (d === -1) addFeed(`😬 ${e.name} (${who} ${e.kind}) bogeys ${thru}. ${p.toPar}`, true);
      else if (d <= -2) addFeed(`💀 ${e.name} (${who} ${e.kind}) makes a double or worse on ${thru}. ${p.toPar}`, true);
    }
    snap = next;
    const st = standings();
    if (st && st.winner && st.winner !== lastLeader) {
      if (lastLeader) addFeed(`🔄 ${st.winner} takes the pool lead from ${lastLeader}. $${st.per} each on the line.`, true);
      lastLeader = st.winner;
    }
    if (inParty) renderParty();
  }

  // ---------- Reactions ----------
  function fly(e, m) {
    const d = document.createElement("div");
    d.className = "wp-fly";
    d.style.left = (10 + Math.random() * 75) + "vw";
    d.innerHTML = `${esc(e)}<small>${esc(m)}</small>`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2700);
  }
  function sendReact(e) {
    fly(e, me);
    if (chan) chan.send({ type: "broadcast", event: "rx", payload: { e, m: me } });
  }

  // ---------- Second screen ----------
  let ov = null, wake = null, pollTimer = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator) wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
  }
  function openParty() {
    if (ov) return;
    joinChannel();
    inParty = true;
    ov = document.createElement("div");
    ov.className = "wp";
    document.body.appendChild(ov);
    if (chan) chan.track({ watching: true, at: Date.now() });
    keepAwake();
    fetchLive();
    pollTimer = setInterval(() => { if (!document.hidden) fetchLive(); }, 60000);
    renderParty();
  }
  function closeParty() {
    inParty = false;
    if (chan) chan.untrack();
    clearInterval(pollTimer);
    try { wake && wake.release(); } catch (e) {}
    wake = null;
    if (ov) ov.remove();
    ov = null;
    renderActive();
  }
  document.addEventListener("visibilitychange", () => {
    if (!inParty) return;
    if (!document.hidden) { keepAwake(); if (chan) chan.track({ watching: true, at: Date.now() }); }
  });

  function scoreCls(t) { return /^-/.test(t || "") ? "under" : ""; }
  function renderParty() {
    if (!ov) return;
    const keep = ov.querySelector(".wp-scroll");
    const top = keep ? keep.scrollTop : 0;
    const st = standings(), air = onAir(), t = weekTourney(currentWeek());
    const faces = watchingNow();
    ov.innerHTML = `
      <div class="wp-top"><h3>🍿 Watch party</h3><button class="wp-x" aria-label="Close">✕</button></div>
      <div class="wp-faces">${faces.length ? faces.map(m => `<span class="wp-face"><i>${initial(m)}</i>${esc(m)}</span>`).join("") : `<span class="hint" style="color:#cfe3d4">Just you so far. Ping the group.</span>`}</div>
      <div class="wp-scroll">
        ${air.length ? `<div class="wp-sec"><h4>On now</h4>${air.map(w => `<div class="wp-row"><span class="wp-live"></span><span class="n"><b>${esc(w.network)}</b> · ${esc(w.kind)}</span>${w.url ? `<a class="btn" style="margin:0;padding:6px 14px;font-size:13px;width:auto;flex:none" href="${esc(w.url)}" target="_blank" rel="noopener">Open</a>` : ""}</div>`).join("")}</div>` : ""}
        ${st ? `<div class="wp-sec"><h4>If it ended right now</h4>
          <div class="wp-money">${esc(st.winner || "Nobody")} ${st.winner ? `wins $${st.per} from everyone` : ""}</div>
          ${st.rows.map((r, i) => `<div class="wp-row ${r.m === st.winner ? "lead" : ""}"><span class="p">${i + 1}</span>
            <span class="n"><b>${esc(r.m)}</b>${r.m === me ? " (you)" : ""}<br>
            ${r.mine.map(e => `<span class="g">${e.kind === "hot" ? "🔥" : "🐶"} ${esc(e.name)} <span class="wp-sc ${scoreCls(e.p && e.p.toPar)}">${e.p ? `${esc(e.p.posText)} ${esc(e.p.toPar || "")}${e.p.hole ? ` (on ${e.p.hole})` : e.p.thru === "F" ? " (F)" : ""}` : "—"}</span></span>`).join("<br>")}</span></div>`).join("")}
        </div>` : `<div class="wp-sec"><h4>Pool standings</h4><p class="hint" style="color:#cfe3d4;margin:0">Shows up once the picks are in and play starts${t ? ` at the ${esc(t.name.replace(/\s+pres.*$/i, ""))}` : ""}.</p></div>`}
        <div class="wp-sec"><h4>Play-by-play</h4><div class="wp-feed">${feed.length ? feed.map(f => `<div><small>${new Date(f.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>${esc(f.text)}</div>`).join("") : `<div style="opacity:.7">Birdies, bogeys and lead changes for pool golfers show up here. Scores refresh every minute.</div>`}</div></div>
        <div class="wp-sec wp-how"><h4>Watch together on FaceTime</h4><ol>
          <li>Start a FaceTime with the group (in your Messages group, tap the group name, then FaceTime).</li>
          <li>While on the call, open the ESPN app and play the stream. Tap <b>SharePlay</b> when it asks, so everyone's video stays in sync.</li>
          <li>Everyone needs their own subscription. GOLF Channel and other apps: look for the SharePlay button; if there isn't one, everyone plays it on their own.</li>
          <li>Keep this screen open beside the call. Reactions below fly across everyone's screen.</li></ol></div>
      </div>
      <div class="wp-bar">${REACTS.map(e => `<button data-rx="${e}">${e}</button>`).join("")}</div>`;
    ov.querySelector(".wp-x").onclick = closeParty;
    ov.querySelectorAll("[data-rx]").forEach(b => b.onclick = () => sendReact(b.dataset.rx));
    const sc = ov.querySelector(".wp-scroll");
    if (sc) sc.scrollTop = top;
  }

  // ---------- Starting a party ----------
  async function startParty() {
    const air = onAir()[0];
    const net = air ? air.network : "the stream";
    const t = weekTourney(currentWeek());
    try { await write("week", currentWeek(), { party: { host: me, at: Date.now(), network: air ? air.network : "" } }); } catch (e) {}
    openParty();
    const text = `🍿 Hotdawgs watch party! ${t ? t.name.replace(/\s+pres.*$/i, "") + " " : ""}is on ${net}. I'm starting a FaceTime: jump on, and open the app for live pool standings: ${location.origin + location.pathname}`;
    if (HD.shareText) HD.shareText(text);
  }

  // ---------- Cards ----------
  function partyCard(compact) {
    const air = onAir(), faces = watchingNow();
    const party = weekOf(currentWeek()).party;
    const fresh = party && Date.now() - party.at < 4 * 3600000;
    if (!air.length && !isLiveGolf() && !faces.length && !compact) return "";
    return `<div class="card wp-card" id="${compact ? "wpLive" : "wpHome"}">
      <h2>🍿 Watch party</h2>
      ${faces.length ? `<p style="margin:2px 0"><span class="wp-live"></span><b>Watching now</b></p><div class="wp-faces">${faces.map(m => `<span class="wp-face"><i>${initial(m)}</i>${esc(m)}</span>`).join("")}</div>`
        : `<p class="hint" style="margin:2px 0 10px">${air.length ? `${esc(air[0].network)} is ${air[0].start > Date.now() ? "about to start" : "live"}. ` : ""}Watch together on FaceTime with live pool standings on the side.${fresh && party.host !== me ? ` ${esc(party.host)} started one.` : ""}</p>`}
      <div class="wp-btns">
        <button class="btn" data-wp="${faces.length || fresh ? "join" : "start"}">${faces.length || fresh ? "Join the party" : "Start a party"}</button>
        <button class="btn ghost" data-wp="open" style="background:transparent;color:#fff;border-color:#fff">Second screen</button>
      </div></div>`;
  }
  function wire(el) {
    el.querySelectorAll("[data-wp]").forEach(b => b.onclick = () => {
      const a = b.dataset.wp;
      if (a === "start") startParty();
      else openParty();
    });
  }
  function refreshCards() {
    ["wpHome", "wpLive"].forEach(id => { const old = document.getElementById(id); if (old) { const box = document.createElement("div"); box.innerHTML = partyCard(id === "wpLive"); const nu = box.firstElementChild; if (nu) { old.replaceWith(nu); wire(nu); } else old.remove(); } });
  }

  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    joinChannel();
    diff();
    const active = document.querySelector("section.active");
    const id = active && active.id;
    if (id === "home") {
      const wrap = document.getElementById("homeWrap");
      if (wrap && !wrap.querySelector("#wpHome")) {
        const html = partyCard(false);
        if (html) {
          const box = document.createElement("div"); box.innerHTML = html;
          const el = box.firstElementChild;
          const tv = wrap.querySelector("#tvHome"), hero = [...wrap.querySelectorAll(".card.hd-hero")].pop();
          (tv || hero) ? (tv || hero).after(el) : wrap.prepend(el);
          wire(el);
        }
      }
    }
    if (id === "scores") {
      const tv = document.getElementById("tvFull");
      if (tv && !document.getElementById("wpLive")) {
        const box = document.createElement("div"); box.innerHTML = partyCard(true);
        const el = box.firstElementChild; tv.before(el); wire(el);
      }
    }
    if (inParty) renderParty();
  };

  window.HD = Object.assign(window.HD || {}, { openParty, closeParty, startParty, watchingNow, liveStandings: standings });
})();
