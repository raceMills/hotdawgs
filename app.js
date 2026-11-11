// Built by scripts/bundle.mjs from the files listed there. Edit those, not this.

/* ===== draft.js ===== */
;// Hotdawgs draft: 2-round snake with a rotating first pick (rules live in core.js).
// Adds: draft locked until the field is posted, a pick clock that auto-picks when it
// runs out (paused overnight), each member's pick queue, odds, and commissioner
// "pick for" mode. Must load after the main script.

(function () {
  const C = HDCore;
  let lastClock = null;      // who was on the clock last render, to alert the next person
  let justPickedWeek = null; // after you pick, offer to nudge the next person
  let openingWeek = null, autoBusy = false;

  const appLink = () => location.origin + location.pathname;
  const draftOrder = (week) => C.draftOrder(week, MEMBERS);
  const draftState = (week) => C.draftState(week, weekOf(week).picks || {}, MEMBERS);
  // Who you're picking for: yourself, or someone else in commissioner mode
  const actor = () => window.HD_PROXY || me;
  // The draft opens once the field is posted (or the commissioner opens it early)
  const draftOpen = (week) => fieldIsLive() || !!weekOf(week).forceOpen;
  const clock = (week) => C.clockInfo(weekOf(week), config, Date.now());
  function fmtLeft(ms) {
    const m = Math.ceil(ms / 60000), h = Math.floor(m / 60);
    return h ? `${h}h ${m % 60}m` : `${m}m`;
  }
  function clockLine(week, st) {
    if (st.complete || !draftOpen(week)) return "";
    const ci = clock(week);
    if (weekOf(week).clockPaused) return "⏸ Pick clock paused by the commissioner";
    if (!ci) return config.autoPickHours === 0 ? "No pick clock this season" : "";
    if (ci.waiting) return `⏱ No rush yet. The ${Math.round(ci.limitMs / 360000) / 10}-hour pick clock starts ${new Date(ci.startsAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" }).replace(":00", "")}`;
    if (ci.quiet) return `🌙 Clock paused overnight · ${fmtLeft(ci.leftMs)} left after 7am`;
    return ci.due ? "⏱ Time's up. Auto-picking…" : `⏱ Auto-pick in ${fmtLeft(ci.leftMs)}`;
  }

  // Which golfer went in a member's 1st or 2nd slot
  function slotPick(week, m, nth) {
    const p = (weekOf(week).picks || {})[m] || {};
    const first = p.first || (p.hot ? "hot" : "dawg");
    const kind = nth === 1 ? first : (first === "hot" ? "dawg" : "hot");
    return p[kind] ? { name: p[kind], kind } : null;
  }
  const takenNames = (week) => C.entriesOf(weekOf(week).picks).map(e => e.name);
  const queueOf = (week, m) => (weekOf(week).queues || {})[m] || [];

  window.HD = Object.assign(window.HD || {}, { draftState, draftOrder, draftOpen, clock, fmtLeft, clockLine, tellGroup: (w, pk) => tellGroup(w, pk) });

  // ----- Emoji reactions on picks (tap a pick on the board) -----
  const EMOJI = ["🔥", "🤡", "🥚", "🌭", "💀", "🐐"];
  let openReact = null;
  const rStyle = document.createElement("style");
  rStyle.textContent = `
    .hd-reactable { cursor: pointer; }
    .hd-reacts { flex-basis: 100%; display: flex; gap: 5px; flex-wrap: wrap; padding-left: 26px; margin-top: 4px; }
    .hd-reacts:empty { display: none; }
    .hd-rx { font-size: 13px; background: var(--cream); border: 2px solid var(--shadow); border-radius: 999px; padding: 1px 7px; font-weight: 800; }
    .hd-rx.mine { background: var(--mustard); }
    .hd-rpick { font-size: 22px; background: var(--paper); border: 2px solid var(--shadow); border-radius: 12px; padding: 3px 8px; cursor: pointer;
      box-shadow: 2px 2px 0 var(--shadow); animation: hdPop .25s ease-out; }
    .hd-rpick.on { background: var(--mustard); }
    @keyframes hdPop { from { transform: scale(.4); } }
  `;
  document.head.appendChild(rStyle);
  function reactionsHtml(week, name) {
    const r = ((weekOf(week).reactions || {})[name]) || {};
    if (openReact === name) {
      return `<div class="hd-reacts">${EMOJI.map(e => `<span class="hd-rpick ${r[me] === e ? "on" : ""}" data-emo="${e}">${e}</span>`).join("")}</div>`;
    }
    const count = {};
    Object.entries(r).forEach(([m, e]) => { if (e) (count[e] = count[e] || []).push(m); });
    return `<div class="hd-reacts">${Object.entries(count).map(([e, ms]) => `<span class="hd-rx ${ms.includes(me) ? "mine" : ""}" title="${ms.join(", ")}">${e} ${ms.length}</span>`).join("")}</div>`;
  }
  async function react(week, name, emo) {
    const cur = (((weekOf(week).reactions || {})[name]) || {})[me];
    openReact = null;
    await write("week", week, { reactions: { [name]: { [me]: cur === emo ? null : emo } } });
  }

  async function nudge(who, week, st) {
    const ci = clock(week);
    const text = who === null
      ? `🌭 Week ${wk(week)} draft is done! Picks are in: ${appLink()}`
      : `🌭 ${C.nudgeLine(who)}\nWeek ${wk(week)}, pick ${st.clock + 1} of ${st.total}.${ci && !ci.due && !ci.waiting ? ` Auto-pick in ${fmtLeft(ci.leftMs)}.` : ""} ${appLink()}`;
    // Their Ketchup Cam photo from this week comes along, if they posted one
    const photo = who && ((weekOf(-week).photos || {})[who]);
    HD.shareText(photo ? text.replace("\n", `\n📸 Exhibit A: ${who}'s Ketchup Cam dog.\n`) : text, photo ? { photo, photoName: `${who}-ketchup-cam` } : null);
  }

  // Split "Austin Championship pres. by Compliance Solutions" into name + sponsor
  function splitName(n) {
    const m = /^(.*?)\s+(pres\.? by|presented by)\s+(.*)$/i.exec(n || "");
    return m ? { main: m[1], sponsor: "presented by " + m[3] } : { main: n || "", sponsor: "" };
  }
  const tourneyStyle = document.createElement("style");
  tourneyStyle.textContent = `
    #draftForCard { padding: 0; border-width: 4px; }
    #draftForCard .stub { background: var(--teal); color: #fff; font-size: 12px; font-weight: 900; letter-spacing: .1em;
      text-transform: uppercase; padding: 8px 14px; display: flex; justify-content: space-between; gap: 8px; }
    #draftForCard .body { padding: 12px 14px 14px; background: repeating-linear-gradient(135deg, #fff 0 14px, #FFFBF0 14px 28px); }
    #draftForCard .tname { font-family: "Rockwell", Georgia, serif; font-size: 27px; font-weight: 900; line-height: 1.05; color: var(--red-dark); }
    #draftForCard .spons { font-size: 12px; opacity: .7; margin-top: 2px; }
    #draftForCard .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    #draftForCard .meta span { font-size: 12px; font-weight: 800; background: var(--cream); border: 2px solid var(--shadow);
      border-radius: 999px; padding: 3px 9px; }
    #draftForCard .meta .warn { background: var(--mustard); }
    #draftForCard .meta .ok { background: var(--green); color: #fff; }
    .hd-qbtn { border: 2px solid var(--shadow); background: #fff; border-radius: 999px; font: inherit; font-size: 12px;
      font-weight: 900; padding: 4px 8px; color: var(--ink); cursor: pointer; white-space: nowrap; }
    .hd-qbtn.on { background: var(--mustard); }
    .hd-odds { color: var(--teal); font-weight: 900; }
    .golfer > div:first-child { min-width: 0; flex: 1; }
    .golfer > div:last-child { margin-left: 10px; flex: none; }
    .golfer .owner { margin-left: 2px; }
    .hd-oddpill { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.05; min-width: 52px; padding: 3px 7px; border-radius: 10px;
      background: #e3f4ef; color: var(--teal); border: 2px solid var(--teal); font-weight: 900; font-size: 13px; font-variant-numeric: tabular-nums; }
    .hd-oddpill small { font-size: 10px; font-weight: 800; opacity: .8; }
    .hd-qmeta { font-size: 12px; font-weight: 700; opacity: .75; }
    .hd-qdraft { width: auto !important; padding: 0 10px !important; background: var(--red) !important; color: #fff !important; font-weight: 900; }
    .hd-proxy { background: var(--teal); color: #fff; border: 3px solid var(--shadow); border-radius: 12px; padding: 10px 12px;
      margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-weight: 900; }
    .hd-lock { background: var(--cream); border: 3px dashed var(--bun); border-radius: 12px; padding: 14px; text-align: center; }
    .hd-qrow { display: flex; align-items: center; gap: 6px; padding: 7px 0; border-bottom: 1px dashed var(--bun); }
    .hd-qrow:last-child { border-bottom: 0; }
    .hd-qrow .n { width: 22px; font-weight: 900; }
    .hd-qrow .nm { flex: 1; font-weight: 800; }
    .hd-qrow .nm.gone { text-decoration: line-through; opacity: .5; }
    .hd-mini { border: 2px solid var(--shadow); background: var(--cream); border-radius: 8px; font: inherit; font-weight: 900; width: 30px; height: 28px; cursor: pointer; color: var(--ink); }
  `;
  document.head.appendChild(tourneyStyle);

  function renderDraftFor(week) {
    let card = document.getElementById("draftForCard");
    if (!card) {
      card = document.createElement("div");
      card.className = "card";
      card.id = "draftForCard";
      const dc = document.getElementById("draftCard");
      dc.insertBefore(card, dc.firstChild);
    }
    const t = currentTourney();
    if (!t) {
      card.innerHTML = `<div class="stub"><span>Week ${wk(week)} draft</span></div>
        <div class="body"><div class="tname">Tournament TBA</div><p class="hint" style="margin:6px 0 0">Waiting on ESPN's schedule.</p></div>`;
      return;
    }
    const n = splitName(t.name);
    const days = t.start ? Math.round((new Date(t.start + "T12:00:00") - new Date(new Date().toDateString() + " 12:00:00")) / 86400000) : null;
    const when = t.final ? "Final" : t.round ? (t.status || `Round ${t.round}`)
      : days === null ? "" : days <= 0 ? "Tees off today" : days === 1 ? "Tees off tomorrow"
      : `Tees off ${new Date(t.start + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
    card.innerHTML = `
      <div class="stub"><span>🏌️ Drafting for week ${wk(week)}</span><span>${fmtDates(t)}</span></div>
      <div class="body">
        <div class="tname">${n.main}</div>
        ${n.sponsor ? `<div class="spons">${n.sponsor}</div>` : ""}
        <div class="meta">
          ${t.where ? `<span>📍 ${t.where}</span>` : ""}
          ${when ? `<span>⏰ ${when}</span>` : ""}
          ${fieldIsLive() ? `<span class="ok">✓ Field posted · ${live.players.length} golfers${live.fieldSource === "PGA Tour" ? " (PGA Tour)" : ""}</span>` : `<span class="warn">⏳ Field not posted yet</span>`}
        </div>
        ${HD.weatherStrip ? HD.weatherStrip(true) : ""}
      </div>`;
  }

  function ensureCard(id, beforeEl) {
    let b = document.getElementById(id);
    if (!b) {
      b = document.createElement("div");
      b.className = "card";
      b.id = id;
      beforeEl.parentNode.insertBefore(b, beforeEl);
    }
    return b;
  }

  // ----- Picking -----
  async function savePick(week, member, g, auto) {
    const kind = g.hot ? "hot" : "dawg";
    await write("week", week, C.pickPatch(weekOf(week), week, member, g.name, kind, auto, auto ? "auto" : me, Date.now()));
  }
  // "Are you sure?" before every pick
  function areYouSure(g, forWho, kind, t) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "hd-ov";
      ov.style.cssText = "display:flex;align-items:center;justify-content:center;padding:20px";
      ov.innerHTML = `<div class="card" style="max-width:420px;width:100%;margin:0;text-align:center">
        <div style="font-size:40px">${kind === "hot" ? "🔥" : "🐶"}</div>
        <h2 style="margin:4px 0">Are you sure?</h2>
        <p style="font-size:17px;margin:6px 0 4px">Draft <b>${g.name}</b> as ${forWho} <b>${kind}</b>${t ? ` for the ${splitName(t.name).main}` : ""}?</p>
        <p class="hint" style="margin:0 0 14px">${g.rank < 999 ? "World #" + g.rank : "Unranked"}${g.odds ? ` · ${g.odds} to win` : ""} · No take-backs (except by the commissioner)</p>
        <button class="btn" data-y="1">Yes, draft ${g.name.split(" ").slice(-1)[0]}</button>
        <button class="btn ghost" data-n="1" style="margin-top:6px">Cancel</button></div>`;
      document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.querySelector("[data-y]").onclick = () => done(true);
      ov.querySelector("[data-n]").onclick = () => done(false);
      ov.addEventListener("click", (e) => { if (e.target === ov) done(false); });
    });
  }
  async function draftPick(g) {
    const week = currentWeek(), who = actor();
    const kind = g.hot ? "hot" : "dawg";
    const t = currentTourney();
    const forWho = who === me ? "your" : `${who}'s`;
    if (!(await areYouSure(g, forWho, kind, t))) return;
    await loadWeek(week); // latest picks, so two people can't grab the same golfer
    const st = draftState(week);
    if (st.onClock !== who) { toast("That turn is over. Someone already picked."); renderActive(); return; }
    if (HD.notTeedOff && live.players.some(p => p.posText && p.posText !== "—") && !HD.notTeedOff(g.name)) { toast(`${g.name} has already teed off. Pick someone who hasn't.`); return; }
    if (takenNames(week).some(n => C.compactKey(n) === C.compactKey(g.name))) { toast(`${g.name} was just taken.`); renderActive(); return; }
    const mine = (weekOf(week).picks || {})[who] || {};
    if (mine[kind]) { toast(`${who === me ? "You" : who} already ${who === me ? "have" : "has"} a ${kind}. Pick a ${kind === "hot" ? "dawg" : "hot"}.`); return; }
    await savePick(week, who, g, false);
    if (who !== me) { toast(`Picked ${g.name} for ${who}`); window.HD_PROXY = null; }
    else { justPickedWeek = week; celebrate(); setTimeout(() => tellGroup(week, { g: g.name, kind, rank: g.rank }), 1600); }
  }
  // Right after your pick: a pop-up to text the group who's up next, with a joke.
  // (One tap opens Messages addressed to Hot Dawgs; Apple requires that tap.)
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function tellGroup(week, pk) {
    const st = draftState(week);
    const roast = pk ? C.pickLine(me, pk.g, pk.kind, pk.rank) : "";
    if (document.querySelector(".hd-tell")) return;
    const next = st.complete ? null : st.onClock;
    const line = (roast ? roast + " " : "") + (next ? C.nudgeLine(next) : `Week ${wk(week)} draft is done! All ${st.total} picks are in.`);
    const ov = document.createElement("div");
    ov.className = "hd-ov hd-tell";
    ov.style.cssText = "display:flex;align-items:center;justify-content:center;padding:20px";
    ov.innerHTML = `<div class="card" style="max-width:420px;width:100%;margin:0">
      <h2>${next ? `📣 Tell the group ${esc(next)} is up` : "📣 Tell the group the draft's done"}</h2>
      <p style="font-size:16px;margin:6px 0 12px">“${esc(line)}”</p>
      <button class="btn" data-t="send">Send to Hot Dawgs 💬</button>
      <button class="btn ghost" data-t="skip" style="margin-top:6px">Skip</button></div>`;
    document.body.appendChild(ov);
    ov.querySelector("[data-t=skip]").onclick = () => ov.remove();
    ov.querySelector("[data-t=send]").onclick = () => {
      ov.remove();
      justPickedWeek = null;
      const ci = clock(week);
      if (!next) return HD.shareText(`🌭 ${line} ${appLink()}`);
      const photo = (weekOf(-week).photos || {})[next];
      const text = `🌭 ${line}\n${photo ? `📸 Exhibit A: ${next}'s Ketchup Cam dog.\n` : ""}Week ${wk(week)}, pick ${st.clock + 1} of ${st.total}.${ci && !ci.due && !ci.waiting ? ` Auto-pick in ${fmtLeft(ci.leftMs)}.` : ""} ${appLink()}`;
      HD.shareText(text, photo ? { photo, photoName: `${next}-ketchup-cam` } : null);
      renderActive();
    };
  }
  // Auto-pick for whoever is on the clock when their time runs out. Any open phone
  // can do this; the background task does it too if no phone is open.
  async function autoPickIfDue(force) {
    const week = currentWeek();
    if (autoBusy || !dataReady || !draftOpen(week) || !golfers.length) return;
    let st = draftState(week);
    if (st.complete) return;
    const ci = clock(week);
    if (!force && (!ci || !ci.due)) return;
    autoBusy = true;
    try {
      await loadWeek(week);
      st = draftState(week);
      const ci2 = clock(week);
      if (st.complete || (!force && (!ci2 || !ci2.due))) return;
      const m = st.onClock;
      const choice = C.chooseAutoPick(golfers, takenNames(week), (weekOf(week).picks || {})[m], queueOf(week, m));
      if (!choice) return;
      await savePick(week, m, choice.golfer, true);
      toast(`⏱ ${force ? "Auto-picked" : "Time's up."} ${choice.golfer.name} for ${m === me ? "you" : m}${choice.fromQueue ? " from the queue" : ""}.`);
    } finally { autoBusy = false; }
  }
  // Record when the draft opened (starts the first pick's clock)
  function markOpen(week) {
    if (!dataReady || openingWeek === week || weekOf(week).draftOpenAt || !draftOpen(week) || draftState(week).complete) return;
    openingWeek = week;
    write("week", week, { draftOpenAt: Date.now() });
    toast(`🌭 The field is set. The week ${wk(week)} draft is open!`);
  }
  setInterval(() => { if (!document.hidden) { markOpen(currentWeek()); autoPickIfDue(false); } }, 30000);
  window.HD.autoPickNow = () => autoPickIfDue(true);

  // ----- Queue -----
  async function setQueue(week, list) {
    await write("week", week, { queues: { [me]: list } });
  }
  function toggleQueue(week, name) {
    const q = queueOf(week, me).slice();
    const i = q.findIndex(n => C.compactKey(n) === C.compactKey(name));
    if (i >= 0) q.splice(i, 1); else q.push(name);
    setQueue(week, q);
    toast(i >= 0 ? `Removed ${name} from your queue` : `Added ${name} to your queue (#${q.length})`);
  }
  // "+1300" -> "7%": the chance to win that the odds imply
  const oddsPct = (o) => { const n = parseInt(o, 10); if (!n) return ""; const p = n > 0 ? 100 / (n + 100) : -n / (-n + 100); return p >= 0.095 ? Math.round(p * 100) + "%" : (p * 100).toFixed(1) + "%"; };
  const oddsPill = (o) => o ? `<span class="hd-oddpill" title="Odds to win: about ${oddsPct(o)} chance">${o}<small>${oddsPct(o)}</small></span>` : "";
  const golferOf = (n) => golfers.find(g => C.compactKey(g.name) === C.compactKey(n));
  function renderQueue(week, st, beforeEl) {
    const card = ensureCard("queueCard", beforeEl);
    const q = queueOf(week, me);
    const taken = new Set(takenNames(week).map(C.compactKey));
    const mine = (weekOf(week).picks || {})[me] || {};
    const need = C.needOf(mine);
    if (!need) { card.hidden = true; return; }
    card.hidden = false;
    const myTurn = st.onClock === me && !window.HD_PROXY && draftOpen(week);
    const next = C.chooseAutoPick(golfers, takenNames(week), mine, q);
    card.innerHTML = `<h2>My queue ⭐</h2>
      <p class="hint">Star golfers to line them up. ${config.autoPickHours === 0 ? "" : "If your clock runs out, auto-pick takes the first one still available that fills a slot you need, or else the best-ranked golfer left."}</p>
      ${q.length ? q.map((n, i) => `<div class="hd-qrow"><span class="n">${i + 1}</span>
          ${(g => {
            const gone = taken.has(C.compactKey(n));
            const noFit = g && !gone && need !== "either" && (need === "hot") !== !!g.hot;
            return `<span class="nm ${gone ? "gone" : ""}" ${noFit ? `style="opacity:.55"` : ""}>${n}${g ? `<br><span class="hd-qmeta">${g.hot ? "🔥 Hot" : "🐶 Dawg"} · ${g.rank < 999 ? "World #" + g.rank : "Unranked"}${g.odds ? ` · <span class="hd-odds">${g.odds}</span>` : ""}</span>` : `<br><span class="hd-qmeta">Not in this week's field</span>`}${gone ? `<br><span class="hd-qmeta">Taken</span>` : noFit ? `<br><span class="hd-qmeta">Skipped: you already have a ${g.hot ? "hot" : "dawg"}</span>` : ""}</span>`;
          })(golferOf(n))}
          ${myTurn && (g => g && !taken.has(C.compactKey(n)) && (need === "either" || (need === "hot") === !!g.hot))(golferOf(n)) ? `<button class="hd-mini hd-qdraft" data-qpick="${i}">Draft</button>` : ""}
          <button class="hd-mini" data-qup="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="hd-mini" data-qdown="${i}" ${i === q.length - 1 ? "disabled" : ""}>↓</button>
          <button class="hd-mini" data-qdel="${i}">✕</button></div>`).join("")
        : `<p class="hint" style="margin:0">Your queue is empty. Tap ☆ next to any golfer below.</p>`}
      ${next ? `<p class="hint" style="margin:10px 0 0">Next up for you: <b>${next.golfer.name}</b> (${next.golfer.hot ? "🔥 hot" : "🐶 dawg"}, ${next.golfer.rank < 999 ? "#" + next.golfer.rank : "unranked"}${next.golfer.odds ? `, ${next.golfer.odds}` : ""}) ${next.fromQueue ? "from your queue" : "best-ranked available"}</p>` : ""}
      ${myTurn && next ? `<button class="btn" id="qPickBtn">Draft ${next.golfer.name}</button><p class="hint" style="margin:6px 0 0;text-align:center">Or tap <b>Draft</b> on any golfer in your queue.</p>` : ""}`;
    const move = (i, d) => { const a = q.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; setQueue(week, a); };
    card.querySelectorAll("[data-qup]").forEach(b => b.onclick = () => move(Number(b.dataset.qup), -1));
    card.querySelectorAll("[data-qdown]").forEach(b => b.onclick = () => move(Number(b.dataset.qdown), 1));
    card.querySelectorAll("[data-qdel]").forEach(b => b.onclick = () => { const a = q.slice(); a.splice(Number(b.dataset.qdel), 1); setQueue(week, a); });
    card.querySelectorAll("[data-qpick]").forEach(b => b.onclick = () => { const g = golferOf(q[Number(b.dataset.qpick)]); if (g) draftPick(g); });
    const qp = document.getElementById("qPickBtn");
    if (qp) qp.onclick = () => draftPick(next.golfer);
  }

  // ----- Draft screen -----
  renderDraft = function () {
    renderSetup();
    if (!me) { $("#draftCard").hidden = true; return; }
    $("#draftCard").hidden = false;
    const week = currentWeek();
    markOpen(week);
    const st = draftState(week);
    const who = actor();
    const proxy = who !== me;
    const mine = (weekOf(week).picks || {})[who] || {};
    const open = draftOpen(week);
    const myTurn = open && st.onClock === who;
    const need = C.needOf(mine);

    // Alert when it becomes your turn while the app is open
    if (st.onClock !== lastClock) {
      if (st.onClock === me && lastClock !== null) {
        toast("🌭 You're on the clock!");
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
      lastClock = st.onClock;
    }

    // ----- Draft board -----
    const dc = document.getElementById("draftCard");
    const board = ensureCard("boardCard", dc.firstChild);
    renderDraftFor(week);
    const row = (s) => {
      const p = s.done ? slotPick(week, s.m, s.nth) : null;
      const now = open && s.i === st.clock;
      const log = ((weekOf(week).pickLog || {})[s.i]) || {};
      const wd = p && HD.isWD && HD.isWD(week, p.name);
      return `<div class="rule ${p ? "hd-reactable" : ""}" ${p ? `data-react="${p.name.replace(/"/g, "&quot;")}"` : ""} style="flex-wrap:wrap;${now ? "background:var(--mustard);border-radius:10px;padding:8px;" : ""}">
        <span style="width:26px;font-weight:900">${s.i + 1}</span>
        <span style="flex:1">${s.m}${s.m === me ? " (you)" : ""}</span>
        <span class="hint" style="margin:0">${p ? `${p.name} · ${p.kind === "hot" ? "🔥" : "🐶"}${log.auto ? " ⏱" : ""}${wd ? ` <b style="color:var(--red)">⚠️ WD</b>` : ""}` : (now ? "On the clock" : "")}</span>
        ${p ? reactionsHtml(week, p.name) : ""}
      </div>`;
    };
    const cl = clockLine(week, st);
    let banner;
    if (!open && !st.complete) {
      const t = currentTourney();
      banner = `<div class="hd-lock"><div style="font-size:20px;font-weight:900">🔒 Draft opens when the field is posted</div>
        <p class="hint" style="margin:6px 0 0">The app checks for the ${t ? splitName(t.name).main : "tournament"} field every few hours. ${st.onClock} picks first. Start your queue below while you wait.</p></div>`;
    } else if (st.complete) {
      banner = `<div class="big">Draft complete ✓</div>`;
    } else if (myTurn) {
      banner = `<div style="background:var(--red);color:#fff;border:3px solid var(--shadow);border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900">${proxy ? `Picking for ${who}` : "🌭 You're on the clock!"}</div>
        <div>Pick ${st.clock + 1} of ${st.total}: draft ${proxy ? "their" : "your"} ${need === "either" ? "hot or dawg" : need}.</div>
        ${cl ? `<div style="margin-top:6px;font-weight:900">${cl}</div>` : ""}</div>`;
    } else {
      banner = `<div class="big">On the clock: ${st.onClock}</div>
        <div class="hint">Pick ${st.clock + 1} of ${st.total}${cl ? ` · ${cl}` : ""}</div>`;
    }
    const justPicked = justPickedWeek === week && st.onClock !== me;
    const nudgeBtn = !open && !st.complete ? ""
      : st.complete ? `<button class="btn ghost" id="nudgeBtn">Tell the group the draft is done 💬</button>`
      : (st.onClock !== me ? `<button class="btn ${justPicked ? "" : "ghost"}" id="nudgeBtn">${justPicked ? `Your pick is in. Text ${st.onClock} they're up 💬` : `Nudge ${st.onClock} in the group chat 💬`}</button>` : "");
    board.innerHTML = `
      ${proxy ? `<div class="hd-proxy"><span style="flex:1">🧢 Commissioner mode: picking for ${who}</span><button class="btn small ghost" id="proxyCancel">Cancel</button></div>` : ""}
      <h2>Draft order${currentTourney() ? ` · ${splitName(currentTourney().name).main}` : ""}</h2>
      ${banner}
      ${nudgeBtn}
      <p class="hint" style="margin-top:14px">Round 1</p>
      ${st.board.filter(s => s.round === 1).map(row).join("")}
      <p class="hint" style="margin-top:12px">Round 2 (reverse order)</p>
      ${st.board.filter(s => s.round === 2).map(row).join("")}
      <p class="hint" style="margin-top:10px">Tap any pick to react. First pick rotates each week. Next week ${draftOrder(week + 1)[0]} picks first.${Object.values(weekOf(week).pickLog || {}).some(l => l.auto) ? " ⏱ = auto-picked." : ""}</p>`;
    board.querySelectorAll("[data-react]").forEach(el => el.onclick = (e) => {
      const emo = e.target.closest("[data-emo]");
      if (emo) { e.stopPropagation(); return react(week, el.dataset.react, emo.dataset.emo); }
      openReact = openReact === el.dataset.react ? null : el.dataset.react;
      renderDraft();
    });
    const nb = document.getElementById("nudgeBtn");
    if (nb) nb.onclick = () => { justPickedWeek = null; nudge(st.complete ? null : st.onClock, week, st); renderDraft(); };
    const pc = document.getElementById("proxyCancel");
    if (pc) pc.onclick = () => { window.HD_PROXY = null; renderDraft(); };

    // ----- Your picks -----
    $("#draftTitle").innerHTML = `${proxy ? `${who}'s picks` : "Your picks"}<small>${need ? (myTurn ? (proxy ? "Their turn" : "Your turn") : "Waiting for your turn") : "Both picks in"}</small>`;
    fillSlot($("#slotHot"), mine.hot, "Hot", "Pick a top 10");
    fillSlot($("#slotDawg"), mine.dawg, "Dawg", "Pick a field golfer");

    // ----- Queue (your own, not in commissioner mode) -----
    const listCard = $("#golferList").closest(".card");
    if (!proxy) renderQueue(week, st, listCard);
    else { const qc = document.getElementById("queueCard"); if (qc) qc.hidden = true; }

    // ----- Golfer list -----
    if (myTurn && (need === "hot" || need === "dawg") && filter !== need) {
      filter = need;
      document.querySelectorAll(".chip[data-filter]").forEach(x => x.classList.toggle("on", x.dataset.filter === need));
    }
    const owners = {};
    C.entriesOf(weekOf(week).picks).forEach(e => owners[C.compactKey(e.name)] = e.who);
    const queued = queueOf(week, me).map(C.compactKey);
    const list = $("#golferList");
    const t = currentTourney();
    const hasOdds = golfers.some(g => g.odds);
    list.innerHTML = (fieldIsLive() ? "" : `<p class="hint" style="background:var(--cream);border:2px dashed var(--bun);border-radius:10px;padding:8px">⏳ The ${t ? splitName(t.name).main : "tournament"} field isn't posted yet, so this is the world top 200. Some of them may not be playing.</p>`)
      + `<p class="hint">${myTurn ? `Tap a golfer to draft ${proxy ? "for " + who : "them"}.` : need ? "Browse and star golfers for your queue. You can pick when it's your turn." : "You're done this week. Browse the field below."}${hasOdds ? " Teal boxes are odds to win (and the chance they imply)." : " Odds to win show up here once sportsbooks post them, usually Tuesday or Wednesday."}</p>`;
    golfers.filter(g => (filter === "hot") === g.hot).forEach(g => {
      const key = C.compactKey(g.name);
      const owner = owners[key];
      const isMine = mine.hot === g.name || mine.dawg === g.name;
      const qi = queued.indexOf(key);
      const el = document.createElement("div");
      el.className = "golfer" + (isMine ? " selected" : "") + (owner && owner !== who ? " taken" : "");
      el.innerHTML = `<div><div>${g.name}</div><div class="rank">${g.rank < 999 ? "World #" + g.rank : "Unranked"}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${oddsPill(g.odds)}
          ${owner ? `<span class="owner">${owner === me ? "You ✓" : owner}</span>`
            : !proxy && C.needOf((weekOf(week).picks || {})[me]) ? `<button class="hd-qbtn ${qi >= 0 ? "on" : ""}" data-q="1">${qi >= 0 ? `★ #${qi + 1}` : "☆"}</button>` : ""}
        </div>`;
      const qb = el.querySelector("[data-q]");
      if (qb) qb.onclick = (e) => { e.stopPropagation(); toggleQueue(week, g.name); };
      el.onclick = () => {
        if (owner) { if (owner !== who) toast(`${g.name} is already taken by ${owner}`); return; }
        if (!open) { toast("The draft opens when the field is posted. Star golfers for your queue in the meantime."); return; }
        if (!myTurn) { toast(st.complete ? "The draft is done for this week." : `Not your turn yet. ${st.onClock} is on the clock.`); return; }
        const kind = g.hot ? "hot" : "dawg";
        if (mine[kind]) { toast(`Already have a ${kind}. Pick a ${kind === "hot" ? "dawg" : "hot"}.`); return; }
        draftPick(g);
      };
      list.appendChild(el);
    });

    // Picks save one at a time, so the old two-pick button isn't needed
    $("#submitBtn").hidden = true;
    if (open && !st.complete) setTimeout(() => autoPickIfDue(false), 0);
  };

  // ----- Payout alert when the tournament ends -----
  const baseTourney = renderTourney;
  renderTourney = function () {
    baseTourney();
    const el = document.getElementById("tourneyCard");
    if (!el || !live.event || !live.event.final) return;
    const w = currentWeek();
    const doc = weekOf(w);
    const s = doc.settle;
    const box = document.createElement("div");
    box.style.cssText = "background:var(--mustard);border:3px solid var(--shadow);border-radius:12px;padding:12px;margin-bottom:12px";

    if (!s || !s.winner) {
      box.innerHTML = `<div style="font-size:18px;font-weight:900">🏁 Tournament's final!</div>
        <p class="hint" style="margin:4px 0 0">Working out payouts…</p>
        <button class="btn" id="goPayBtn">Go to Payments</button>`;
      el.insertBefore(box, el.firstChild);
      document.getElementById("goPayBtn").onclick = () => { goToTab("payments"); renderActive(); };
      return;
    }

    const per = (s.rules || []).reduce((t, id) => t + amountOf(id), 0);
    const payers = MEMBERS.filter(m => m !== s.winner);
    const paid = doc.paid || {};
    const owing = payers.filter(p => !paid[p]);
    box.innerHTML = owing.length
      ? `<div style="font-size:18px;font-weight:900">🏁 ${s.winner} wins ${money(per * payers.length)}!</div>
         <p class="hint" style="margin:4px 0 0">${s.auto ? "Settled automatically. " : ""}${owing.length} still owe ${money(per)} each: ${owing.join(", ")}.</p>
         <button class="btn" id="payTextBtn">Text payouts to the group 💬</button>`
      : `<div style="font-size:18px;font-weight:900">🏁 ${s.winner} won ${money(per * payers.length)}. Everyone's paid 🎉</div>`;
    el.insertBefore(box, el.firstChild);
    const btn = document.getElementById("payTextBtn");
    if (btn) btn.onclick = async () => {
      const text = `🌭 Week ${wk(w)} is final! ${s.winner} wins ${money(per * payers.length)}. `
        + `${owing.map(p => "@" + p).join(" ")} each owe ${money(per)}. Pay on Venmo in the app: ${appLink()}`;
      HD.shareText(text);
    };
  };

  try { renderActive(); } catch (e) {}
})();


/* ===== stats.js ===== */
;// Hotdawgs Stats tab: season money leaderboard, who pays whom, best picks, and pick history.
// Load after the main script (and after draft.js). It adds its own tab button and section.

(function () {
  // ----- Add the tab and section -----
  const style = document.createElement("style");
  style.textContent = `
    nav { overflow-x: auto; scrollbar-width: none; }
    nav::-webkit-scrollbar { display: none; }
    nav button { flex: 1 0 auto; padding: 9px 10px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 4px; }
    .stat { background: var(--cream); border: 2px solid var(--shadow); border-radius: 12px; padding: 8px; text-align: center; }
    .stat b { display: block; font-family: "Rockwell", Georgia, serif; font-size: 18px; color: var(--red-dark); }
    .stat span { font-size: 11px; opacity: .75; }
    .pos { color: var(--green); font-weight: 900; }
    .neg { color: var(--red); font-weight: 900; }
    .wk { border-bottom: 2px dashed var(--bun); padding: 10px 0; }
    .wk:last-child { border-bottom: 0; }
  `;
  document.head.appendChild(style);

  const navEl = document.querySelector("nav");
  const btn = document.createElement("button");
  btn.dataset.tab = "stats";
  btn.textContent = "Stats";
  navEl.insertBefore(btn, navEl.querySelector('[data-tab="settings"]'));
  btn.onclick = () => { goToTab("stats"); renderActive(); };

  const sec = document.createElement("section");
  sec.id = "stats";
  sec.innerHTML = `<div id="statsWrap"></div>`;
  document.getElementById("settings").after(sec);

  let focus = null; // member shown in the "money between members" card

  // ----- Data helpers -----
  const perPayerOf = (s) => (s.rules || []).reduce((t, id) => t + amountOf(id), 0);
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(n);
  const ord = (n) => {
    if (!n) return "";
    if (n >= 999) return "MC";
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function rankFn() {
    const ranked = rankingsFile
      ? rankingsFile.players.map(p => ({ name: p.name, rank: p.rank }))
      : parseFieldAny(config.fieldText);
    return rankLookup(ranked);
  }

  function seasonData() {
    const rankOf = rankFn();
    const stats = {};
    MEMBERS.forEach(m => stats[m] = { m, earned: 0, owed: 0, wins: 0, played: 0, unpaid: 0 });
    const flowOwed = {}, flowPaid = {}; // flow[payer][winner] = $
    MEMBERS.forEach(a => { flowOwed[a] = {}; flowPaid[a] = {}; MEMBERS.forEach(b => { flowOwed[a][b] = 0; flowPaid[a][b] = 0; }); });
    const best = [], history = [];

    for (let w = seasonStart(); w <= currentWeek(); w++) {
      const d = weekOf(w);
      const picks = d.picks || {};
      const fin = d.finishes || {};
      Object.keys(picks).forEach(m => { if (stats[m] && (picks[m].hot || picks[m].dawg)) stats[m].played++; });

      const s = d.settle;
      let moneyPick = null;
      if (s && s.winner && stats[s.winner]) {
        const per = perPayerOf(s);
        const payers = MEMBERS.filter(m => m !== s.winner);
        stats[s.winner].wins++;
        stats[s.winner].earned += per * payers.length;
        payers.forEach(p => {
          stats[p].owed += per;
          flowOwed[p][s.winner] += per;
          if ((d.paid || {})[p]) flowPaid[p][s.winner] += per;
          else stats[p].unpaid += per;
        });
        // The winner's money pick = their better-finishing golfer that week
        const wp = picks[s.winner] || {};
        const cand = ["hot", "dawg"].filter(k => wp[k]).map(k => ({ name: wp[k], kind: k, pos: fin[wp[k]] || 999 }));
        cand.sort((a, b) => a.pos - b.pos);
        if (cand[0]) {
          moneyPick = cand[0];
          best.push({ w, who: s.winner, name: moneyPick.name, kind: moneyPick.kind, pos: moneyPick.pos, rank: rankOf(moneyPick.name), won: per * payers.length });
        }
      }
      if (Object.keys(picks).length) history.push({ w, picks, fin, settle: s, money: moneyPick });
    }
    MEMBERS.forEach(m => stats[m].net = stats[m].earned - stats[m].owed);
    best.sort((a, b) => b.rank - a.rank || b.won - a.won);
    return { stats, flowOwed, flowPaid, best, history: history.reverse() };
  }

  window.HD = Object.assign(window.HD || {}, { seasonData });

  // ----- Render -----
  function renderStats() {
    const wrap = document.getElementById("statsWrap");
    const { stats, flowOwed, flowPaid, best, history } = seasonData();
    const who = focus || me || MEMBERS[0];
    const board = Object.values(stats).sort((a, b) => b.net - a.net || b.wins - a.wins);
    const mine = stats[who];

    // Money between `who` and everyone else
    const others = MEMBERS.filter(m => m !== who);
    const youPaid = others.map(o => ({ o, paid: flowPaid[who][o], owed: flowOwed[who][o] })).sort((a, b) => b.owed - a.owed);
    const paidYou = others.map(o => ({ o, paid: flowPaid[o][who], owed: flowOwed[o][who] })).sort((a, b) => b.owed - a.owed);
    const topOut = youPaid.find(x => x.owed > 0);
    const topIn = paidYou.find(x => x.owed > 0);

    wrap.innerHTML = `
      <div class="card">
        <h2>Season money</h2>
        ${board.map((s, i) => `
          <div class="payer">
            <div class="avatar">${i === 0 && s.net > 0 ? "👑" : initial(s.m)}</div>
            <div class="info">
              <div class="label">${s.m}${s.m === me ? " (you)" : ""}</div>
              <div class="sub2">${s.wins} win${s.wins === 1 ? "" : "s"} · won ${money(s.earned)} · paid ${money(s.owed)}${s.unpaid ? ` · ${money(s.unpaid)} unpaid` : ""}</div>
            </div>
            <span class="${s.net > 0 ? "pos" : s.net < 0 ? "neg" : ""}" style="font-size:18px">${signed(s.net)}</span>
          </div>`).join("")}
        <p class="hint" style="margin-top:8px">Totals use the current payout amounts and only count weeks with a saved result.</p>
      </div>

      <div class="card">
        <h2>Money between members</h2>
        <div class="chips">${MEMBERS.map(m => `<button class="chip ${m === who ? "on" : ""}" data-focus="${m}">${m}</button>`).join("")}</div>
        <div class="stat-grid">
          <div class="stat"><b>${signed(mine.net)}</b><span>Net</span></div>
          <div class="stat"><b>${mine.wins}</b><span>Wins</span></div>
          <div class="stat"><b>${mine.played}</b><span>Weeks played</span></div>
        </div>
        <p style="margin:12px 0 4px;font-weight:900">${who === me ? "You've" : who + " has"} paid the most to: ${topOut ? `${topOut.o} (${money(topOut.owed)})` : "nobody yet"}</p>
        <p style="margin:0 0 10px;font-weight:900">Paid ${who === me ? "you" : who} the most: ${topIn ? `${topIn.o} (${money(topIn.owed)})` : "nobody yet"}</p>
        ${others.map(o => {
          const out = flowOwed[who][o], inn = flowOwed[o][who], net = inn - out;
          return `<div class="rule">
            <span style="flex:1">${o}</span>
            <span class="hint" style="margin:0 8px 0 0">${who === me ? "you" : who} → ${money(out)} · ← ${money(inn)}</span>
            <span class="${net > 0 ? "pos" : net < 0 ? "neg" : ""}">${signed(net)}</span>
          </div>`;
        }).join("")}
        <p class="hint" style="margin-top:8px">→ is what ${who === me ? "you" : who} owed them, ← is what they owed ${who === me ? "you" : who}.</p>
      </div>

      <div class="card">
        <h2>Best picks 🐶</h2>
        <p class="hint">Money-winning picks, longest shots first, by current world rank.</p>
        ${best.length ? best.slice(0, 10).map(b => `
          <div class="rule">
            <span style="flex:1">${b.name} <span class="hint" style="margin:0">(${b.who}, week ${wk(b.w)}, ${b.kind})</span></span>
            <span class="hint" style="margin:0 8px 0 0">${b.rank < 999 ? "World #" + b.rank : "Unranked"} · ${ord(b.pos)}</span>
            <span class="amt">${money(b.won)}</span>
          </div>`).join("") : `<p class="hint">No winning picks yet. Check back after the first payout.</p>`}
      </div>

      <div class="card">
        <h2>Pick history</h2>
        ${history.length ? history.map(h => `
          <div class="wk">
            <div style="font-weight:900">Week ${wk(h.w)}${h.settle && h.settle.winner ? ` · ${h.settle.winner} won ${money(perPayerOf(h.settle) * (MEMBERS.length - 1))}` : " · not settled"}</div>
            ${MEMBERS.filter(m => h.picks[m]).map(m => {
              const p = h.picks[m];
              const cell = (k) => p[k] ? `${p[k]} <span class="hint" style="margin:0">${ord(h.fin[p[k]])}</span>` : "—";
              const won = h.settle && h.settle.winner === m;
              return `<div class="rule" style="${won ? "background:var(--mustard);border-radius:8px;padding:6px;" : ""}">
                <span style="width:64px;font-weight:900">${m}</span>
                <span style="flex:1;font-size:13px">🔥 ${cell("hot")}<br>🐶 ${cell("dawg")}</span>
              </div>`;
            }).join("")}
          </div>`).join("") : `<p class="hint">No picks yet this season.</p>`}
      </div>`;

    wrap.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => { focus = b.dataset.focus; renderStats(); });
  }

  // Render the Stats tab whenever the app redraws and it's the open tab
  const baseRender = renderActive;
  renderActive = function () {
    baseRender();
    const active = document.querySelector("section.active");
    if (active && active.id === "stats") renderStats();
  };
})();


/* ===== extras.js ===== */
;// Hotdawgs extras: sweat meter, bad beats, draft grades, trophy cards,
// season awards, rivalries, and Ketchup Cam. Load after draft.js and stats.js.
// Adds a "Clubhouse" tab. Photos and votes are saved in the week rows numbered
// negative (week -3 holds week 3's photos), so no new database setup is needed.

(function () {
  // ===================== Styles and the Clubhouse tab =====================
  const style = document.createElement("style");
  style.textContent = `
    .bar { height: 14px; border-radius: 999px; background: var(--cream); border: 2px solid var(--shadow); overflow: hidden; }
    .bar > span { display: block; height: 100%; background: repeating-linear-gradient(90deg, var(--red) 0 10px, #E45A3F 10px 20px); transition: width .8s ease; }
    .award { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 2px dashed var(--bun); }
    .award:last-child { border-bottom: 0; }
    .award .ico { font-size: 26px; width: 34px; text-align: center; }
    .award b { display: block; }
    .grade { font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 22px; width: 44px; text-align: center; color: var(--red-dark); }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .photo { border: 3px solid var(--shadow); border-radius: 12px; overflow: hidden; background: var(--cream); }
    .photo img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
    .photo .cap { padding: 6px 8px; font-weight: 900; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
    .overlay { position: fixed; inset: 0; background: rgba(43,27,16,.85); z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
    .overlay img { max-width: 100%; max-height: 75vh; border-radius: 12px; }
  `;
  document.head.appendChild(style);

  const navEl = document.querySelector("nav");
  const clubBtn = document.createElement("button");
  clubBtn.dataset.tab = "clubhouse";
  clubBtn.textContent = "Clubhouse";
  navEl.insertBefore(clubBtn, navEl.querySelector('[data-tab="settings"]'));
  clubBtn.onclick = () => {
    goToTab("clubhouse");
    const w = currentWeek();
    Promise.all([loadWeek(-w), w > 1 ? loadWeek(-(w - 1)) : null]).then(renderActive);
    renderActive();
  };
  const sec = document.createElement("section");
  sec.id = "clubhouse";
  sec.innerHTML = `<div id="clubWrap"></div>`;
  document.getElementById("settings").after(sec);

  // ===================== Shared helpers =====================
  const appLink = () => location.origin + location.pathname;
  const perPayerOf = (s) => (s.rules || []).reduce((t, id) => t + amountOf(id), 0);
  const potOf = (s) => perPayerOf(s) * (MEMBERS.length - 1);
  const ord = (n) => {
    if (!n) return "";
    if (n >= 999) return "MC";
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const hash = (str) => { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const pickLine = (lines, seed) => lines[hash(seed) % lines.length];
  function rankFn() {
    const ranked = rankingsFile
      ? rankingsFile.players.map(p => ({ name: p.name, rank: p.rank }))
      : parseFieldAny(config.fieldText);
    return rankLookup(ranked);
  }
  const parsePar = (v) => { const s = String(v || "").trim(); if (!s || /^e$/i.test(s)) return 0; const n = parseInt(s.replace("+", ""), 10); return Number.isFinite(n) ? n : 0; };
  const parseThru = (v) => { if (typeof v === "number") return v; const s = String(v || "").trim(); if (/^f/i.test(s)) return 18; return /^\d+$/.test(s) ? Number(s) : 0; };
  function roundInfo() {
    if (!live.event) return null;
    if (live.event.final) return { round: 4, final: true };
    if (live.event.round) return { round: live.event.round, final: false };
    const m = /round\s*(\d)/i.exec(live.event.status || "");
    return m ? { round: Number(m[1]), final: false } : null;
  }
  // Text the group. With everyone's numbers saved (Me tab), this opens Messages
  // already addressed to the whole group, so you just tap Send. Otherwise it
  // falls back to the share sheet.
  function groupNumbers() {
    const ph = config.phones || {};
    // Each is a phone number or an Apple ID email, whichever that person uses in the group chat
    return MEMBERS.filter(m => m !== me && ph[m]).map(m => String(ph[m]).trim())
      .map(v => v.includes("@") ? v : v.replace(/[^\d+]/g, "")).filter(v => v.includes("@") || v.length >= 10);
  }
  // A Ketchup Cam photo can ride along: texts can't carry pictures through a
  // pre-addressed link, so with a photo we use the share sheet (your group chat
  // is usually the first suggestion at the top).
  function photoFile(dataUrl, name) {
    try {
      const [head, b64] = dataUrl.split(",");
      const type = (/data:([^;]+)/.exec(head) || [])[1] || "image/jpeg";
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return new File([bytes], `${name || "ketchup-cam"}.jpg`, { type });
    } catch (e) { return null; }
  }
  async function shareText(text, opts) {
    const photo = opts && opts.photo ? photoFile(opts.photo, opts.photoName) : null;
    if (photo && navigator.share && navigator.canShare && navigator.canShare({ files: [photo] })) {
      try { await navigator.share({ files: [photo], text }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const nums = groupNumbers();
    if (nums.length >= 2) { location.href = `sms://open?addresses=${nums.join(",")}&body=${encodeURIComponent(text)}`; return; }
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} return; }
    location.href = "sms:&body=" + encodeURIComponent(text);
  }

  // Who wins the week under the pool rules, given finishing positions.
  // Mirrors the Calculate button on the Payments tab.
  function outcome(entries, posOf, W, R, rankOf) {
    const all = entries.slice().sort((a, b) => posOf(a.name) - posOf(b.name) || rankOf(b.name) - rankOf(a.name));
    const hits = {};
    const add = (who, id) => { (hits[who] ||= []).push(id); };
    const we = entries.find(e => e.name === W);
    if (we) add(we.who, we.kind === "hot" ? "hotTourney" : "dawgTourney");
    if (all[0] && posOf(all[0].name) < 999 && all[0].name !== W) add(all[0].who, all[0].kind === "hot" ? "hotGroup" : "dawgGroup");
    const t2 = [W, R].map(n => entries.find(e => e.name === n)).filter(Boolean);
    const owners = [...new Set(t2.map(e => e.who))];
    if (t2.length === 2 && owners.length === 1) hits[owners[0]] = ["trueTop2"];
    if (all.length > 1 && all[0].who === all[1].who && posOf(all[1].name) < 999 && !all.some(e => e.name === W)) {
      hits[all[0].who] = [all[0].kind === "hot" ? "top2Hot" : "top2Dawg"];
    }
    let winner = null, best = -1;
    for (const [who, ids] of Object.entries(hits)) {
      const t = ids.reduce((s, id) => s + amountOf(id), 0);
      if (t > best) { best = t; winner = who; }
    }
    return { winner, total: Math.max(best, 0) };
  }

  // ===================== 1. Sweat meter =====================
  // Simulates the rest of the tournament a few hundred times from the live
  // scores and counts how often each member ends up winning the week.
  let sweatCache = { key: "", data: null };
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function sweat(w) {
    const entries = entriesFor(w);
    const ri = roundInfo();
    if (!entries.length || !ri || ri.final || !live.players.length) return null;
    const field = live.players.filter(p => p.pos < 999).map(p => ({ name: p.name, par: parsePar(p.toPar), thru: parseThru(p.thru) }));
    if (field.length < 2 || (ri.round === 1 && !field.some(f => f.thru > 0))) return null;
    const key = (live.fetchedAt ? live.fetchedAt.getTime() : 0) + JSON.stringify(weekOf(w).picks || {});
    if (sweatCache.key === key) return sweatCache.data;

    const rankOf = rankFn();
    const SIMS = 400, wins = {};
    for (let i = 0; i < SIMS; i++) {
      const sim = field.map(f => {
        const left = Math.max(0, (4 - ri.round) * 18 + (18 - f.thru));
        return { name: f.name, score: f.par + gauss() * 0.66 * Math.sqrt(left) + Math.random() * 0.01 };
      }).sort((a, b) => a.score - b.score);
      const pos = {};
      sim.forEach((s, j) => pos[s.name] = j + 1);
      const posOf = (n) => pos[n] || 999;
      const o = outcome(entries, posOf, sim[0].name, sim[1].name, rankOf);
      if (o.winner) wins[o.winner] = (wins[o.winner] || 0) + 1;
    }
    const nowPos = {};
    live.players.forEach(p => nowPos[p.name] = p.pos);
    const ranked = live.players.filter(p => p.pos < 999).sort((a, b) => a.pos - b.pos);
    const now = outcome(entries, (n) => nowPos[n] || 999, ranked[0] && ranked[0].name, ranked[1] && ranked[1].name, rankOf);
    const odds = MEMBERS.map(m => ({ m, pct: Math.round(100 * (wins[m] || 0) / SIMS) })).sort((a, b) => b.pct - a.pct);
    const data = { odds, now, round: ri.round };
    sweatCache = { key, data };
    return data;
  }

  // ===================== 6. Bad beat tracking =====================
  // While a tournament is live, remember each pick's best position and who was
  // leading the pool after each round. Saved to the week so everyone sees it.
  function trackBadBeats(w, sw) {
    if (!me || !live.players.length || !live.event || live.event.final) return;
    const d = weekOf(w);
    const peaks = d.peaks || {}, led = d.wasLeading || {};
    const patch = {};
    for (const e of entriesFor(w)) {
      const p = live.players.find(x => x.name === e.name);
      if (p && p.pos < 999 && (!peaks[e.name] || p.pos < peaks[e.name])) (patch.peaks ||= {})[e.name] = p.pos;
    }
    if (sw && sw.now.winner && sw.round >= 2 && (led[sw.now.winner] || 0) < sw.round) {
      (patch.wasLeading ||= {})[sw.now.winner] = sw.round;
    }
    if (Object.keys(patch).length) write("week", w, patch);
  }
  function badBeats(w) {
    const d = weekOf(w);
    const s = d.settle, fin = d.finishes || {};
    if (!s || !s.winner) return [];
    const out = [];
    for (const [m, r] of Object.entries(d.wasLeading || {})) {
      if (m !== s.winner && r >= 3) out.push({ m, text: `${m} was leading the pool after round ${r} and still didn't cash.` });
    }
    for (const e of entriesFor(w)) {
      const peak = (d.peaks || {})[e.name], end = fin[e.name] || 999;
      if (peak && peak <= 5 && end > 20) out.push({ m: e.who, text: `${e.who}'s ${e.name} got to ${ord(peak)} and finished ${ord(end)}.` });
    }
    return out;
  }

  // Add the sweat meter and bad beats to the tournament card on the Draft tab
  const baseTourney = renderTourney;
  renderTourney = function () {
    baseTourney();
    const el = document.getElementById("tourneyCard");
    if (!el) return;
    const w = currentWeek();
    const sw = sweat(w);
    trackBadBeats(w, sw);
    if (sw) {
      const box = document.createElement("div");
      box.style.marginTop = "14px";
      box.innerHTML = `<h2>Sweat meter 😰</h2>
        <p class="hint">Chance to win the week, from ${400} simulated finishes. ${sw.now.winner ? `If it ended now: <b>${sw.now.winner}</b> wins ${money(sw.now.total * (MEMBERS.length - 1))}.` : ""}</p>
        ${sw.odds.map(o => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0">
          <span style="width:62px;font-weight:900">${o.m}</span>
          <div class="bar" style="flex:1"><span style="width:${o.pct}%"></span></div>
          <span style="width:40px;text-align:right;font-weight:900">${o.pct}%</span></div>`).join("")}`;
      el.appendChild(box);
    }
    if (live.event && live.event.final) {
      const beats = badBeats(w);
      if (beats.length) {
        const box = document.createElement("div");
        box.style.marginTop = "14px";
        box.innerHTML = `<h2>Bad beats 😢</h2>${beats.map(b => `<p class="hint" style="margin:4px 0">${b.text}</p>`).join("")}
          <button class="btn small ghost" id="condolenceBtn">Send condolences 💬</button>`;
        el.appendChild(box);
        document.getElementById("condolenceBtn").onclick = () =>
          shareText(`🌭 Bad beat report, week ${wk(w)}: ${beats.map(b => b.text).join(" ")} Thoughts, prayers, and one egg beer. ${appLink()}`);
      }
    }
  };

  // ===================== 3. Draft grades =====================
  const ROASTS = {
    "A":  ["${dawg} as a dawg? Highway robbery. Extra mustard for ${m}.", "Chef's kiss. ${m} drafted like they've seen the future."],
    "A−": ["Solid. ${hot} carries the load and ${dawg} has real upside.", "${m} came to play. Grandma approves."],
    "B+": ["Respectable. Nothing flashy, nothing dumb.", "${hot} is a safe hot dog. Ketchup only, no surprises."],
    "B":  ["Fine. Very fine. Aggressively fine.", "${m} drafted like it was a Tuesday. Which it might be."],
    "C+": ["${dawg}? Brave. Possibly unwell.", "Bold strategy. Let's see if it pays off for ${m}.",
      "${dawg} has egg-beer energy: risky, a little gross, could pay off big."],
    "C−": ["This draft needs relish. And possibly a lesson.", "${m} picked with their eyes closed. Hot dog water.",
      "${m} drafted like they'd just finished an egg beer. Possibly two."],
  };
  const GRADES = ["A", "A−", "B+", "B", "C+", "C−"];
  function draftGrades(w) {
    const picks = weekOf(w).picks || {};
    if (!MEMBERS.every(m => picks[m] && picks[m].hot && picks[m].dawg)) return null;
    const hots = golfers.filter(g => g.hot).map(g => g.name);
    const dawgs = golfers.filter(g => !g.hot).map(g => g.name);
    const idx = (list, n) => { const i = list.indexOf(n); return i < 0 ? list.length : i; };
    const scored = MEMBERS.map(m => {
      const h = idx(hots, picks[m].hot), d = idx(dawgs, picks[m].dawg);
      const score = 0.5 * (1 - Math.min(h, 9) / 9) + 0.5 * (1 - Math.min(d, 49) / 49);
      return { m, hot: picks[m].hot, dawg: picks[m].dawg, score };
    }).sort((a, b) => b.score - a.score);
    return scored.map((s, i) => {
      const g = GRADES[i];
      const line = pickLine(ROASTS[g], w + s.m).replace(/\$\{m\}/g, s.m).replace(/\$\{hot\}/g, s.hot).replace(/\$\{dawg\}/g, s.dawg);
      return { ...s, grade: g, line };
    });
  }
  const baseDraft = renderDraft;
  renderDraft = function () {
    baseDraft();
    const board = document.getElementById("boardCard");
    if (!board) return;
    const w = currentWeek();
    const grades = draftGrades(w);
    if (!grades) return;
    const box = document.createElement("div");
    box.style.marginTop = "14px";
    box.innerHTML = `<h2>Draft grades 📝</h2>
      <p class="hint">Graded on a curve against the rest of this week's draft. No appeals.</p>
      ${grades.map(g => `<div class="rule"><span class="grade">${g.grade}</span>
        <span style="flex:1"><b>${g.m}</b><br><span class="hint" style="margin:0">${g.line}</span></span></div>`).join("")}
      <button class="btn small ghost" id="gradesBtn" style="margin-top:10px">Post grades to the group 💬</button>`;
    board.appendChild(box);
    document.getElementById("gradesBtn").onclick = () =>
      shareText(`🌭 Week ${wk(w)} draft grades:\n${grades.map(g => `${g.grade} ${g.m}: ${g.line}`).join("\n")}\n${appLink()}`);
  };

  // ===================== 1. Trophy card =====================
  function rr(x, X, y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, y); x.arcTo(X + w, y, X + w, y + h, r); x.arcTo(X + w, y + h, X, y + h, r);
    x.arcTo(X, y + h, X, y, r); x.arcTo(X, y, X + w, y, r); x.closePath();
  }
  function drawTrophy(w) {
    const d = weekOf(w), s = d.settle;
    const rankOf = rankFn();
    const picks = (d.picks || {})[s.winner] || {}, fin = d.finishes || {};
    const cand = ["hot", "dawg"].filter(k => picks[k]).map(k => ({ name: picks[k], kind: k, pos: fin[picks[k]] || 999 })).sort((a, b) => a.pos - b.pos);
    const mp = cand[0];
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const x = c.getContext("2d");
    const ink = "#2B1B10", red = "#D92B2B", mustard = "#FFC233", bun = "#E9A24A";
    x.fillStyle = "#FFF6E3"; x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = "#F6E7C8"; for (let y = 140; y < 1350; y += 34) x.fillRect(0, y, 1080, 2);
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? "#FFFFFF" : red; x.fillRect(i * 90, 0, 90, 90); }
    x.fillStyle = ink; x.fillRect(0, 90, 1080, 10);
    // Mascot holding the trophy up
    const cx = 540, top = 170;
    x.lineCap = "round"; x.strokeStyle = ink; x.lineWidth = 14;
    x.beginPath(); x.moveTo(cx - 70, top + 140); x.lineTo(cx - 150, top + 40); x.stroke();
    x.beginPath(); x.moveTo(cx + 70, top + 140); x.lineTo(cx + 150, top + 40); x.stroke();
    x.fillStyle = mustard; x.lineWidth = 8;
    x.beginPath(); x.moveTo(cx - 95, top - 20); x.lineTo(cx + 95, top - 20); x.lineTo(cx + 60, top + 50); x.lineTo(cx - 60, top + 50); x.closePath(); x.fill(); x.stroke();
    x.fillRect(cx - 14, top + 50, 28, 26); x.strokeRect(cx - 14, top + 50, 28, 26);
    rr(x, cx - 80, top + 60, 160, 300, 80); x.fillStyle = red; x.fill(); x.lineWidth = 9; x.stroke();
    x.fillStyle = ink;
    x.beginPath(); x.ellipse(cx - 32, top + 160, 13, 18, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(cx + 32, top + 160, 13, 18, 0, 0, Math.PI * 2); x.fill();
    x.lineWidth = 9; x.beginPath(); x.arc(cx, top + 195, 34, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    rr(x, cx - 210, top + 250, 420, 110, 55); x.fillStyle = bun; x.fill(); x.stroke();
    x.strokeStyle = mustard; x.lineWidth = 16; x.beginPath();
    for (let i = 0; i <= 8; i++) { const px = cx - 180 + i * 45, py = top + 305 + (i % 2 ? -14 : 14); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    // Text
    x.textAlign = "center"; x.fillStyle = ink;
    rr(x, 340, 590, 400, 64, 32); x.fillStyle = "#1E7F7A"; x.fill();
    x.fillStyle = "#FFFFFF"; x.font = "900 34px Avenir Next, Trebuchet MS, sans-serif"; x.fillText(`WEEK ${w} CHAMPION`, 540, 634);
    x.font = "900 150px Rockwell, Georgia, serif";
    x.fillStyle = mustard; x.fillText(s.winner, 548, 824);
    x.fillStyle = "#9E1B1B"; x.fillText(s.winner, 540, 816);
    x.fillStyle = ink; x.font = "900 96px Rockwell, Georgia, serif"; x.fillText(`+${money(potOf(s))}`, 540, 950);
    x.font = "700 40px Avenir Next, Trebuchet MS, sans-serif";
    if (mp) {
      const r = rankOf(mp.name);
      x.fillText(`Money pick: ${mp.name} (${mp.kind === "hot" ? "hot" : "dawg"})`, 540, 1050);
      x.fillText(`${r < 999 ? "World #" + r : "Unranked"} · finished ${ord(mp.pos)}`, 540, 1104);
    }
    const tname = (w === currentWeek() && live.event && live.event.name) ? live.event.name : "";
    if (tname) { x.font = "italic 34px Georgia, serif"; x.fillText(tname, 540, 1170); }
    x.font = "900 40px Avenir Next, Trebuchet MS, sans-serif"; x.fillStyle = red;
    x.fillText("🌭 HOTDAWGS GOLF POOL 🌭", 540, 1290);
    return c;
  }
  function shareTrophy(w) {
    const c = drawTrophy(w);
    const dataUrl = c.toDataURL("image/png");
    const bin = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], `hotdawgs-week-${w}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: `🏆 ${weekOf(w).settle.winner} wins week ${wk(w)} of the Hotdawgs Golf Pool!` }).catch(() => {});
      return;
    }
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<img src="${dataUrl}" alt="Trophy card"><p style="color:#fff;font-weight:800">Press and hold the image to save or share it.</p><button class="btn small ghost">Close</button>`;
    ov.querySelector("button").onclick = () => ov.remove();
    document.body.appendChild(ov);
  }

  // ===================== 4 & 5. Awards and rivalries =====================
  function seasonFacts() {
    const rankOf = rankFn();
    const won = {}, dawgMoney = {}, flow = {}, settled = [];
    MEMBERS.forEach(a => { won[a] = 0; dawgMoney[a] = 0; flow[a] = {}; MEMBERS.forEach(b => flow[a][b] = 0); });
    let longest = null, choke = null;
    const h2h = {}; // h2h["A|B"] = { a: wins for A, b: wins for B }
    for (let w = seasonStart(); w <= currentWeek(); w++) {
      const d = weekOf(w), picks = d.picks || {}, fin = d.finishes || {}, s = d.settle;
      if (Object.keys(fin).length) {
        const bestPos = {};
        MEMBERS.forEach(m => { const p = picks[m] || {}; bestPos[m] = Math.min(fin[p.hot] || 999, fin[p.dawg] || 999); });
        for (let i = 0; i < MEMBERS.length; i++) for (let j = i + 1; j < MEMBERS.length; j++) {
          const A = MEMBERS[i], B = MEMBERS[j];
          if (!picks[A] || !picks[B] || bestPos[A] === bestPos[B]) continue;
          const k = A + "|" + B; h2h[k] ||= { a: 0, b: 0 };
          bestPos[A] < bestPos[B] ? h2h[k].a++ : h2h[k].b++;
        }
        for (const m of MEMBERS) {
          const hot = (picks[m] || {}).hot;
          if (hot && (fin[hot] || 999) >= 999) {
            const r = rankOf(hot);
            if (!choke || r < choke.rank) choke = { m, name: hot, rank: r, w };
          }
        }
      }
      if (!s || !s.winner) continue;
      settled.push({ w, winner: s.winner });
      const per = perPayerOf(s), pot = potOf(s);
      won[s.winner]++;
      MEMBERS.filter(m => m !== s.winner).forEach(p => flow[p][s.winner] += per);
      const wp = picks[s.winner] || {};
      const cand = ["hot", "dawg"].filter(k => wp[k]).map(k => ({ name: wp[k], kind: k, pos: fin[wp[k]] || 999 })).sort((a, b) => a.pos - b.pos);
      if (cand[0]) {
        if (cand[0].kind === "dawg") dawgMoney[s.winner] += pot;
        const r = rankOf(cand[0].name);
        if (!longest || r > longest.rank) longest = { m: s.winner, name: cand[0].name, rank: r, w, pot };
      }
    }
    // Longest dry spell: most settled weeks in a row without a win
    const dry = {};
    MEMBERS.forEach(m => { let run = 0, best = 0; settled.forEach(x => { run = x.winner === m ? 0 : run + 1; best = Math.max(best, run); }); dry[m] = best; });
    // Biggest one-way balance between two members
    let shooter = null;
    for (const a of MEMBERS) for (const b of MEMBERS) {
      if (a === b) continue;
      const net = flow[a][b] - flow[b][a];
      if (net > 0 && (!shooter || net > shooter.net)) shooter = { payer: a, to: b, net };
    }
    const top = (obj) => { const e = Object.entries(obj).sort((x, y) => y[1] - x[1])[0]; return e && e[1] > 0 ? e : null; };
    return { won: top(won), dawg: top(dawgMoney), dry: top(dry), shooter, longest, choke, h2h, flow, settled };
  }

  window.HD = Object.assign(window.HD || {}, { sweat, seasonFacts, potOf, shareText });

  // ===================== 7. Ketchup Cam =====================
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 640, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  function camWinner(w) {
    const votes = weekOf(-w).votes || {};
    const count = {};
    Object.values(votes).forEach(m => count[m] = (count[m] || 0) + 1);
    const e = Object.entries(count).sort((a, b) => b[1] - a[1]);
    return e.length ? { m: e[0][0], votes: e[0][1], tie: e[1] && e[1][1] === e[0][1] } : null;
  }

  // ===================== Clubhouse tab =====================
  function renderClubhouse() {
    const wrap = document.getElementById("clubWrap");
    if (wrap.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
    const w = currentWeek();
    const f = seasonFacts();
    const photos = weekOf(-w).photos || {};
    const myVote = (weekOf(-w).votes || {})[me];
    const lastCam = w > 1 ? camWinner(w - 1) : null;
    // net > 0 means nameA has come out ahead of nameB in money
    const pairs = Object.entries(f.h2h).map(([k, v]) => {
      const [nameA, nameB] = k.split("|");
      return { nameA, nameB, aWins: v.a, bWins: v.b, net: f.flow[nameB][nameA] - f.flow[nameA][nameB] };
    }).sort((x, y) => (y.aWins + y.bWins) - (x.aWins + x.bWins) || Math.abs(y.net) - Math.abs(x.net));
    const mineFirst = pairs.filter(p => p.nameA === me || p.nameB === me).concat(pairs.filter(p => p.nameA !== me && p.nameB !== me));

    wrap.innerHTML = `
      <div class="card">
        <h2>Trophy room 🏆</h2>
        ${f.settled.length ? f.settled.slice().reverse().map(x => `
          <div class="rule">
            <span style="flex:1"><b>Week ${wk(x.w)}</b> · ${x.winner} won ${money(potOf(weekOf(x.w).settle))}</span>
            <button class="btn small" data-trophy="${x.w}">Trophy card</button>
          </div>`).join("") : `<p class="hint">No champions yet. The first settled week gets a trophy card to share.</p>`}
      </div>

      <div class="card">
        <h2>Season awards</h2>
        <div class="award"><span class="ico">🔥</span><div><b>Hot hand</b><span class="hint" style="margin:0">${f.won ? `${f.won[0]}, ${f.won[1]} win${f.won[1] === 1 ? "" : "s"}` : "Up for grabs"}</span></div></div>
        <div class="award"><span class="ico">🐶</span><div><b>Dawg whisperer</b><span class="hint" style="margin:0">${f.dawg ? `${f.dawg[0]}, ${money(f.dawg[1])} won on dawg picks` : "No dawg has cashed yet"}</span></div></div>
        <div class="award"><span class="ico">🎯</span><div><b>Longest shot cashed</b><span class="hint" style="margin:0">${f.longest ? `${f.longest.m} with ${f.longest.name} (${f.longest.rank < 999 ? "World #" + f.longest.rank : "unranked"}), week ${wk(f.longest.w)}` : "Nobody yet"}</span></div></div>
        <div class="award"><span class="ico">💸</span><div><b>The Shooter award</b><span class="hint" style="margin:0">${f.shooter ? `${f.shooter.payer} is down ${money(f.shooter.net)} to ${f.shooter.to}` : "Everyone's even. For now."}</span></div></div>
        <div class="award"><span class="ico">🥶</span><div><b>Ice cold</b><span class="hint" style="margin:0">${f.dry ? `${f.dry[0]}, ${f.dry[1]} straight week${f.dry[1] === 1 ? "" : "s"} without a win` : "Nobody's cold yet"}</span></div></div>
        <div class="award"><span class="ico">🧂</span><div><b>Biggest choke</b><span class="hint" style="margin:0">${f.choke ? `${f.choke.m}'s ${f.choke.name} (${f.choke.rank < 999 ? "World #" + f.choke.rank : "unranked"}) missed the cut, week ${wk(f.choke.w)}` : "No hots have missed the cut yet"}</span></div></div>
        <button class="btn small ghost" id="awardsBtn" style="margin-top:10px">Post awards to the group 💬</button>
      </div>

      <div class="card">
        <h2>Rivalries ⚔️</h2>
        <p class="hint">Head-to-head: whose best pick finished higher each week. Money is the net between the two.</p>
        ${mineFirst.length ? mineFirst.map(p => {
          const lead = p.aWins === p.bWins ? "Even" : (p.aWins > p.bWins ? `${p.nameA} leads` : `${p.nameB} leads`);
          const moneyLine = p.net === 0 ? "even money" : `${p.net > 0 ? p.nameA : p.nameB} up ${money(Math.abs(p.net))}`;
          return `<div class="rule">
            <span style="flex:1"><b>${p.nameA}</b> vs <b>${p.nameB}</b><br><span class="hint" style="margin:0">${lead} · ${moneyLine}</span></span>
            <span class="amt">${p.aWins}–${p.bWins}</span>
          </div>`;
        }).join("") : `<p class="hint">Rivalries start once a week has finishes entered.</p>`}
      </div>

      <div class="card">
        <h2>Ketchup Cam 📸</h2>
        <p class="hint">Post your hot dog setup for week ${wk(w)}. Everyone votes, and the best dog wins bragging rights.${lastCam ? ` Last week's champ: <b>${lastCam.m}</b>${lastCam.tie ? " (tie)" : ""}.` : ""}</p>
        ${me ? `<label class="btn" style="display:block;cursor:pointer">${photos[me] ? "Replace my photo" : "Add my hot dog photo"} 🌭
          <input type="file" accept="image/*" id="camIn" style="display:none"></label>` : `<p class="hint">Pick your name on the Me tab first.</p>`}
        <div class="photos" style="margin-top:12px">
          ${Object.entries(photos).map(([m, src]) => `
            <div class="photo"><img src="${src}" alt="${m}'s hot dog">
              <div class="cap"><span>${m}</span>
                ${me && m !== me ? `<button class="btn small ${myVote === m ? "green" : "ghost"}" data-vote="${m}">${myVote === m ? "Voted ✓" : "Vote"}</button>` : ""}
              </div></div>`).join("")}
        </div>
        ${!Object.keys(photos).length ? `<p class="hint" style="margin-top:8px">No photos yet this week.</p>` : ""}
      </div>`;

    wrap.querySelectorAll("[data-trophy]").forEach(b => b.onclick = () => shareTrophy(Number(b.dataset.trophy)));
    document.getElementById("awardsBtn").onclick = () => shareText(
      `🌭 Hotdawgs season awards:\n🔥 Hot hand: ${f.won ? f.won[0] : "TBD"}\n🐶 Dawg whisperer: ${f.dawg ? f.dawg[0] : "TBD"}\n💸 Shooter award: ${f.shooter ? `${f.shooter.payer} (down ${money(f.shooter.net)} to ${f.shooter.to})` : "TBD"}\n🥶 Ice cold: ${f.dry ? f.dry[0] : "TBD"}\n${appLink()}`);
    wrap.querySelectorAll("[data-vote]").forEach(b => b.onclick = () => write("week", -w, { votes: { [me]: b.dataset.vote } }));
    const cam = document.getElementById("camIn");
    if (cam) cam.onchange = async () => {
      const file = cam.files && cam.files[0];
      if (!file) return;
      toast("Uploading your dog…");
      try {
        const src = await compressPhoto(file);
        await write("week", -w, { photos: { [me]: src }, photoTimes: { [me]: Date.now() } });
        toast("Photo posted 📸");
      } catch (e) { toast("Couldn't read that photo. Try another."); }
    };
  }

  // Draw the Clubhouse whenever the app redraws and it's the open tab
  const baseRender = renderActive;
  renderActive = function () {
    baseRender();
    const active = document.querySelector("section.active");
    if (active && active.id === "clubhouse") renderClubhouse();
  };
  try { renderActive(); } catch (e) {}
})();


/* ===== history.js ===== */
;// Hotdawgs form guide: each golfer's recent finishes, their history at this
// week's event, and last week's leaderboard, shown while drafting.
// Built from ESPN's scoreboard feed by asking for past tournament dates.
// Past results are cached on the phone, so each old tournament downloads once.
// Load after extras.js (before or after tips.js is fine).

(function () {
  const RECENT = 4;  // tournaments of recent form
  const YEARS = 3;   // years of history at this event

  const style = document.createElement("style");
  style.textContent = `
    .hd-form { font-size: 11px !important; opacity: .85 !important; margin-top: 2px; line-height: 1.35; }
    .hd-form b { font-weight: 900; }
    .hd-good { color: var(--green); font-weight: 900; }
    .hd-bad { color: var(--red); font-weight: 900; }
    .hd-chip { display: inline-block; padding: 0 5px; border-radius: 6px; background: var(--cream); border: 1px solid var(--bun); margin-right: 3px; }
  `;
  document.head.appendChild(style);

  // ----- Fetch and cache one tournament's final leaderboard by date -----
  const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem("hd-hist2-" + k)); } catch (e) { return null; } };
  const cacheSet = (k, v) => { try { localStorage.setItem("hd-hist2-" + k, JSON.stringify(v)); } catch (e) {} };
  try { Object.keys(localStorage).filter(k => k.startsWith("hd-hist-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; };

  function parseEvent(data) {
    const b = parseScoreboard(data);
    if (!b.event) return null;
    return { name: b.event.name, start: b.event.start, venue: b.event.where, done: b.event.final, players: b.players };
  }

  async function eventOn(date) {
    const key = ymd(date);
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
      const r = await fetch(`${LIVE_URL}?dates=${key}`, { cache: "no-store" });
      if (!r.ok) return null;
      const e = parseEvent(await r.json());
      if (e && e.done && e.players.length) cacheSet(key, e); // only cache finished events
      return e;
    } catch (err) { return null; }
  }

  // ----- Is a past event the same tournament as this week's? -----
  const GENERIC = new Set(["the", "championship", "open", "classic", "invitational", "tournament", "presented", "golf",
    "club", "national", "pro", "am", "challenge", "memorial", "players", "masters", "cup", "series", "world"]);
  const words = (s) => norm(s).split(" ").filter(w => w.length >= 4 && !GENERIC.has(w));
  function sameEvent(a, b) {
    if (!a || !b) return false;
    if (a.venue && b.venue) return norm(a.venue) === norm(b.venue);
    const wa = new Set(words(a.name));
    return words(b.name).some(w => wa.has(w)) || norm(a.name) === norm(b.name);
  }

  // ----- Build the form guide for this week -----
  let guide = { state: "idle", forKey: "", recent: [], course: [], lastWeek: null, byName: new Map() };

  async function buildGuide(cur) {
    const forKey = cur.name + cur.start;
    if (guide.forKey === forKey && guide.state !== "error") return;
    guide = { state: "loading", forKey, recent: [], course: [], lastWeek: null, byName: new Map() };

    // Recent tournaments: the last few schedule events that ended before this one
    const past = (live.calendar || []).filter(e => e.start && e.end && e.end < cur.start).sort((a, b) => b.start.localeCompare(a.start)).slice(0, RECENT);
    const recent = [];
    for (const e of past) {
      const ev = await eventOn(addDays(e.start, 1));
      if (ev && ev.players.length && ev.start !== cur.start) recent.push({ ...ev, label: e.name });
    }

    // This event in past years: same week last year, then a week either side
    const course = [];
    for (let y = 1; y <= YEARS; y++) {
      for (const shift of [0, 7, -7]) {
        const ev = await eventOn(addDays(cur.start, -364 * y + shift + 1));
        if (ev && ev.players.length && sameEvent(cur, ev)) { course.push({ ...ev, year: ev.start.slice(0, 4) }); break; }
      }
    }

    // Index by golfer
    const byName = new Map();
    const slot = (n) => { const k = nameKey(n); if (!byName.has(k)) byName.set(k, { recent: [], course: [] }); return byName.get(k); };
    recent.forEach((ev, i) => ev.players.forEach(p => { slot(p.name).recent[i] = p; }));
    course.forEach((ev, i) => ev.players.forEach(p => { slot(p.name).course[i] = p; }));

    guide = { state: recent.length || course.length ? "ready" : "error", forKey, recent, course, lastWeek: recent[0] || null, byName };
    renderActive();
  }

  // Start (or refresh) the guide once ESPN has told us this week's event
  setInterval(() => {
    const cur = live.event;
    if (!cur || !cur.start || !live.calendar.length) return;
    if (guide.state === "loading") return;
    if (guide.forKey !== cur.name + cur.start) buildGuide(cur);
  }, 1500);

  // ----- Helpers for display -----
  const cls = (p) => !p ? "" : p.pos <= 10 ? "hd-good" : p.pos >= 999 ? "hd-bad" : "";
  const cell = (p) => p ? `<span class="${cls(p)}">${p.posText}</span>` : `<span style="opacity:.5">—</span>`;
  const yy = (y) => "'" + String(y).slice(2);

  function formLine(name) {
    if (guide.state !== "ready") return "";
    const h = guide.byName.get(nameKey(name));
    const parts = [];
    if (guide.recent.length) {
      const r = guide.recent.map((_, i) => cell(h && h.recent[i])).join(" · ");
      parts.push(`<b>Form</b> ${r}`);
    }
    if (guide.course.length) {
      const c = guide.course.map((ev, i) => `${yy(ev.year)} ${cell(h && h.course[i])}`).join(" · ");
      parts.push(`<b>Here</b> ${c}`);
    }
    return parts.join("<br>");
  }

  function lastWeekCard() {
    const lw = guide.lastWeek;
    if (!lw) return "";
    const pw = weekOf(currentWeek() - 1).picks || {};
    const owner = {};
    Object.entries(pw).forEach(([m, p]) => { if (p.hot) owner[nameKey(p.hot)] = m; if (p.dawg) owner[nameKey(p.dawg)] = m; });
    const top = lw.players.filter(p => p.pos < 999).slice(0, 10);
    return `<details style="margin-top:12px"><summary style="font-weight:900;cursor:pointer">Last week: ${lw.label || lw.name} ▾</summary>
      ${top.map(p => `<div class="rule"><span style="width:34px;font-weight:900">${p.posText}</span>
        <span style="flex:1">${p.name}${owner[nameKey(p.name)] ? ` <span class="hint" style="margin:0">(${owner[nameKey(p.name)]})</span>` : ""}</span></div>`).join("")}
    </details>`;
  }

  function guideHeader() {
    if (guide.state === "loading") return `<p class="hint">Loading form guide… 📈</p>`;
    if (guide.state === "error") return `<p class="hint">Form guide unavailable right now.</p>`;
    if (guide.state !== "ready") return "";
    const recentNames = guide.recent.map(e => e.label || e.name).join(", ");
    const years = guide.course.map(e => e.year).join(", ");
    return `<p class="hint" style="margin-top:6px"><b>Form</b> = last ${guide.recent.length} events, newest first (${recentNames}).
      ${guide.course.length ? `<b>Here</b> = this event in ${years}.` : "No past results found for this event."}
      <span class="hd-good">Green</span> is a top 10, <span class="hd-bad">red</span> is a missed cut.</p>`;
  }

  // ----- Add the form guide to the draft screen -----
  const baseDraft = renderDraft;
  renderDraft = function () {
    baseDraft();
    const list = document.getElementById("golferList");
    if (!list || list.hidden) return;
    // Legend and last week's top 10 at the top of the golfer list
    const head = document.createElement("div");
    head.innerHTML = guideHeader() + lastWeekCard();
    list.insertBefore(head, list.firstChild);
    // Form line under each golfer
    list.querySelectorAll(".golfer").forEach(row => {
      const nameEl = row.querySelector(":scope > div > div"); // the name, so the form line sits under it
      if (!nameEl) return;
      const line = formLine(nameEl.textContent.trim());
      if (!line) return;
      const info = nameEl.parentElement;
      if (!info.querySelector(".hd-form")) info.insertAdjacentHTML("beforeend", `<div class="rank hd-form">${line}</div>`);
    });
  };

  // Show the same form line on the Ranks tab's field view
  const baseRankings = renderRankings;
  renderRankings = function () {
    baseRankings();
    if (guide.state !== "ready") return;
    document.querySelectorAll("#rankingsWrap .golfer").forEach(row => {
      const nameEl = row.querySelector("div > div");
      if (!nameEl) return;
      const line = formLine(nameEl.textContent.trim());
      if (line && !nameEl.parentElement.querySelector(".hd-form")) nameEl.parentElement.insertAdjacentHTML("beforeend", `<div class="rank hd-form">${line}</div>`);
    });
  };
})();


/* ===== home.js ===== */
;// Hotdawgs Home: a personal dashboard plus a 5-tab bottom bar.
// Tabs: Home, Draft, Live (Scores / Schedule / Ranks), Money (Payments / Payouts / Stats), Clubhouse.
// Your settings move to the avatar in the top-right corner.
// Load after history.js and before tips.js.

(function () {
  // ===================== Styles =====================
  const style = document.createElement("style");
  style.textContent = `
    nav { display: none !important; }
    body { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
    header { position: relative; }
    .hd-avatar { position: absolute; right: 0; top: 12px; width: 44px; height: 44px; border-radius: 50%;
      border: 3px solid var(--shadow); background: var(--mustard); font: inherit; font-weight: 900; font-size: 18px;
      color: var(--ink); box-shadow: 2px 2px 0 var(--shadow); cursor: pointer; }
    .hd-avatar.on { background: var(--red); color: #fff; }

    .hd-tabbar { position: fixed; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 60;
      display: flex; background: var(--paper); border: 3px solid var(--shadow); border-radius: 22px;
      box-shadow: 0 5px 0 var(--shadow); padding: 5px; max-width: 520px; margin: 0 auto; }
    .hd-tabbar button { flex: 1; border: 0; background: transparent; font: inherit; color: var(--ink);
      display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 2px; border-radius: 16px; cursor: pointer; position: relative; }
    .hd-tabbar .ico { font-size: 21px; line-height: 1; transition: transform .2s; }
    .hd-tabbar .lbl { font-size: 11px; font-weight: 900; }
    .hd-tabbar button.on { background: var(--red); color: #fff; }
    .hd-tabbar button.on .ico { transform: translateY(-2px) scale(1.12); }
    .hd-tabbar .hd-badge { position: absolute; top: 0; right: 4px; margin: 0; }
    .hd-tabbar .dot { position: absolute; top: 4px; right: 18%; width: 10px; height: 10px; border-radius: 50%;
      background: var(--mustard); border: 2px solid var(--shadow); animation: hdDot 1.2s ease-in-out infinite; }
    @keyframes hdDot { 50% { transform: scale(1.3); } }
    .hd-coachbtn { bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
    .toast { bottom: calc(100px + env(safe-area-inset-bottom, 0px)) !important; }

    .hd-sub { display: flex; gap: 8px; margin: 12px 0 14px; }
    .hd-sub button { flex: 1; padding: 9px; border-radius: 999px; font: inherit; font-weight: 900; font-size: 13px;
      background: var(--cream); border: 2px solid var(--shadow); color: var(--ink); box-shadow: 2px 2px 0 var(--shadow); cursor: pointer; }
    .hd-sub button.on { background: var(--mustard); }

    .hd-hello { margin: 4px 0 14px; }
    .hd-hello .hi { font-family: "Rockwell", Georgia, serif; font-size: 24px; font-weight: 900; color: var(--red-dark); }
    .hd-hello .coachline { font-size: 13px; opacity: .85; margin-top: 2px; }
    .hd-hero { border-width: 4px; animation: hdHero .5s cubic-bezier(.3,1.5,.5,1); }
    @keyframes hdHero { from { transform: translateY(14px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
    .hd-hero.hot { background: var(--red); color: #fff; }
    .hd-hero.hot h2, .hd-hero.hot .hint { color: #fff; opacity: 1; }
    .hd-hero.gold { background: var(--mustard); }
    .hd-kicker { font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
    .hd-headline { font-family: "Rockwell", Georgia, serif; font-size: 26px; font-weight: 900; line-height: 1.1; margin: 4px 0 6px; }
    .hd-pickrow { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,.85); color: var(--ink);
      border: 2px solid var(--shadow); border-radius: 12px; padding: 10px; margin-top: 8px; }
    .hd-pickrow .pos { font-family: "Rockwell", Georgia, serif; font-size: 22px; font-weight: 900; min-width: 48px; text-align: center; }
    .hd-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .hd-strip .cell { background: var(--cream); border: 2px solid var(--shadow); border-radius: 12px; padding: 10px 6px; text-align: center; }
    .hd-strip b { display: block; font-family: "Rockwell", Georgia, serif; font-size: 20px; }
    .hd-strip span { font-size: 11px; opacity: .75; font-weight: 800; }
    .hd-quick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .hd-quick button { padding: 14px 8px; border-radius: 14px; border: 2px solid var(--shadow); background: var(--cream);
      font: inherit; font-weight: 900; font-size: 14px; color: var(--ink); box-shadow: 2px 2px 0 var(--shadow); cursor: pointer; }
    .hd-quick button .e { display: block; font-size: 24px; margin-bottom: 2px; }
    .hd-cam-main { position: relative; border: 3px solid var(--shadow); border-radius: 14px; overflow: hidden; cursor: pointer; }
    .hd-cam-main img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .hd-cam-main .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 12px 10px; color: #fff; font-weight: 900;
      background: linear-gradient(transparent, rgba(43,27,16,.85)); display: flex; justify-content: space-between; align-items: flex-end; }
    .hd-cam-row { display: flex; gap: 8px; margin-top: 8px; overflow-x: auto; }
    .hd-cam-thumb { position: relative; flex: none; width: 74px; border: 2px solid var(--shadow); border-radius: 10px; overflow: hidden; cursor: pointer; background: var(--cream); }
    .hd-cam-thumb img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
    .hd-cam-thumb span { display: block; font-size: 11px; font-weight: 900; text-align: center; padding: 2px; }
    .hd-new { position: absolute; top: 6px; left: 6px; background: var(--mustard); color: var(--ink); border: 2px solid var(--shadow);
      border-radius: 999px; font-size: 10px; font-weight: 900; padding: 1px 6px; animation: hdBadgePop 1.4s ease-in-out infinite; }
    @keyframes hdBadgePop { 50% { transform: scale(1.15) rotate(-6deg); } }
    .hd-cam-pop { animation: hdCamPop .6s cubic-bezier(.3,1.6,.5,1); }
    @keyframes hdCamPop { from { transform: scale(.85) rotate(-2deg); opacity: 0; } to { transform: none; opacity: 1; } }
  `;
  document.head.appendChild(style);

  // ===================== Sections =====================
  const appArea = document.getElementById("appArea");
  const firstSection = document.getElementById("draft");
  const home = document.createElement("section");
  home.id = "home";
  home.innerHTML = `<div id="homeWrap"></div>`;
  firstSection.before(home);

  // Live scores get their own section, pulled out of the Draft tab
  const scores = document.createElement("section");
  scores.id = "scores";
  firstSection.after(scores);
  scores.appendChild(document.getElementById("tourneyCard"));

  // Sub-tab strip shown above grouped sections
  const sub = document.createElement("div");
  sub.className = "hd-sub";
  sub.hidden = true;
  home.before(sub);

  // Hidden old-nav buttons so other features can still switch tabs by name
  const oldNav = document.querySelector("nav");
  ["home", "scores"].forEach(id => {
    const b = document.createElement("button");
    b.dataset.tab = id;
    b.onclick = () => { goToTab(id); renderActive(); };
    oldNav.appendChild(b);
  });

  // ===================== Bottom bar and routing =====================
  const TABS = [
    { id: "home", ico: "🏠", lbl: "Home", subs: ["home"] },
    { id: "draft", ico: "🌭", lbl: "Draft", subs: ["draft"] },
    { id: "live", ico: "⛳", lbl: "Live", subs: ["scores", "schedule", "rankings"] },
    { id: "money", ico: "💰", lbl: "Money", subs: ["payments", "payouts", "stats"] },
    { id: "clubhouse", ico: "🏆", lbl: "Clubhouse", subs: ["clubhouse"] }
  ];
  const SUB_LABELS = { scores: "Scores", schedule: "Schedule", rankings: "Ranks", payments: "Payments", payouts: "Payouts", stats: "Stats" };
  const lastSub = { live: "scores", money: "payments" };

  const bar = document.createElement("div");
  bar.className = "hd-tabbar";
  bar.innerHTML = TABS.map(t => `<button data-tab="${t.id}"><span class="ico">${t.ico}</span><span class="lbl">${t.lbl}</span></button>`).join("");
  document.body.appendChild(bar);

  const avatar = document.createElement("button");
  avatar.className = "hd-avatar";
  avatar.setAttribute("aria-label", "Your settings");
  document.querySelector("#appArea header").appendChild(avatar);
  avatar.onclick = () => show("settings");

  // Switch to a section by its id, using the original tab buttons so each
  // section's own loading still happens
  function show(id) {
    const old = oldNav.querySelector(`[data-tab="${id}"]`);
    if (old) old.click(); else { goToTab(id); renderActive(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    const t = TABS.find(x => x.id === b.dataset.tab);
    b.animate([{ transform: "scale(1)" }, { transform: "scale(.88)" }, { transform: "scale(1)" }], { duration: 220 });
    show(t.subs.length > 1 ? lastSub[t.id] : t.subs[0]);
  });
  sub.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sub]");
    if (b) show(b.dataset.sub);
  });

  // Keep the bar, sub-tabs and avatar in step with whatever section is open
  function syncChrome() {
    const active = document.querySelector("section.active");
    const id = active ? active.id : "home";
    const tab = TABS.find(t => t.subs.includes(id));
    bar.querySelectorAll("button[data-tab]").forEach(b => b.classList.toggle("on", !!tab && b.dataset.tab === tab.id));
    avatar.classList.toggle("on", id === "settings");
    avatar.textContent = me ? initial(me) : "?";
    if (tab && tab.subs.length > 1) {
      lastSub[tab.id] = id;
      sub.hidden = false;
      sub.innerHTML = tab.subs.map(s => `<button data-sub="${s}" class="${s === id ? "on" : ""}">${SUB_LABELS[s]}</button>`).join("");
    } else {
      sub.hidden = true;
    }
    // A pulsing dot on Draft when it's your turn, and on Money when you owe
    const w = currentWeek();
    const st = HD.draftState ? HD.draftState(w) : null;
    const d = weekOf(w), s = d.settle;
    const pill = document.getElementById("subline");
    if (pill) pill.textContent = `Week ${wk(w)} · ` + (s && s.winner ? `${s.winner} won the week`
      : st && !st.complete ? `Draft · pick ${st.clock + 1} of ${st.total}`
      : live.event && live.event.final ? "Final · settle up"
      : live.event && live.event.status ? live.event.status : "Picks locked");
    const owe = !!(s && s.winner && me && s.winner !== me && !(d.paid || {})[me]);
    dot("draft", !!(st && st.onClock === me) && id !== "draft");
    dot("money", owe && !["payments", "payouts", "stats"].includes(id));
    dot("home", id !== "home" && unseen(w).length > 0);
  }
  function dot(tab, on) {
    const b = bar.querySelector(`[data-tab="${tab}"]`);
    const has = b.querySelector(".dot");
    if (on && !has) b.insertAdjacentHTML("beforeend", `<span class="dot"></span>`);
    if (!on && has) has.remove();
  }

  // ===================== Home dashboard =====================
  const COACH_LINES = [
    "Relish the moment, kid. Then check the rankings.",
    "Keep your head down and your bun up.",
    "Mustard up. Nobody ever won a pool playing scared.",
    "Grandma's watching. Draft accordingly.",
    "A dawg in the hand beats two hots in the bush.",
    "Pay your Venmo on time. Shooter never did.",
    "Find your happy place. Then find a sleeper.",
    "Forty years of coaching taught me one thing: long shots win pools.",
    "Winners buy the egg beers. Losers drink them faster.",
    "An egg beer won't fix your swing. It will fix your Sunday."
  ];
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening"; };
  const dayLine = () => COACH_LINES[Math.floor(Date.now() / 86400000) % COACH_LINES.length];
  const shortName = (n) => (n || "").replace(/\s+(pres\.? by|presented by)\s+.*$/i, "");
  const money$ = (n) => (n < 0 ? "−" : n > 0 ? "+" : "") + "$" + Math.abs(n);

  function heroCard(w) {
    const d = weekOf(w), s = d.settle;
    const st = HD.draftState ? HD.draftState(w) : null;
    const mine = (d.picks || {})[me] || {};
    const t = currentTourney();

    // 1. Results are in
    if (s && s.winner) {
      const pot = HD.potOf(s), per = pot / (MEMBERS.length - 1);
      if (s.winner === me) {
        const paidCount = MEMBERS.filter(m => m !== me && (d.paid || {})[m]).length;
        return { cls: "gold", html: `<div class="hd-kicker">Week ${wk(w)} results</div>
          <div class="hd-headline">You won ${money(pot)}! 🏆</div>
          <p class="hint" style="margin:0">${paidCount} of ${MEMBERS.length - 1} have paid you.</p>
          <button class="btn" data-go="clubhouse">Make your trophy card</button>` };
      }
      if (!(d.paid || {})[me]) {
        const handle = (config.venmo || {})[s.winner];
        return { cls: "hot", html: `<div class="hd-kicker">Week ${wk(w)} results</div>
          <div class="hd-headline">You owe ${s.winner} ${money(per)}</div>
          <p class="hint" style="margin:0">${s.winner} won ${money(pot)}. Settle up and stay off Shooter's list.</p>
          ${handle ? `<a class="btn" style="background:#fff;color:var(--ink)" href="${venmoLink(handle, per, `Hotdawgs Week ${wk(w)}`)}">Pay on Venmo</a>` : `<p class="hint">${s.winner} hasn't added a Venmo name yet.</p>`}
          <button class="btn ghost" data-paid="1">I paid ✓</button>` };
      }
      return { cls: "", html: `<div class="hd-kicker">Week ${wk(w)} results</div>
        <div class="hd-headline">${s.winner} took the week</div>
        <p class="hint" style="margin:0">You're paid up. Clean hands, clear conscience. Next week's draft opens soon.</p>` };
    }

    // 2. Tournament over, waiting on the payout
    if (live.event && live.event.final && st && st.complete) {
      return { cls: "gold", html: `<div class="hd-kicker">${t ? shortName(t.name) : "Tournament"} is final</div>
        <div class="hd-headline">🏁 Who's getting paid?</div>
        <p class="hint" style="margin:0">Crunching the payouts now. Check the Money tab in a minute.</p>
        <button class="btn" data-go="payments">See the Money tab</button>` };
    }

    // 3. Draft still going
    if (st && !st.complete && HD.draftOpen && !HD.draftOpen(w)) {
      const first = st.board[0].m;
      return { cls: "", html: `<div class="hd-kicker">Week ${wk(w)} draft${t ? ` · ${shortName(t.name)}` : ""}</div>
        <div class="hd-headline">🔒 Draft opens when the field posts</div>
        <p class="hint" style="margin:0">${first === me ? "You pick first this week. Start starring golfers in your queue." : `${first} picks first. Star golfers now so you're ready.`}</p>
        <button class="btn ghost" data-go="draft">Build my queue</button>` };
    }
    if (st && !st.complete) {
      const cl = HD.clockLine ? HD.clockLine(w, st) : "";
      if (st.onClock === me) {
        const need = !mine.hot && !mine.dawg ? "hot or dawg" : (!mine.hot ? "hot" : "dawg");
        return { cls: "hot", html: `<div class="hd-kicker">Week ${wk(w)} draft · pick ${st.clock + 1} of ${st.total}</div>
          <div class="hd-headline">You're on the clock! 🌭</div>
          <p class="hint" style="margin:0">Time to draft your ${need}${t ? ` for the ${shortName(t.name)}` : ""}.${cl ? `<br><b>${cl}</b>` : ""}</p>
          <button class="btn" style="background:#fff;color:var(--ink)" data-go="draft">Draft now</button>` };
      }
      const myNext = st.board.findIndex((x, i) => i >= st.clock && x.m === me && !x.done);
      const away = myNext < 0 ? null : myNext - st.clock;
      return { cls: "", html: `<div class="hd-kicker">Week ${wk(w)} draft · pick ${st.clock + 1} of ${st.total}</div>
        <div class="hd-headline">${st.onClock} is on the clock</div>
        <p class="hint" style="margin:0">${away === null ? "Your picks are in. Sit back and heckle." : away === 1 ? "You're up next. Stretch those fingers." : `You pick in ${away} turns.`}${cl ? `<br>${cl}` : ""}</p>
        <button class="btn ghost" data-nudge="${st.onClock}">Nudge ${st.onClock} 💬</button>` };
    }

    // 4. Draft done: show your two golfers live
    const row = (name, kind) => {
      if (!name) return "";
      const p = livePlayer(name);
      return `<div class="hd-pickrow"><span class="pos">${p ? p.posText : "—"}</span>
        <span style="flex:1"><b>${name}</b><br><span class="hint" style="margin:0">${kind === "hot" ? "🔥 Hot" : "🐶 Dawg"}${p && p.toPar ? ` · ${p.toPar}${p.thru ? " · thru " + p.thru : ""}` : ""}</span></span></div>`;
    };
    const sw = HD.sweat ? HD.sweat(w) : null;
    const myOdds = sw ? (sw.odds.find(o => o.m === me) || { pct: 0 }).pct : null;
    const started = live.players.some(p => p.toPar && p.toPar !== "E" && p.toPar !== "");
    return { cls: myOdds !== null && myOdds >= 40 ? "gold" : "", html: `<div class="hd-kicker">${t ? shortName(t.name) : `Week ${wk(w)}`}${t && t.status ? " · " + t.status : ""}</div>
      <div class="hd-headline">${myOdds !== null ? `${myOdds}% to win the week ${myOdds >= 40 ? "😎" : myOdds >= 15 ? "😰" : "🥶"}` : started ? "Your picks are live" : "Picks locked. Now we wait."}</div>
      ${sw && sw.now.winner ? `<p class="hint" style="margin:0">If it ended now: <b>${sw.now.winner === me ? "you" : sw.now.winner}</b> ${sw.now.winner === me ? "win" : "wins"} ${money(sw.now.total * (MEMBERS.length - 1))}.</p>` : ""}
      ${row(mine.hot, "hot")}${row(mine.dawg, "dawg")}
      <button class="btn ghost" data-go="scores">Full leaderboard</button>` };
  }

  function renderHome() {
    const wrap = document.getElementById("homeWrap");
    if (!me) {
      wrap.innerHTML = `<div class="card hd-hero"><div class="hd-headline">Welcome to the pool 🌭</div>
        <p class="hint">Pick your name to get started.</p>
        <div class="chips">${MEMBERS.map(m => `<button class="chip" data-me="${m}">${m}</button>`).join("")}</div></div>`;
      wrap.querySelectorAll("[data-me]").forEach(b => b.onclick = () => {
        me = b.dataset.me;
        try { localStorage.setItem("hotdawgs-me", me); } catch (e) {}
        renderActive();
      });
      return;
    }
    const w = currentWeek();
    const hero = heroCard(w);
    const season = HD.seasonData ? HD.seasonData() : null;
    const myStats = season && season.stats[me];
    const board = season ? Object.values(season.stats).sort((a, b) => b.net - a.net) : [];
    const anySettled = season && Object.values(season.stats).some(s => s.wins > 0);
    const place = anySettled && myStats ? 1 + board.filter(s => s.net > myStats.net).length : 0;
    const tied = place && board.filter(s => s.net === myStats.net).length > 1;
    const facts = HD.seasonFacts ? HD.seasonFacts() : null;

    // Rival: the person you've gone head-to-head with the most, then by money at stake
    let rival = null;
    if (facts) {
      for (const [k, v] of Object.entries(facts.h2h)) {
        const [a, b] = k.split("|");
        if (a !== me && b !== me) continue;
        const other = a === me ? b : a;
        const mineW = a === me ? v.a : v.b, theirW = a === me ? v.b : v.a;
        const net = facts.flow[other][me] - facts.flow[me][other];
        const score = mineW + theirW + Math.abs(net) / 100;
        if (!rival || score > rival.score) rival = { other, mineW, theirW, net, score };
      }
    }
    const rivalLine = !rival ? "" :
      rival.net < 0 ? `You're down ${money(-rival.net)} to ${rival.other}. Grandma says get it back.`
      : rival.net > 0 ? `You're up ${money(rival.net)} on ${rival.other}. Remind them often.`
      : rival.mineW > rival.theirW ? `You own the head-to-head. ${rival.other} knows it.` : `${rival.other} has your number. For now.`;

    const needsVenmo = !(config.venmo || {})[me];

    wrap.innerHTML = `
      <div class="hd-hello">
        <div class="hi">${greeting()}, ${me} 🌭</div>
        <div class="coachline">Coach Frank: "${dayLine()}"</div>
      </div>
      ${needsVenmo ? `<div class="card hd-hero hot" style="padding:12px"><b>Add your Venmo name</b> so winners can get paid.
        <button class="btn" style="background:#fff;color:var(--ink)" data-go="settings">Set it up</button></div>` : ""}
      <div class="card hd-hero ${hero.cls}">${hero.html}</div>
      ${camCard(w)}

      <div class="card">
        <h2>Your season</h2>
        <div class="hd-strip">
          <div class="cell"><b class="${myStats && myStats.net > 0 ? "pos" : myStats && myStats.net < 0 ? "neg" : ""}">${myStats ? money$(myStats.net) : "$0"}</b><span>Net</span></div>
          <div class="cell"><b>${place ? `${tied ? "T" : ""}${place}${["th", "st", "nd", "rd"][place] || "th"}` : "—"}</b><span>In the pool</span></div>
          <div class="cell"><b>${myStats ? myStats.wins : 0}</b><span>Wins</span></div>
        </div>
        ${myStats && myStats.unpaid ? `<p class="hint" style="margin:10px 0 0;color:var(--red)"><b>You have ${money(myStats.unpaid)} unpaid.</b> Shooter would be proud. Don't be Shooter.</p>` : ""}
      </div>

      ${rival ? `<div class="card">
        <h2>Your rival ⚔️</h2>
        <div class="rule"><span class="avatar">${initial(rival.other)}</span>
          <span style="flex:1"><b>${rival.other}</b><br><span class="hint" style="margin:0">${rivalLine}</span></span>
          <span class="amt">${rival.mineW}–${rival.theirW}</span></div>
      </div>` : ""}

      <div class="hd-quick">
        <button data-go="draft"><span class="e">🌭</span>Draft board</button>
        <button data-go="scores"><span class="e">⛳</span>Live scores</button>
        <button data-go="stats"><span class="e">📊</span>Season stats</button>
        <button data-go="clubhouse"><span class="e">📸</span>Ketchup Cam</button>
      </div>`;

    wrap.querySelectorAll("[data-go]").forEach(b => b.onclick = () => show(b.dataset.go));
    const n = wrap.querySelector("[data-nudge]");
    if (n) n.onclick = () => {
      const st = HD.draftState(w);
      const who = n.dataset.nudge, photo = (weekOf(-w).photos || {})[who];
      HD.shareText(`🌭 ${HDCore.nudgeLine(who)}\n${photo ? `📸 Exhibit A: ${who}'s Ketchup Cam dog.\n` : ""}Week ${wk(w)}, pick ${st.clock + 1} of ${st.total}. ${location.origin + location.pathname}`, photo ? { photo, photoName: `${who}-ketchup-cam` } : null);
    };
    const p = wrap.querySelector("[data-paid]");
    if (p) p.onclick = () => { write("week", w, { paid: { [me]: true } }); toast(pickJoke(JOKES.paid)); };
  }

  // ===================== Ketchup Cam on Home =====================
  // Photos live in week -N (see extras.js). Each phone remembers which photos it has
  // already shown and announced, so a new one gets a NEW sticker and a pop-up once.
  const camStore = {
    get(k) { try { return JSON.parse(localStorage.getItem("hd-cam-" + k)) || null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("hd-cam-" + k, JSON.stringify(v)); } catch (e) {} }
  };
  let camLoadedFor = null;
  function camPhotos(w) {
    const d = weekOf(-w), photos = d.photos || {}, times = d.photoTimes || {};
    return Object.keys(photos).map(m => ({ m, src: photos[m], t: times[m] || 0 })).sort((a, b) => b.t - a.t || a.m.localeCompare(b.m));
  }
  const unseen = (w) => { const seen = camStore.get("seen") || {}; return camPhotos(w).filter(p => p.m !== me && p.t > (seen[p.m] || 0)); };
  function camCard(w) {
    const list = camPhotos(w);
    if (!list.length) return `<div class="card"><h2>Ketchup Cam 📸</h2>
      <p class="hint">No hot dogs posted this week. Be the first, and set the bar low.</p>
      <button class="btn ghost" data-go="clubhouse">Post your hot dog</button></div>`;
    const seen = camStore.get("seen") || {};
    const isNew = (p) => p.m !== me && p.t > (seen[p.m] || 0);
    const votes = weekOf(-w).votes || {}, count = {};
    Object.values(votes).forEach(m => count[m] = (count[m] || 0) + 1);
    const leader = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const top = list[0];
    const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
    return `<div class="card">
      <h2>Ketchup Cam 📸</h2>
      <div class="hd-cam-main ${isNew(top) ? "hd-cam-pop" : ""}" data-go="clubhouse">
        <img src="${top.src}" alt="${top.m}'s hot dog">
        ${isNew(top) ? `<span class="hd-new">NEW</span>` : ""}
        <div class="cap"><span>${top.m === me ? "Your dog" : `${top.m}'s dog`}</span><span style="font-size:12px;opacity:.85">${ago(top.t)}</span></div>
      </div>
      ${list.length > 1 ? `<div class="hd-cam-row">${list.slice(1).map(p => `
        <div class="hd-cam-thumb" data-go="clubhouse"><img src="${p.src}" alt="${p.m}'s hot dog">
          ${isNew(p) ? `<span class="hd-new" style="top:3px;left:3px">NEW</span>` : ""}<span>${p.m}</span></div>`).join("")}</div>` : ""}
      <p class="hint" style="margin:10px 0 0">${list.length} dog${list.length === 1 ? "" : "s"} posted${leader ? ` · ${leader[0]} leads the vote with ${leader[1]}` : ""}. Tap to vote.</p>
      ${!list.some(p => p.m === me) ? `<button class="btn ghost" data-go="clubhouse">Post yours</button>` : ""}
    </div>`;
  }
  // Load this week's photos, and pop up a message when someone posts a new one
  function watchCam() {
    if (typeof dataReady === "undefined" || !dataReady || !me) return;
    const w = currentWeek();
    if (camLoadedFor !== w) {
      camLoadedFor = w;
      loadWeek(-w).then(renderActive);
      return;
    }
    const list = camPhotos(w).filter(p => p.m !== me && p.t);
    let told = camStore.get("told");
    if (!told) { told = {}; list.forEach(p => told[p.m] = p.t); camStore.set("told", told); return; } // first run: don't announce old photos
    const fresh = list.filter(p => p.t > (told[p.m] || 0));
    if (fresh.length) {
      fresh.forEach(p => told[p.m] = p.t);
      camStore.set("told", told);
      toast(fresh.length === 1 ? `📸 ${fresh[0].m} just posted a hot dog. Go judge it.` : `📸 ${fresh.length} new hot dogs just dropped`);
    }
  }
  // After Home shows the photos, count them as seen (the NEW sticker stays until the next visit)
  function markCamSeen() {
    const seen = camStore.get("seen") || {};
    camPhotos(currentWeek()).forEach(p => { if (p.t > (seen[p.m] || 0)) seen[p.m] = p.t; });
    camStore.set("seen", seen);
  }

  // ===================== Hook into the app's redraw =====================
  const baseRender = renderActive;
  renderActive = function () {
    baseRender();
    const active = document.querySelector("section.active");
    if (active && active.id === "home") renderHome();
    syncChrome();
    watchCam();
    if (active && active.id === "home") setTimeout(markCamSeen, 1500);
  };

  // Open on Home
  goToTab("home");
  try { renderActive(); } catch (e) {}
})();


/* ===== club.js ===== */
;// Hotdawgs club tools: phone notifications and the commissioner's toolbox.
// Adds two cards to your settings page (the avatar, top right).
// Load after draft.js.

(function () {
  const C = HDCore;
  const VAPID_PUBLIC = "BAyYGAS98RtfK9KtuSmWJwE_GpNDsmOUo6mEDEClKumfHA26w38r7xM41C3FAj5exzCe_mFEEkUdV4EU3hL_x_s";
  const commish = () => config.commissioner || "Race";
  const isCommish = () => me === commish();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ===================== Notifications =====================
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let swReg = null;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(r => { swReg = r; refreshSubState(); }).catch(() => {});
  }
  function b64ToBytes(b64) {
    const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  async function endpointKey(endpoint) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return [...new Uint8Array(d)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  }
  let subState = "unknown"; // on | off | blocked | unsupported | needs-home
  async function refreshSubState() {
    if (!pushSupported()) subState = isIOS() && !standalone() ? "needs-home" : "unsupported";
    else if (Notification.permission === "denied") subState = "blocked";
    else {
      const reg = swReg || await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      subState = sub && Notification.permission === "granted" ? "on" : "off";
      // Keep the saved subscription current (it can change after iOS updates)
      if (sub && me && dataReady) {
        const k = await endpointKey(sub.endpoint);
        if (!((config.push || {})[me] || {})[k]) await write("config", 0, { push: { [me]: { [k]: Object.assign(sub.toJSON(), { at: Date.now() }) } } });
      }
    }
    const card = document.getElementById("hdPushCard");
    if (card) card.outerHTML = pushCard();
    wire();
  }
  async function turnOn() {
    try {
      const reg = swReg || await navigator.serviceWorker.register("sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Notifications are off. Turn them on in Settings > Notifications > Hotdawgs."); return refreshSubState(); }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
      const k = await endpointKey(sub.endpoint);
      await write("config", 0, { push: { [me]: { [k]: Object.assign(sub.toJSON(), { at: Date.now() }) } } });
      toast("🔔 You're in. We'll ping you when it's your pick.");
      try { reg.showNotification("Hotdawgs 🌭", { body: "Notifications are on. Coach Frank will holler when you're up." }); } catch (e) {}
    } catch (e) {
      toast("Couldn't turn on notifications. Try again from the Home Screen app.");
    }
    refreshSubState();
  }
  async function turnOff() {
    try {
      const reg = swReg || await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        const k = await endpointKey(sub.endpoint);
        await sub.unsubscribe();
        await write("config", 0, { push: { [me]: { [k]: null } } });
      }
      toast("🔕 Notifications off on this phone.");
    } catch (e) {}
    refreshSubState();
  }
  function pushCard() {
    const body = {
      on: `<p class="hint">🔔 On for this phone. You'll get: draft open, your turn, auto-picks, final results and what you owe.</p>
           <button class="btn ghost" data-club="pushOff">Turn off on this phone</button>`,
      off: `<p class="hint">Get a ping when the draft opens, when it's your pick, and when the week is settled.</p>
            <button class="btn" data-club="pushOn">🔔 Turn on notifications</button>`,
      blocked: `<p class="hint">Notifications are blocked. On iPhone: Settings > Notifications > Hotdawgs, then allow.</p>`,
      "needs-home": `<p class="hint">On iPhone, notifications only work from the Home Screen app. In Safari tap Share, then <b>Add to Home Screen</b>, open Hotdawgs from there, and come back here.</p>`,
      unsupported: `<p class="hint">This browser can't do notifications. On iPhone, use Safari and add Hotdawgs to your Home Screen (iOS 16.4 or newer).</p>`,
      unknown: `<p class="hint">Checking…</p>`
    }[subState];
    return `<div class="card" id="hdPushCard"><h2>Notifications</h2>${body}</div>`;
  }

  // ===================== Group texts =====================
  // Everyone's number lets the app open Messages already addressed to the whole
  // group (Apple still makes you tap Send; apps can't send iMessages on their own).
  function phoneCard() {
    const ph = config.phones || {}, have = MEMBERS.filter(m => ph[m]), missing = MEMBERS.filter(m => !ph[m]);
    return `<div class="card" id="hdPhones"><h2>💬 Group texts</h2>
      <p class="hint">Add how you show up in the Hot Dawgs group chat so texts from the app open Messages already addressed to everyone. You just tap Send.</p>
      ${SETUP_NOTES[me] && !(config.phones || {})[me] ? `<p class="hint" style="color:var(--red)"><b>${esc(SETUP_NOTES[me])}</b></p>` : ""}
      <p class="hint"><b>Use exactly what the group chat shows for you</b>: your cell number, or your Apple ID email if that's what iMessage uses (check the chat's member list).</p>
      <div class="field"><label for="myPhone">Your iMessage number or email</label>
        <input type="text" id="myPhone" autocomplete="tel" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="(512) 555-0123 or you@icloud.com" value="${esc(ph[me] || "")}"></div>
      <button class="btn ghost" data-club="phone">Save</button>
      <p class="hint" style="margin-top:8px">${have.length}/${MEMBERS.length} added${missing.length ? `. Still need: ${missing.map(esc).join(", ")}` : ". Group texts go straight to everyone."}</p>
      <p class="hint" style="margin:0">Numbers are only used for group texts and are visible to pool members.</p></div>`;
  }

  // ===================== Commissioner =====================
  function lastPick(week) {
    const st = HD.draftState(week);
    const idx = st.complete ? st.total - 1 : st.clock - 1;
    if (idx < 0) return null;
    const slot = st.board[idx];
    const p = (weekOf(week).picks || {})[slot.m] || {};
    const first = p.first || (p.hot && !p.dawg ? "hot" : "dawg");
    const kind = slot.nth === 1 ? first : (first === "hot" ? "dawg" : "hot");
    if (!p[kind]) return null;
    return { idx, m: slot.m, kind, name: p[kind], other: p[kind === "hot" ? "dawg" : "hot"] };
  }
  function commishCard() {
    const w = currentWeek(), doc = weekOf(w), st = HD.draftState(w);
    const open = HD.draftOpen(w), lp = lastPick(w);
    const hours = config.autoPickHours != null ? Number(config.autoPickHours) : 4;
    const picks = doc.picks || {};
    const taken = new Set(C.entriesOf(picks).map(e => e.name));
    return `<div class="card" id="hdCommish">
      <h2>🎩 Commissioner tools</h2>
      <p class="hint">Only ${esc(commish())} sees this. Week ${wk(w)}: ${st.complete ? "draft complete" : open ? `${esc(st.onClock)} is on the clock (pick ${st.clock + 1} of ${st.total})` : "draft locked until the field posts"}.</p>

      <div class="field"><label>Pick clock</label>
        <div class="chips">${[0, 2, 4, 6, 8, 12].map(h => `<button class="chip ${h === hours ? "on" : ""}" data-hours="${h}">${h ? h + "h" : "Off"}</button>`).join("")}</div>
        <p class="hint">Time each person gets before auto-pick. The clock starts Wednesday 7am Central of tournament week and pauses 11pm–7am.</p></div>

      <div style="display:grid;gap:8px">
        ${!open && !st.complete ? `<button class="btn" data-club="forceOpen">🔓 Open the draft now</button>` : ""}
        ${open && !st.complete ? `
          <button class="btn" data-club="pickFor">🌭 Pick for ${esc(st.onClock)}</button>
          <button class="btn ghost" data-club="autoNow">⏭ Skip ${esc(st.onClock)}: auto-pick now</button>
          <button class="btn ghost" data-club="pause">${doc.clockPaused ? "▶️ Resume the pick clock" : "⏸ Pause the pick clock"}</button>` : ""}
      </div>

      ${C.entriesOf(picks).length ? (() => {
        const es = C.entriesOf(picks), wd = es.filter(e => HD.isWD && HD.isWD(w, e.name));
        return `<div class="field" style="margin-top:14px"><label>Withdrawals</label>
          <p class="hint">Picks are final once made. The only change allowed: replacing a golfer who withdraws, with someone who hasn't teed off. The member can do it from their Home screen, or you can do it here.</p>
          ${wd.length ? wd.map(e => `<div class="rule"><span style="flex:1"><b>${esc(e.name)}</b> withdrew<br><span class="hint" style="margin:0">${esc(e.who)}'s ${e.kind}</span></span>
            <button class="btn" style="width:auto;margin:0;padding:6px 12px" data-wdswap="${esc(e.who)}|${esc(e.name)}">Replace</button></div>`).join("") : `<p class="hint" style="margin:0 0 6px">No withdrawals among this week's picks.</p>`}
          <details style="margin-top:6px"><summary class="hint" style="cursor:pointer">A golfer withdrew mid-round and the app hasn't caught it?</summary>
            <div style="display:flex;gap:6px;margin-top:6px"><select id="wdMark" style="flex:1">${es.filter(e => !wd.includes(e)).map(e => `<option value="${esc(e.name)}">${esc(e.name)} (${esc(e.who)})</option>`).join("")}</select>
            <button class="btn ghost" style="width:auto;margin:0" data-club="markWD">Mark withdrawn</button></div></details></div>`;
      })() : ""}

      <div class="field" style="margin-top:14px"><label>Reset a password</label>
        <div class="chips">${MEMBERS.filter(m => (config.auth || {})[m]).map(m => `<button class="chip" data-reset="${m}">${m}</button>`).join("") || `<span class="hint">Nobody has set one yet.</span>`}</div>
        <p class="hint">They'll log in with the group password and set a new one.</p></div>
    </div>`;
  }

  async function act(what) {
    const w = currentWeek();
    if (what === "pushOn") return turnOn();
    if (what === "pushOff") return turnOff();
    if (what === "phone") {
      const raw = $("#myPhone").value.trim(), digits = raw.replace(/\D/g, "");
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      if (raw && !isEmail && digits.length < 10) return toast("Use your number with the area code, or your iMessage email.");
      const num = !raw ? null : isEmail ? raw.toLowerCase() : digits.length === 10 ? "+1" + digits : "+" + digits;
      document.activeElement && document.activeElement.blur();
      await write("config", 0, { phones: { [me]: num } });
      return toast(num ? "📱 Saved. Group texts will go straight to everyone once they've all added theirs." : "Number removed.");
    }
    if (!isCommish()) return;
    if (what === "forceOpen") {
      await write("week", w, { forceOpen: true, draftOpenAt: Date.now() });
      return toast("🔓 Draft is open. Let the hot dog eating begin.");
    }
    if (what === "pause") {
      const paused = !!weekOf(w).clockPaused;
      // Resuming gives the person on the clock a fresh full clock
      await write("week", w, paused ? { clockPaused: null, draftOpenAt: Date.now() } : { clockPaused: true });
      return toast(paused ? "▶️ Clock is running again." : "⏸ Clock paused.");
    }
    if (what === "pickFor") {
      window.HD_PROXY = HD.draftState(w).onClock;
      document.querySelector('.hd-tabbar [data-tab="draft"]').click();
      return;
    }
    if (what === "autoNow") {
      if (HD.autoPickNow) await HD.autoPickNow();
      return;
    }
    if (what === "markWD") {
      const name = $("#wdMark").value;
      if (!name || !confirmTap("wd-" + name)) return;
      await write("week", w, { withdrawn: { [name]: { by: me, at: Date.now() } } });
      return toast(`${name} marked withdrawn. His owner can now pick a replacement who hasn't teed off.`);
    }
  }
  // Two taps to confirm the risky buttons
  let armed = null;
  function confirmTap(key) {
    if (armed === key) { armed = null; return true; }
    armed = key;
    toast("Tap again to confirm.");
    setTimeout(() => { if (armed === key) armed = null; }, 4000);
    return false;
  }

  function wire() {
    const wrap = document.getElementById("settingsWrap");
    if (!wrap) return;
    wrap.querySelectorAll("[data-club]").forEach(b => b.onclick = () => act(b.dataset.club));
    wrap.querySelectorAll("[data-wdswap]").forEach(b => b.onclick = () => { const [who, name] = b.dataset.wdswap.split("|"); HD.openSwap(currentWeek(), who, name); });
    wrap.querySelectorAll("[data-hours]").forEach(b => b.onclick = () => isCommish() && write("config", 0, { autoPickHours: Number(b.dataset.hours) }));
    wrap.querySelectorAll("[data-reset]").forEach(b => b.onclick = async () => {
      const m = b.dataset.reset;
      if (!confirmTap("reset-" + m)) return;
      await write("config", 0, { auth: { [m]: null } });
      toast(`${m}'s password is reset. Tell them to use the group password.`);
    });
  }

  const baseSettings = renderSettings;
  renderSettings = function () {
    const wrap = document.getElementById("settingsWrap");
    baseSettings();
    if (!me || wrap.querySelector("#hdClub")) return; // still being edited
    const box = document.createElement("div");
    box.id = "hdClub";
    box.innerHTML = phoneCard() + pushCard() + (isCommish() ? commishCard() : "");
    wrap.insertBefore(box, wrap.children[1] || null);
    wire();
    if (subState === "unknown") refreshSubState();
  };

  // If the commissioner resets your password on another phone, log this one out
  const baseRender = renderActive;
  renderActive = function () {
    if (dataReady && me && !$("#appArea").hidden && !sessionValid()) { logOut(); return; }
    const out = baseRender.apply(this, arguments);
    setupCard();
    return out;
  };
  // Home nudge until you've added how you show up in the group chat
  const SETUP_NOTES = {
    Zach: "Heads up Zach: you're in the Hot Dawgs chat by your Yahoo email, not your phone number. Enter that email exactly, or the app's texts will start a new group instead of landing in Hot Dawgs."
  };
  function setupCard() {
    if (!dataReady || !me || (config.phones || {})[me]) return;
    const a = document.querySelector("section.active");
    if (!a || a.id !== "home") return;
    const wrap = document.getElementById("homeWrap");
    if (!wrap || wrap.querySelector("#hdSetupTexts")) return;
    const el = document.createElement("div");
    el.className = "card";
    el.id = "hdSetupTexts";
    el.style.borderColor = "var(--red)";
    el.innerHTML = `<h2>💬 One quick setup</h2>
      <p style="margin:4px 0 8px">Add how you show up in the <b>Hot Dawgs</b> group chat so pick nudges and payout texts go straight to the group. Takes 10 seconds.</p>
      ${SETUP_NOTES[me] ? `<p class="hint" style="color:var(--red);margin:0 0 8px"><b>${esc(SETUP_NOTES[me])}</b></p>` : `<p class="hint" style="margin:0 0 8px">Use the exact number (or email) the group chat shows for you.</p>`}
      <button class="btn" id="hdSetupGo">Set it up</button>`;
    const hero = [...wrap.querySelectorAll(".card.hd-hero")].pop();
    hero ? hero.after(el) : wrap.prepend(el);
    el.querySelector("#hdSetupGo").onclick = () => {
      document.querySelector(".hd-avatar").click();
      setTimeout(() => { const c = document.getElementById("hdPhones"); if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); const i = c.querySelector("#myPhone"); if (i) i.focus(); } }, 400);
    };
  }

  window.HD = Object.assign(window.HD || {}, { pushState: () => subState, turnOnPush: turnOn });
})();


/* ===== egg.js ===== */
;// The egg beer: after you log in, a raw egg drops into a beer and the beer gets chugged.
// About 3.5 seconds. Tap anywhere to skip. Respects "Reduce Motion".

(function () {
  const style = document.createElement("style");
  style.textContent = `
    .egg-ov { position: fixed; inset: 0; z-index: 200; display: flex; flex-direction: column; align-items: center;
      justify-content: center; background: radial-gradient(circle at 50% 40%, #fff6e3 0%, #ffd77a 70%, #f2b33d 100%);
      animation: eggFadeIn .25s ease-out; cursor: pointer; }
    .egg-ov.out { animation: eggFadeOut .35s ease-in forwards; }
    @keyframes eggFadeIn { from { opacity: 0; } }
    @keyframes eggFadeOut { to { opacity: 0; transform: scale(1.04); } }
    .egg-ov svg { width: min(68vw, 260px); height: auto; overflow: visible; }
    .egg-cap { margin-top: 12px; font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 26px;
      color: #8f1d1d; text-align: center; min-height: 34px; padding: 0 20px; }
    .egg-sub { font-weight: 800; font-size: 13px; color: #5a3b14; opacity: .7; margin-top: 6px; }

    /* 0–0.9s: the egg drops in */
    .egg-egg { transform-box: fill-box; transform-origin: center; animation: eggDrop .9s cubic-bezier(.5,0,.9,.5) forwards; }
    @keyframes eggDrop { 0% { transform: translateY(-230px) rotate(-25deg); } 85% { opacity: 1; }
      100% { transform: translateY(78px) rotate(10deg); opacity: 0; } }
    /* Splash and the yolk sinking */
    .egg-splash { opacity: 0; transform-box: fill-box; transform-origin: center bottom; animation: eggSplash .5s ease-out .82s forwards; }
    @keyframes eggSplash { 0% { opacity: 1; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.5) translateY(-14px); } }
    .egg-yolk { opacity: 0; animation: eggYolk 1.2s ease-in .85s forwards; }
    @keyframes eggYolk { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 1; transform: translateY(56px); } }
    /* 1.4–3.1s: tilt and chug */
    .egg-glass { transform-box: fill-box; transform-origin: 50% 40%; animation: eggTilt 1.7s ease-in-out 1.4s forwards; }
    @keyframes eggTilt { 0% { transform: rotate(0); } 20% { transform: translateY(-14px) rotate(-24deg); }
      82% { transform: translateY(-18px) rotate(-32deg); } 100% { transform: translateY(0) rotate(0); } }
    .egg-beer { transform-box: view-box; animation: eggDrain 1.2s ease-in 1.75s forwards; }
    @keyframes eggDrain { to { transform: translateY(150px); } }
    .egg-bub { animation: eggBub 1s ease-in infinite; }
    .egg-bub:nth-child(2) { animation-delay: .3s; } .egg-bub:nth-child(3) { animation-delay: .6s; }
    @keyframes eggBub { from { transform: translateY(0); opacity: .9; } to { transform: translateY(-60px); opacity: 0; } }
    .egg-gulp { opacity: 0; font-weight: 900; font-size: 22px; fill: #8f1d1d; animation: eggGulp 1.4s ease-out 1.8s forwards; }
    @keyframes eggGulp { 0%, 100% { opacity: 0; } 20%, 80% { opacity: 1; } }
    .egg-slam { transform-box: fill-box; transform-origin: center bottom; animation: eggSlam .3s ease-out 3.05s; }
    @keyframes eggSlam { 50% { transform: scale(1.08, .92); } }
    @media (prefers-reduced-motion: reduce) {
      .egg-ov *, .egg-ov { animation-duration: .01s !important; animation-delay: 0s !important; }
    }
  `;
  document.head.appendChild(style);

  const LINES = [
    "Down the hatch. Now go draft like a champion.",
    "Raw egg, cold beer, hot dawgs. Breakfast of champions.",
    "That's protein. Your swing coach would be proud.",
    "One egg beer and you're seeing the line on every putt.",
    "Shell check: clean. You're cleared to pick."
  ];

  const SVG = `
  <svg viewBox="0 0 200 260" aria-hidden="true">
    <ellipse cx="100" cy="250" rx="58" ry="7" fill="#000" opacity=".12"/>
    <g class="egg-slam"><g class="egg-glass">
      <defs><clipPath id="eggClip"><path d="M52 60 L148 60 L140 236 Q100 244 60 236 Z"/></clipPath></defs>
      <g clip-path="url(#eggClip)">
        <g class="egg-beer">
          <rect x="40" y="86" width="120" height="170" fill="#f4a51c"/>
          <rect x="40" y="86" width="120" height="170" fill="url(#eggShine)" opacity=".35"/>
          <g fill="#fff3c4"><circle class="egg-bub" cx="80" cy="220" r="3"/><circle class="egg-bub" cx="112" cy="200" r="2.5"/><circle class="egg-bub" cx="96" cy="230" r="2"/></g>
          <path d="M44 88 Q60 70 76 84 Q92 66 108 82 Q124 66 140 84 Q152 74 158 88 L158 100 L44 100 Z" fill="#fffaf0"/>
          <g class="egg-yolk"><circle cx="102" cy="110" r="11" fill="#ffb300"/><circle cx="98" cy="106" r="3" fill="#fff4b0"/></g>
        </g>
      </g>
      <defs><linearGradient id="eggShine" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="M52 60 L148 60 L140 236 Q100 244 60 236 Z" fill="none" stroke="#3a2a1a" stroke-width="5" stroke-linejoin="round"/>
      <path d="M62 72 L68 220" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    </g></g>
    <g class="egg-splash" fill="#fffaf0" stroke="#3a2a1a" stroke-width="2">
      <circle cx="78" cy="78" r="6"/><circle cx="124" cy="74" r="7"/><circle cx="100" cy="66" r="5"/><circle cx="140" cy="84" r="4"/>
    </g>
    <g class="egg-egg"><ellipse cx="102" cy="40" rx="17" ry="22" fill="#fffdf7" stroke="#3a2a1a" stroke-width="4"/>
      <ellipse cx="96" cy="32" rx="5" ry="7" fill="#fff" opacity=".9"/></g>
    <text class="egg-gulp" x="150" y="30">GLUG</text>
    <text class="egg-gulp" x="0" y="20" style="animation-delay:2.3s">GLUG</text>
  </svg>`;

  function eggBeer(name) {
    if (document.querySelector(".egg-ov")) return;
    const ov = document.createElement("div");
    ov.className = "egg-ov";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "Welcome animation. Tap to skip.");
    ov.innerHTML = SVG + `<div class="egg-cap">Egg beer time${name ? ", " + name : ""}! 🥚🍺</div><div class="egg-sub">Tap to skip</div>`;
    document.body.appendChild(ov);
    const cap = ov.querySelector(".egg-cap");
    const t1 = setTimeout(() => { cap.textContent = "Chug! Chug! Chug!"; }, 1500);
    const t2 = setTimeout(() => { cap.textContent = LINES[Math.floor(Math.random() * LINES.length)]; }, 3050);
    let gone = false;
    const close = () => {
      if (gone) return; gone = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      ov.classList.add("out");
      setTimeout(() => ov.remove(), 360);
    };
    const t3 = setTimeout(close, 4300);
    ov.addEventListener("click", close);
    if (navigator.vibrate) try { setTimeout(() => navigator.vibrate([30, 60, 30]), 3050); } catch (e) {}
  }

  window.HD = Object.assign(window.HD || {}, { eggBeer });
})();


/* ===== fun.js ===== */
;// Hotdawgs fun pack:
//  - The Hotdawg Herald: a front page for every finished week (Home + Clubhouse archive)
//  - Hotdawgs Wrapped: your season as a tap-through story (Clubhouse)
//  - The Egg Beer Penalty: last place each week owes the group an egg beer, with photo proof
//  - Eagle confetti when a pool golfer makes eagle while you're watching
//  - Withdrawal warnings on your picks
// Egg beer proof photos are saved in the week rows numbered -week (with Ketchup Cam).
// Load after home.js and extras.js, before tips.js.

(function () {
  const C = HDCore;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ord = (n) => { if (!n || n >= 999) return "MC"; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const short = (n) => (n || "").replace(/\s+(pres\.?|presented) by .*$/i, "");
  const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const style = document.createElement("style");
  style.textContent = `
    .hd-ov { position: fixed; inset: 0; z-index: 150; background: rgba(30,18,8,.82); overflow-y: auto; -webkit-overflow-scrolling: touch;
      padding: calc(60px + env(safe-area-inset-top, 0px)) 12px calc(30px + env(safe-area-inset-bottom, 0px)); animation: hdFade .25s ease-out; }
    @keyframes hdFade { from { opacity: 0; } }
    .hd-x { position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); right: 12px; z-index: 3; width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid #2b1b10; background: #fff; font: inherit; font-size: 18px; font-weight: 900; cursor: pointer; }

    /* ---- Herald ---- */
    .hz { max-width: 520px; margin: 0 auto; background: #f6f0e1; color: #1c140c; padding: 16px 16px 22px; border-radius: 4px;
      font-family: Georgia, "Times New Roman", serif; box-shadow: 0 10px 30px rgba(0,0,0,.4); animation: hzSpin .6s cubic-bezier(.2,1.4,.4,1); }
    @keyframes hzSpin { from { transform: rotate(-200deg) scale(.1); opacity: 0; } }
    .hz-mast { text-align: center; border-bottom: 3px double #1c140c; padding-bottom: 6px; }
    .hz-mast h1 { margin: 0; font-family: "Old English Text MT", "UnifrakturMaguntia", Georgia, serif; font-size: 34px; letter-spacing: .5px; line-height: 1.05; }
    .hz-dateline { display: flex; justify-content: space-between; font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px;
      border-bottom: 1px solid #1c140c; padding: 4px 0; margin-bottom: 10px; gap: 6px; }
    .hz-head { font-size: 34px; font-weight: 900; line-height: 1.02; text-transform: uppercase; text-align: center; margin: 6px 0; letter-spacing: -.5px; }
    .hz-deck { text-align: center; font-style: italic; font-size: 15px; margin-bottom: 10px; }
    .hz-photo { border: 1px solid #1c140c; background: #ddd2b8; aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .hz-photo img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(.85) contrast(1.15) sepia(.25); }
    .hz-photo .noimg { font-size: 80px; filter: grayscale(.7); }
    .hz-cap { font-size: 11.5px; font-style: italic; margin: 4px 0 12px; }
    .hz-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .hz-cols > div { border-top: 2px solid #1c140c; padding-top: 6px; margin-bottom: 10px; }
    .hz-cols h4 { margin: 0 0 3px; font-size: 13px; text-transform: uppercase; letter-spacing: .4px; }
    .hz-cols p { margin: 0; font-size: 13px; line-height: 1.35; }
    .hz-quote { border-top: 1px solid #1c140c; border-bottom: 1px solid #1c140c; padding: 8px 4px; margin: 4px 0 10px; text-align: center; font-size: 16px; font-style: italic; }
    .hz-tick { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; border-top: 3px double #1c140c; padding-top: 6px; line-height: 1.6; }
    .hz-ad { margin-top: 10px; border: 2px dashed #1c140c; padding: 6px; text-align: center; font-size: 11.5px; text-transform: uppercase; }
    .hz-btns { max-width: 520px; margin: 12px auto 0; display: grid; gap: 8px; }

    /* ---- Wrapped ---- */
    .wr { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; color: #fff; user-select: none; -webkit-user-select: none;
      padding: calc(12px + env(safe-area-inset-top, 0px)) 18px calc(24px + env(safe-area-inset-bottom, 0px)); transition: background .4s; }
    .wr-bars { display: flex; gap: 4px; }
    .wr-bars i { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.35); overflow: hidden; }
    .wr-bars i b { display: block; height: 100%; width: 0; background: #fff; }
    .wr-bars i.done b { width: 100%; }
    .wr-bars i.now b { animation: wrBar 6s linear forwards; }
    @keyframes wrBar { to { width: 100%; } }
    .wr-body { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 12px; }
    .wr-body > * { animation: wrIn .5s cubic-bezier(.2,1.3,.4,1) both; }
    .wr-body > *:nth-child(2) { animation-delay: .25s; } .wr-body > *:nth-child(3) { animation-delay: .5s; } .wr-body > *:nth-child(4) { animation-delay: .75s; }
    @keyframes wrIn { from { opacity: 0; transform: translateY(24px) scale(.9); } }
    .wr-k { font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; font-size: 13px; opacity: .85; }
    .wr-big { font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 54px; line-height: 1; }
    .wr-mid { font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 30px; line-height: 1.1; }
    .wr-p { font-size: 17px; font-weight: 700; line-height: 1.35; opacity: .95; }
    .wr-emoji { font-size: 84px; line-height: 1; }
    .wr-foot { text-align: center; font-size: 12px; opacity: .7; font-weight: 800; }

    /* ---- Egg beer court ---- */
    .eb-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 2px dashed var(--bun); }
    .eb-row:last-child { border-bottom: 0; }
    .eb-proofs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .eb-proofs figure { margin: 0; text-align: center; font-size: 11px; font-weight: 800; }
    .eb-proofs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; border: 2px solid var(--shadow); }

    /* ---- Confetti ---- */
    .cf { position: fixed; top: -40px; z-index: 300; pointer-events: none; font-size: 26px; animation: cfFall linear forwards; }
    @keyframes cfFall { to { transform: translateY(110vh) rotate(720deg); } }
    .cf-banner { position: fixed; left: 50%; top: 30%; z-index: 301; transform: translate(-50%, -50%); pointer-events: none; text-align: center;
      background: var(--red); color: #fff; border: 4px solid var(--shadow); border-radius: 20px; padding: 14px 20px; box-shadow: 0 6px 0 var(--shadow);
      font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 30px; animation: cfPop 3.2s ease-out forwards; width: max-content; max-width: 86vw; }
    .cf-banner small { display: block; font-family: inherit; font-size: 14px; font-weight: 800; margin-top: 4px; }
    @keyframes cfPop { 0% { transform: translate(-50%,-50%) scale(.2); opacity: 0; } 12% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
      20% { transform: translate(-50%,-50%) scale(1); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-60%) scale(1); } }
  `;
  document.head.appendChild(style);

  // ===================== Shared week facts =====================
  const rankOf = (n) => { const g = golfers.find(x => x.name === n); if (g) return g.rank; const r = rankingsFile && rankingsFile.players.find(p => p.name === n); return r ? r.rank : 999; };
  const settled = (w) => { const d = weekOf(w); return !!(d.settle && d.settle.winner && d.finishes); };
  const perPayer = (s) => (s.rules || []).reduce((t, id) => t + amountOf(id), 0);
  function entriesWithPos(w) {
    const d = weekOf(w), fin = d.finishes || {};
    return C.entriesOf(d.picks).map(e => Object.assign(e, { pos: fin[e.name] != null ? Number(fin[e.name]) : 999, rank: rankOf(e.name) }));
  }
  // Last place: the member whose best golfer finished worst. Ties go against the
  // better-ranked golfer (the mirror of the pool's tiebreak).
  function lastPlace(w) {
    if (!settled(w)) return null;
    const by = {};
    for (const e of entriesWithPos(w)) if (!by[e.who] || e.pos < by[e.who].pos || (e.pos === by[e.who].pos && e.rank > by[e.who].rank)) by[e.who] = e;
    const list = Object.values(by);
    if (list.length < 2) return null;
    list.sort((a, b) => b.pos - a.pos || a.rank - b.rank);
    return list[0];
  }
  const latestSettled = () => { for (let w = currentWeek(); w >= 1; w--) if (settled(w)) return w; return 0; };

  // Proof photos live in the -week rows; make sure older ones are loaded
  let negLoaded = 0;
  async function loadNeg() {
    if (!dataReady) return;
    const cur = currentWeek();
    if (negLoaded >= cur) return;
    const from = negLoaded + 1;
    negLoaded = cur;
    for (let w = from; w <= cur; w++) if (!weekDocs[-w]) { try { await loadWeek(-w); } catch (e) {} }
    renderActive();
  }
  const eggDebts = () => {
    const out = [];
    for (let w = seasonStart(); w <= currentWeek(); w++) {
      const lp = lastPlace(w);
      if (lp) out.push({ w, m: lp.who, golfer: lp.name, pos: lp.pos, proof: ((weekOf(-w).eggProof || {})[lp.who]) || null, at: ((weekOf(-w).eggProofTimes || {})[lp.who]) || 0 });
    }
    return out;
  };
  const owing = () => {
    const c = {};
    eggDebts().filter(d => !d.proof).forEach(d => c[d.m] = (c[d.m] || 0) + 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };

  // ===================== The Hotdawg Herald =====================
  const QUOTES = [
    "I told him to find his happy place. He found the water on 18.",
    "Forty years in this game, and I've never seen a dawg run like that.",
    "You don't pick golfers. Golfers pick you. Then they miss the cut.",
    "Pay the man. Then go hug a hot dog.",
    "The egg beer is a choice. Losing is also a choice.",
    "Mustard on the dog, ice in the veins. That's the whole secret.",
    "I've seen worse picks. Not this week, but I have.",
    "Some guys draft with their heart. Some with their wallet. The winner drafted with relish."
  ];
  function heraldData(w) {
    const d = weekOf(w), s = d.settle, t = weekTourney(w) || {};
    const es = entriesWithPos(w);
    const per = perPayer(s), total = per * (MEMBERS.length - 1);
    const wp = es.filter(e => e.who === s.winner).sort((a, b) => a.pos - b.pos)[0];
    const bust = es.slice().sort((a, b) => (b.pos - b.rank) - (a.pos - a.rank))[0];
    const longshot = es.filter(e => e.pos < 999).sort((a, b) => (b.rank - b.pos) - (a.rank - a.pos))[0];
    const mcs = es.filter(e => e.pos >= 999);
    const cam = (() => {
      const votes = weekOf(-w).votes || {}, count = {};
      Object.values(votes).forEach(m => count[m] = (count[m] || 0) + 1);
      const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      const photos = weekOf(-w).photos || {};
      if (top && photos[top[0]]) return { m: top[0], src: photos[top[0]], votes: top[1] };
      const any = Object.keys(photos)[0];
      return any ? { m: any, src: photos[any], votes: 0 } : null;
    })();
    const season = HD.seasonData ? HD.seasonData() : null;
    const table = season ? Object.values(season.stats).sort((a, b) => b.net - a.net) : [];
    return { w, d, s, t, es, per, total, wp, bust, longshot, mcs, cam, table, last: lastPlace(w) };
  }
  function heraldHtml(w) {
    const h = heraldData(w);
    const heads = h.wp && h.wp.kind === "dawg"
      ? [`${h.s.winner} rides dawg to glory`, `Dawg day afternoon for ${h.s.winner}`, `${h.s.winner}'s dawg bites back`]
      : [`${h.s.winner} cashes in`, `${h.s.winner} wins it all`, `Hot hand: ${h.s.winner} takes the pot`];
    const head = pick(heads, w);
    const when = h.t.start ? new Date(h.t.start + "T12:00:00").getTime() + 4 * 86400000 : Date.now();
    const date = new Date(when).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const deck = h.wp ? `${esc(h.wp.name)} finishes ${ord(h.wp.pos)} at the ${esc(short(h.t.name) || "tournament")}; the other ${MEMBERS.length - 1} owe $${h.per} apiece.` : "";
    const tick = h.table.map(r => `${esc(r.m).toUpperCase()} ${r.net > 0 ? "▲" : r.net < 0 ? "▼" : "■"}${r.net < 0 ? "−" : ""}$${Math.abs(r.net)}`).join(" · ");
    const nextFirst = HD.draftOrder ? HD.draftOrder(w + 1)[0] : "";
    return `<div class="hz">
      <div class="hz-mast"><h1>The Hotdawg Herald</h1><div style="font-size:11px;font-style:italic">"All the news that's fit to relish"</div></div>
      <div class="hz-dateline"><span>${date}</span><span>Week ${wk(w)} edition</span><span>Price: one egg beer</span></div>
      <div class="hz-head">${esc(head)}</div>
      <div class="hz-deck">${deck} Total haul: $${h.total}.</div>
      <div class="hz-photo">${h.cam ? `<img src="${h.cam.src}" alt="">` : `<span class="noimg">🌭</span>`}</div>
      <div class="hz-cap">${h.cam ? `KETCHUP CAM: ${esc(h.cam.m)}'s week ${wk(w)} dog${h.cam.votes ? `, winner by ${h.cam.votes} vote${h.cam.votes > 1 ? "s" : ""}` : ""}. Photo: the Herald staff.` : "No Ketchup Cam photos this week. The Herald is disappointed in all of you."}</div>
      <div class="hz-cols">
        ${h.bust && h.bust.pos > 10 ? `<div><h4>Bust of the week</h4><p><b>${esc(h.bust.name)}</b> came in ranked No. ${h.bust.rank} and left ${h.bust.pos >= 999 ? "on Friday" : `in ${ord(h.bust.pos)}`}. ${esc(h.bust.who)} declined to comment.</p></div>` : ""}
        ${h.longshot ? `<div><h4>Long shot</h4><p><b>${esc(h.longshot.name)}</b>, world No. ${h.longshot.rank >= 999 ? "who-knows" : h.longshot.rank}, finished ${ord(h.longshot.pos)} for ${esc(h.longshot.who)}. Scouts are baffled.</p></div>` : ""}
        <div><h4>Police blotter</h4><p>${h.mcs.length ? `${h.mcs.length} pool golfer${h.mcs.length > 1 ? "s" : ""} missed the cut: ${h.mcs.map(e => esc(e.name)).join(", ")}. No arrests made.` : "Every pool golfer made the cut. Authorities are suspicious."}</p></div>
        <div><h4>Egg beer watch</h4><p>${h.last ? `<b>${esc(h.last.who)}</b> finished last (${esc(h.last.name)}, ${ord(h.last.pos)}) and owes the group an egg beer. Proof ${((weekOf(-w).eggProof || {})[h.last.who]) ? "has been filed." : "is pending."}` : "No egg beer owed this week."}</p></div>
      </div>
      ${HD.recordsBrokenIn ? HD.recordsBrokenIn(w).map(r => `<div class="hz-quote" style="font-style:normal;background:#1c140c;color:#f6f0e1"><b>🏅 RECORD BROKEN:</b> ${esc(r.title)}. ${esc(r.holder)}, ${esc(r.value)}.</div>`).join("") : ""}
      <div class="hz-quote">"${esc(pick(QUOTES, w * 7 + 3))}"<br><span style="font-size:12px;font-style:normal">— Coach Frank Furter</span></div>
      <div class="hz-tick"><b>SEASON TICKER:</b> ${tick}</div>
      <div class="hz-ad">Next week: ${nextFirst ? `${esc(nextFirst)} picks first.` : ""} Draft opens when the field posts. Bring mustard.</div>
    </div>`;
  }
  function openHerald(w) {
    const ov = document.createElement("div");
    ov.className = "hd-ov";
    ov.innerHTML = `<button class="hd-x" aria-label="Close">✕</button>${heraldHtml(w)}
      <div class="hz-btns"><button class="btn" data-hz="share">Send to the group 💬</button>
      <p class="hint" style="color:#fff;text-align:center;margin:0">Screenshot it for the full front page.</p></div>`;
    document.body.appendChild(ov);
    try { localStorage.setItem("hd-herald-read", String(w)); } catch (e) {}
    const close = () => { ov.remove(); renderActive(); };
    ov.querySelector(".hd-x").onclick = close;
    ov.querySelector("[data-hz=share]").onclick = () => {
      const h = heraldData(w);
      const text = `📰 THE HOTDAWG HERALD, Week ${wk(w)}\n${h.s.winner.toUpperCase()} WINS: ${h.wp ? `${h.wp.name} ${ord(h.wp.pos)}` : ""}, $${h.per} from everyone.${h.last ? `\n🥚🍺 ${h.last.who} owes an egg beer.` : ""}\nRead it: ${location.origin + location.pathname}`;
      HD.shareText ? HD.shareText(text) : (navigator.share ? navigator.share({ text }).catch(() => {}) : null);
    };
  }

  // ===================== Hotdawgs Wrapped =====================
  function wrappedSlides(m) {
    const season = HD.seasonData();
    const st = season.stats[m];
    const weeks = [];
    for (let w = seasonStart(); w <= currentWeek(); w++) if (settled(w)) weeks.push(w);
    const mine = weeks.flatMap(w => entriesWithPos(w).filter(e => e.who === m).map(e => Object.assign({ w }, e)));
    const avg = (arr) => arr.length ? arr.reduce((s, x) => s + Math.min(x.pos, 80), 0) / arr.length : 99;
    const hots = mine.filter(e => e.kind === "hot"), dawgs = mine.filter(e => e.kind === "dawg");
    const longShot = mine.filter(e => e.pos <= 20).sort((a, b) => (b.rank - b.pos) - (a.rank - a.pos))[0];
    const curse = mine.slice().sort((a, b) => (b.pos - b.rank) - (a.pos - a.rank))[0];
    const top = (obj) => Object.entries(obj).filter(([k, v]) => k !== m && v > 0).sort((a, b) => b[1] - a[1])[0];
    const nemesis = top(season.flowOwed[m]);
    const customer = top(Object.fromEntries(MEMBERS.map(x => [x, season.flowOwed[x][m]])));
    const debts = eggDebts().filter(d => d.m === m);
    const board = Object.values(season.stats).sort((a, b) => b.net - a.net);
    const place = 1 + board.filter(s => s.net > st.net).length;
    const mostEggs = owing()[0];
    const persona =
      place === 1 && st.net > 0 ? ["🦈", "The Shark", "Top of the table. Everyone else is just paying your rent."]
      : debts.length && mostEggs && mostEggs[0] === m ? ["🥚", "Egg Beer Champion", "Nobody has chugged more for this pool. Your doctor has questions."]
      : st.unpaid > 0 ? ["🧾", "The Slow Pay", "You owe money right now. The group has noticed. Coach Frank has noticed."]
      : dawgs.length && avg(dawgs) < avg(hots) ? ["🐶", "Dawg Whisperer", "Your dawgs outplayed your hots. You see things the rankings don't."]
      : !st.wins ? ["⛏️", "The Grinder", "No wins yet, but you keep showing up. Respect. Mild pity, but respect."]
      : ["🌭", "Steady Eddie", "Not flashy. Not broke. Just a hot dog doing hot dog things."];
    const slides = [
      { bg: "linear-gradient(160deg,#d92b2b,#7a1414)", html: `<div class="wr-emoji">🌭</div><div class="wr-k">Hotdawgs Wrapped</div><div class="wr-mid">${esc(m)}, here's your season${weeks.length < 10 ? " so far" : ""}</div><div class="wr-p">${weeks.length} week${weeks.length === 1 ? "" : "s"} in the books. Tap to keep going.</div>` },
      { bg: st.net >= 0 ? "linear-gradient(160deg,#1f8a4c,#0c4426)" : "linear-gradient(160deg,#5a2a82,#26103d)", html: `<div class="wr-k">Your bottom line</div><div class="wr-big">${st.net < 0 ? "−" : "+"}$${Math.abs(st.net)}</div><div class="wr-p">${st.wins} win${st.wins === 1 ? "" : "s"} · ${ord(place)} place in the pool</div><div class="wr-p">${st.net > 0 ? "The pool has been very good to you." : st.net < 0 ? "Think of it as a donation to your friends' hot dog fund." : "Perfectly balanced. As all things should be."}</div>` },
      longShot ? { bg: "linear-gradient(160deg,#f2b33d,#c4661c)", html: `<div class="wr-k">Your best long shot</div><div class="wr-emoji">🎯</div><div class="wr-mid">${esc(longShot.name)}</div><div class="wr-p">World No. ${longShot.rank >= 999 ? "unranked" : longShot.rank}, finished ${ord(longShot.pos)} in week ${wk(longShot.w)}. Nobody saw it coming except you.</div>` } : null,
      curse ? { bg: "linear-gradient(160deg,#30343b,#0e0f12)", html: `<div class="wr-k">The one that cursed you</div><div class="wr-emoji">👻</div><div class="wr-mid">${esc(curse.name)}</div><div class="wr-p">Ranked No. ${curse.rank}, finished ${curse.pos >= 999 ? "with a missed cut" : ord(curse.pos)} in week ${wk(curse.w)}. Never forget.</div>` } : null,
      (nemesis || customer) ? { bg: "linear-gradient(160deg,#1b6fa8,#0b2f4a)", html: `<div class="wr-k">Money trail</div><div class="wr-emoji">💸</div>${nemesis ? `<div class="wr-p">Your nemesis: <b>${esc(nemesis[0])}</b>. You've sent them $${nemesis[1]}.</div>` : ""}${customer ? `<div class="wr-p">Your best customer: <b>${esc(customer[0])}</b>. They've paid you $${customer[1]}.</div>` : ""}` } : null,
      { bg: "linear-gradient(160deg,#fff6e3,#f2b33d)", dark: true, html: `<div class="wr-k">Egg beer report</div><div class="wr-emoji">🥚🍺</div><div class="wr-big">${debts.length}</div><div class="wr-p">${debts.length ? `egg beer${debts.length === 1 ? "" : "s"} owed for finishing last. ${debts.filter(d => d.proof).length} with photo proof.` : "Zero last-place finishes. Your stomach thanks you."}</div>` },
      { bg: "linear-gradient(160deg,#d92b2b,#f2b33d)", html: `<div class="wr-k">Your pool personality</div><div class="wr-emoji">${persona[0]}</div><div class="wr-mid">${persona[1]}</div><div class="wr-p">${persona[2]}</div>`, last: persona }
    ].filter(Boolean);
    return slides;
  }
  function openWrapped(m) {
    m = m || me;
    const slides = wrappedSlides(m);
    let i = 0, timer = null;
    const ov = document.createElement("div");
    ov.className = "wr";
    document.body.appendChild(ov);
    const close = () => { clearTimeout(timer); ov.remove(); };
    const show = () => {
      clearTimeout(timer);
      const s = slides[i];
      ov.style.background = s.bg;
      ov.style.color = s.dark ? "#3a2a1a" : "#fff";
      const lastOne = i === slides.length - 1;
      ov.innerHTML = `<div class="wr-bars">${slides.map((x, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"><b></b></i>`).join("")}</div>
        <button class="hd-x" aria-label="Close" style="top:calc(26px + env(safe-area-inset-top,0px))">✕</button>
        <div class="wr-body">${s.html}${lastOne ? `<button class="btn" data-wr="share" style="background:#fff;color:#2b1b10;max-width:300px;margin:0 auto">Share my Wrapped 💬</button>` : ""}</div>
        <div class="wr-foot">${lastOne ? "Tap ✕ to close" : "Tap right for next · left to go back"}</div>`;
      ov.querySelector(".hd-x").onclick = (e) => { e.stopPropagation(); close(); };
      const sb = ov.querySelector("[data-wr=share]");
      if (sb) sb.onclick = (e) => {
        e.stopPropagation();
        const st = HD.seasonData().stats[m];
        const text = `🌭 My Hotdawgs Wrapped: ${s.last[0]} ${s.last[1]}. ${st.net < 0 ? "−" : "+"}$${Math.abs(st.net)} on the season, ${st.wins} win${st.wins === 1 ? "" : "s"}. See yours: ${location.origin + location.pathname}`;
        HD.shareText ? HD.shareText(text) : null;
      };
      if (!lastOne) timer = setTimeout(() => { i++; show(); }, 6000);
    };
    ov.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      if (e.clientX < window.innerWidth * 0.3) i = Math.max(0, i - 1);
      else if (i < slides.length - 1) i++;
      else return;
      show();
    });
    show();
  }

  // ===================== Egg Beer Court =====================
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 640, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  function eggCourtCard() {
    const debts = eggDebts();
    if (!debts.length) return `<div class="card" id="eggCourt"><h2>🥚🍺 Egg Beer Court</h2>
      <p class="hint">Finish last in a week and you owe the group an egg beer: crack a raw egg into a beer and chug it, with photo proof. Nobody's been sentenced yet.</p></div>`;
    const open = debts.filter(d => !d.proof);
    const myOpen = open.filter(d => d.m === me);
    const proofs = debts.filter(d => d.proof).sort((a, b) => b.at - a.at);
    return `<div class="card" id="eggCourt"><h2>🥚🍺 Egg Beer Court</h2>
      <p class="hint">Last place each week owes the group an egg beer. Photo proof or it didn't happen.</p>
      ${open.length ? open.map(d => `<div class="eb-row"><span class="avatar">${initial(d.m)}</span>
        <span style="flex:1"><b>${esc(d.m)}</b> · week ${wk(d.w)}<br><span class="hint" style="margin:0">${esc(d.golfer)} finished ${ord(d.pos)}</span></span>
        <b style="color:var(--red)">OWES 🥚</b></div>`).join("") : `<p><b>All egg beers paid in full.</b> The court is satisfied.</p>`}
      ${myOpen.length ? `<label class="btn" style="display:block;text-align:center;margin-top:10px">📸 Post my proof (week ${wk(myOpen[0].w)})
        <input type="file" accept="image/*" capture="environment" id="eggIn" data-w="${myOpen[0].w}" style="display:none"></label>` : ""}
      ${proofs.length ? `<p class="hint" style="margin-top:12px">Hall of shame</p><div class="eb-proofs">${proofs.slice(0, 9).map(d => `<figure><img src="${d.proof}" alt=""><figcaption>${esc(d.m)} · wk ${wk(d.w)}</figcaption></figure>`).join("")}</div>` : ""}
    </div>`;
  }
  function wireEgg(root) {
    const inp = root.querySelector("#eggIn");
    if (!inp) return;
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const src = await compressPhoto(f);
        const w = Number(inp.dataset.w);
        await write("week", -w, { eggProof: { [me]: src }, eggProofTimes: { [me]: Date.now() } });
        toast("🥚🍺 Proof filed. The court thanks you. Your stomach does not.");
        if (HD.eggBeer) HD.eggBeer(me);
      } catch (e) { toast("Couldn't read that photo. Try another."); }
    };
  }

  // ===================== Withdrawals =====================
  // A pick that's no longer in a posted, not-yet-started field
  function isWD(week, name) {
    if (((weekOf(week).withdrawn || {})[name])) return true; // marked by the commissioner
    const lp = live.players.find(p => p.name === name);
    if (week === currentWeek() && lp && lp.posText === "WD") return true;
    if (week !== currentWeek() || !live.event || live.players.length < 60) return false;
    if (live.players.some(p => p.posText && p.posText !== "—")) return false;
    const pin = weekTourney(week);
    if (pin && live.event.start !== pin.start) return false;
    return !live.players.some(p => p.name === name);
  }

  // Withdrawal replacements: any golfer not already picked who hasn't teed off,
  // in the same slot (hot for a hot, dawg for a dawg)
  function notTeedOff(name) {
    const p = live.players.find(x => x.name === name);
    if (!p) return false;
    if (live.players.every(x => !x.posText || x.posText === "—")) return true; // tournament hasn't started
    return !(live.event && live.event.round > 1) && !p.thru && (!p.toPar || p.toPar === "" ) && p.pos < 999;
  }
  function swapOptions(week, kind) {
    const taken = new Set(C.entriesOf(weekOf(week).picks).map(e => e.name));
    return golfers.filter(g => !taken.has(g.name) && (kind === "hot") === !!g.hot && notTeedOff(g.name)).sort((a, b) => a.rank - b.rank);
  }
  function openSwap(week, who, oldName) {
    const e = C.entriesOf(weekOf(week).picks).find(x => x.who === who && x.name === oldName);
    if (!e) return;
    const opts = swapOptions(week, e.kind);
    const ov = document.createElement("div");
    ov.className = "hd-ov";
    ov.innerHTML = `<button class="hd-x" aria-label="Close">✕</button>
      <div class="card" style="max-width:520px;margin:0 auto">
        <h2>Replace ${esc(oldName)}</h2>
        <p class="hint">${esc(oldName)} withdrew. Pick any ${e.kind === "hot" ? "🔥 hot" : "🐶 dawg"} who hasn't teed off and isn't already taken.</p>
        ${opts.length ? opts.slice(0, 60).map(g => `<div class="rule" data-swapto="${esc(g.name)}" style="cursor:pointer"><span style="flex:1"><b>${esc(g.name)}</b><br>
          <span class="hint" style="margin:0">World No. ${g.rank >= 999 ? "—" : g.rank}${g.odds ? ` · ${esc(g.odds)}` : ""}</span></span><b>Pick ›</b></div>`).join("")
          : `<p><b>Nobody eligible is left.</b> Ask ${esc(config.commissioner || "Race")} to sort it out.</p>`}
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector(".hd-x").onclick = () => ov.remove();
    let armed = null;
    ov.querySelectorAll("[data-swapto]").forEach(el => el.onclick = async () => {
      const n = el.dataset.swapto;
      if (armed !== n) { armed = n; ov.querySelectorAll("[data-swapto] b:last-child").forEach(b => b.textContent = "Pick ›"); el.querySelector("b:last-child").textContent = "Tap to confirm"; return; }
      await loadWeek(week);
      const cur = ((weekOf(week).picks || {})[who] || {})[e.kind];
      if (cur !== oldName) { ov.remove(); return toast("That pick already changed."); }
      if (!isWD(week, oldName)) { ov.remove(); return toast(`${oldName} hasn't withdrawn, so that pick stays.`); }
      if (!notTeedOff(n)) return toast(`${n} has already teed off. Pick someone who hasn't.`);
      if (C.entriesOf(weekOf(week).picks).some(x => x.name === n)) return toast(`${n} was just taken. Pick another.`);
      await write("week", week, { picks: { [who]: { [e.kind]: n } }, swaps: { [oldName]: { m: who, to: n, kind: e.kind, at: Date.now(), by: me } } });
      ov.remove();
      toast(`🔁 ${n} replaces ${oldName}. Back in business.`);
    });
  }

  // ===================== Eagle confetti =====================
  let snap = {}, snapEvent = null;
  function confetti(title, sub) {
    if (reduced()) { toast(`${title} ${sub}`); return; }
    const icons = ["🌭", "🥚", "🍺", "⛳", "🦅", "🎉", "🌭"];
    for (let k = 0; k < 70; k++) {
      const d = document.createElement("div");
      d.className = "cf";
      d.textContent = icons[k % icons.length];
      d.style.left = Math.random() * 100 + "vw";
      d.style.animationDuration = (2.2 + Math.random() * 2) + "s";
      d.style.animationDelay = Math.random() * .8 + "s";
      d.style.fontSize = (18 + Math.random() * 18) + "px";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 5200);
    }
    const b = document.createElement("div");
    b.className = "cf-banner";
    b.innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 3300);
    if (navigator.vibrate) try { navigator.vibrate([60, 40, 60, 40, 120]); } catch (e) {}
  }
  function watchEagles() {
    if (!live.event || live.event.final || !dataReady) return;
    const key = live.event.name + live.event.start;
    if (snapEvent !== key) { snapEvent = key; snap = {}; }
    const entries = C.entriesOf(weekOf(currentWeek()).picks);
    const next = {};
    for (const e of entries) {
      const p = live.players.find(x => x.name === e.name);
      if (!p || !p.toPar) continue;
      const score = C.parsePar(p.toPar), thru = p.thru === "F" ? 18 : (parseInt(p.thru, 10) || 0);
      next[e.name] = [score, thru];
      const prev = snap[e.name];
      if (prev && thru === prev[1] + 1 && prev[0] - score >= 2 && prev[0] - score <= 3) {
        const big = prev[0] - score >= 3;
        const mineTxt = e.who === me ? "Your" : `${e.who}'s`;
        confetti(big ? "🤯 ALBATROSS!" : "🦅 EAGLE!", `${e.name} (${mineTxt} ${e.kind}) on hole ${thru}. Now ${p.toPar}.`);
      }
    }
    snap = next;
  }
  setInterval(() => { if (!document.hidden) watchEagles(); }, 5000);

  // ===================== Cards on Home and in the Clubhouse =====================
  function homeCards() {
    const out = [];
    const myWD = C.entriesOf(weekOf(currentWeek()).picks).filter(e => e.who === me && isWD(currentWeek(), e.name));
    if (myWD.length) out.push(`<div class="card hd-hero hot" id="hdWDCard"><div class="hd-kicker">Withdrawal</div>
      <div class="hd-headline">⚠️ ${esc(myWD[0].name)} withdrew</div>
      <p class="hint" style="margin:0">Pool rule: you can replace him with any ${myWD[0].kind} who hasn't teed off yet.</p>
      <button class="btn" style="background:#fff;color:var(--ink)" data-fun="swap" data-name="${esc(myWD[0].name)}">Pick a replacement</button></div>`);
    const ow = owing();
    const mine = ow.find(([m]) => m === me);
    if (ow.length) out.push(`<div class="card" ${mine ? `style="border-color:var(--red)"` : ""}>
      <h2>🥚🍺 Outstanding egg beers</h2>
      <p style="margin:4px 0 8px;font-weight:800">${ow.map(([m, n]) => `${esc(m)} (${n})`).join(" · ")}</p>
      ${mine ? `<p class="hint" style="color:var(--red);margin:0 0 8px"><b>That's you.</b> Crack, pour, chug, post the proof.</p>` : `<p class="hint" style="margin:0 0 8px">The court is waiting.</p>`}
      <button class="btn ${mine ? "" : "ghost"}" data-fun="court">${mine ? "Post my proof 📸" : "See the Egg Beer Court"}</button></div>`);
    const hw = latestSettled();
    if (hw) {
      let read = 0; try { read = Number(localStorage.getItem("hd-herald-read")) || 0; } catch (e) {}
      const h = weekOf(hw).settle;
      out.push(`<div class="card hd-paper" data-fun="herald" data-w="${hw}" style="cursor:pointer;background:#f6f0e1;font-family:Georgia,serif">
        <div style="display:flex;align-items:center;gap:10px"><span style="font-size:34px">📰</span>
        <span style="flex:1"><b style="font-size:17px">The Hotdawg Herald</b>${read < hw ? ` <span class="hd-new">NEW</span>` : ""}<br>
        <span class="hint" style="margin:0;font-style:italic">Week ${wk(hw)} edition: "${esc(h.winner)} ${read < hw ? "makes the front page" : "on the front page"}"</span></span><b>›</b></div></div>`);
    }
    return out.join("");
  }
  function clubCards() {
    const weeks = [];
    for (let w = currentWeek(); w >= seasonStart(); w--) if (settled(w)) weeks.push(w);
    return `<div class="card" id="wrappedCard" style="background:linear-gradient(140deg,#d92b2b,#f2b33d);color:#fff">
        <h2 style="color:#fff">🎁 Hotdawgs Wrapped</h2>
        <p style="margin:4px 0 10px;font-weight:700">Your season as a story: money, your best long shot, your nemesis, your curse and your pool personality.</p>
        ${weeks.length ? `<button class="btn" data-fun="wrapped" style="background:#fff;color:var(--ink)">Play my Wrapped ▶</button>` : `<p class="hint" style="color:#fff;margin:0">Unlocks after the first week is settled.</p>`}
      </div>
      ${eggCourtCard()}
      ${weeks.length ? `<div class="card"><h2>📰 Herald archive</h2>${weeks.map(w => `<div class="rule" data-fun="herald" data-w="${w}" style="cursor:pointer">
        <span style="width:60px;font-weight:900">Wk ${wk(w)}</span><span style="flex:1;font-family:Georgia,serif;font-style:italic">${esc(weekOf(w).settle.winner)} wins${weekTourney(w) ? ` the ${esc(short(weekTourney(w).name))}` : ""}</span><b>›</b></div>`).join("")}</div>` : ""}`;
  }
  function wire(root) {
    root.querySelectorAll("[data-fun]").forEach(el => el.onclick = () => {
      const a = el.dataset.fun;
      if (a === "herald") openHerald(Number(el.dataset.w));
      if (a === "wrapped") openWrapped(me);
      if (a === "swap") openSwap(currentWeek(), me, el.dataset.name);
      if (a === "court") { const b = document.querySelector('.hd-tabbar [data-tab="clubhouse"]'); if (b) b.click(); setTimeout(() => { const c = document.getElementById("eggCourt"); if (c) c.scrollIntoView({ behavior: "smooth" }); }, 300); }
    });
    wireEgg(root);
  }

  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    loadNeg();
    const active = document.querySelector("section.active");
    const id = active && active.id;
    if (id === "home") {
      const wrap = document.getElementById("homeWrap");
      const hero = wrap && wrap.querySelector(".hd-hero:not(.hot)") || (wrap && wrap.querySelectorAll(".card")[0]);
      if (wrap && !wrap.querySelector("#hdFunHome")) {
        const box = document.createElement("div");
        box.id = "hdFunHome";
        box.innerHTML = homeCards();
        const heroCard = [...wrap.querySelectorAll(".card.hd-hero")].pop();
        (heroCard || hero) ? (heroCard || hero).after(box) : wrap.prepend(box);
        wire(box);
        // A withdrawal is urgent: put it above everything else
        const wd = box.querySelector("#hdWDCard"), first = wrap.querySelector(".card");
        if (wd && first && first !== wd) first.before(wd);
      }
    }
    if (id === "clubhouse") {
      const wrap = document.getElementById("clubWrap");
      if (wrap && !wrap.querySelector("#hdFunClub")) {
        const box = document.createElement("div");
        box.id = "hdFunClub";
        box.innerHTML = clubCards();
        wrap.prepend(box);
        wire(box);
      }
    }
  };

  window.HD = Object.assign(window.HD || {}, { isWD, swapOptions, openSwap, notTeedOff, openHerald, openWrapped, lastPlace, eggDebts, confetti, watchEagles, settledWeek: settled, entriesWithPos });
})();


/* ===== records.js ===== */
;// Record book (all-time, every season) and new-season rollover.
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


/* ===== watch.js ===== */
;// Where to watch: TV, streaming and radio for this week's tournament.
// The schedule comes from the PGA Tour (saved in field.json by the "Update field"
// task). Shows "on now" on Home and the full week on the Live tab. Times are in
// your phone's time zone. Load after home.js.

(function () {
  const style = document.createElement("style");
  style.textContent = `
    .tv-now { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 2px solid var(--shadow); border-radius: 12px;
      background: var(--cream); margin-top: 8px; text-decoration: none; color: var(--ink); }
    .tv-now.live { background: #fff; box-shadow: 2px 2px 0 var(--shadow); }
    .tv-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); flex: none; animation: tvPulse 1.2s ease-in-out infinite; }
    @keyframes tvPulse { 50% { opacity: .3; transform: scale(.7); } }
    .tv-net { font-weight: 900; }
    .tv-day { margin-top: 12px; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: var(--red-dark); }
    .tv-row { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--bun); font-size: 14px; align-items: baseline; }
    .tv-row:last-child { border-bottom: 0; }
    .tv-row .t { width: 118px; flex: none; font-variant-numeric: tabular-nums; opacity: .8; }
    .tv-row a { color: var(--ink); font-weight: 900; }
    .tv-row.on { background: #fff4c8; border-radius: 8px; padding: 6px 6px; }
    .wx { margin-top: 10px; }
    .wx-h { font-size: 12px; font-weight: 800; opacity: .85; margin-bottom: 6px; }
    .wx-days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .wx-d { display: flex; flex-direction: column; align-items: center; gap: 1px; background: var(--cream); border: 2px solid var(--shadow); border-radius: 12px;
      padding: 6px 2px; font-size: 13px; color: var(--ink); }
    .wx-i { font-size: 22px; line-height: 1.2; }
    .wx-s { font-size: 11.5px; opacity: .85; }
    .wx-s small { opacity: .7; }
    .wx-bad { color: var(--red); font-weight: 900; opacity: 1; }
    .wx-tip { font-size: 12.5px; font-weight: 700; margin-top: 6px; }
    .tv-tag { font-size: 11px; font-weight: 900; background: var(--red); color: #fff; border-radius: 999px; padding: 1px 7px; margin-left: 4px; }
  `;
  document.head.appendChild(style);

  const ICON = { TV: "📺", "Featured groups": "🎥", "Featured holes": "🎥", "Live stream": "🎥", Radio: "📻" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const isToday = (ms) => new Date(ms).toDateString() === new Date().toDateString();
  const link = (w, label) => w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(label || w.network)}</a>` : esc(label || w.network);

  let fieldFile = null, loadedAt = 0;
  async function load() {
    if (Date.now() - loadedAt < 30 * 60000) return;
    loadedAt = Date.now();
    try {
      const r = await fetch("field.json?v=" + Date.now(), { cache: "no-store" });
      if (r.ok) { fieldFile = await r.json(); renderActive(); }
    } catch (e) {}
  }
  function thisEvent() {
    if (!fieldFile) return null;
    const t = weekTourney(currentWeek()) || (live.event ? { start: live.event.start } : null);
    return t && (fieldFile.events || []).find(x => x.start === t.start) || null;
  }

  // ---------- Course weather (Open-Meteo, free, no key) ----------
  const WMO = (c) => c === 0 ? ["☀️", "Sunny"] : c <= 2 ? ["🌤️", "Partly cloudy"] : c === 3 ? ["☁️", "Cloudy"] : c <= 48 ? ["🌫️", "Fog"]
    : c <= 57 ? ["🌦️", "Drizzle"] : c <= 67 ? ["🌧️", "Rain"] : c <= 77 ? ["🌨️", "Snow"] : c <= 82 ? ["🌧️", "Showers"] : ["⛈️", "Storms"];
  let wx = null, wxKey = "", wxAt = 0;
  async function loadWeather() {
    const e = thisEvent(), p = e && e.where;
    if (!p || p.lat == null) return;
    const key = `${p.lat},${p.lon},${e.start}`;
    if (key === wxKey && Date.now() - wxAt < 60 * 60000) return;
    wxKey = key; wxAt = Date.now();
    const start = new Date(e.start + "T12:00:00Z");
    const d = (n) => { const x = new Date(start); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max`
      + `&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&start_date=${d(0)}&end_date=${d(3)}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const j = await r.json();
      const days = (j.daily && j.daily.time || []).map((t, i) => ({ date: t, code: j.daily.weather_code[i], hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i],
        rain: j.daily.precipitation_probability_max[i], wind: j.daily.wind_speed_10m_max[i], gust: j.daily.wind_gusts_10m_max[i] })).filter(x => x.hi != null);
      wx = { place: p, days, now: j.current || null };
      renderActive();
    } catch (err) { /* forecast is a nice-to-have */ }
  }
  function weatherTip(days) {
    if (!days.length) return "";
    const windy = days.filter(x => x.wind >= 18 || x.gust >= 28).length, wet = days.filter(x => x.rain >= 50).length;
    if (windy >= 2) return "💨 Windy week. Coach Frank likes grinders and low ball hitters; scores stay high.";
    if (wet >= 2) return "🌧️ Soft and wet. Bombers love it, and watch for delays and a Monday finish.";
    if (days.every(x => x.wind < 10 && x.rain < 30)) return "🎯 Calm and dry. Expect a birdie-fest; the putters decide this one.";
    return "";
  }
  function weatherStrip(compact) {
    if (!wx || !wx.days.length) return "";
    const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "short" });
    const tip = weatherTip(wx.days);
    return `<div class="wx">
      <div class="wx-h">🌤️ Course weather · ${esc(wx.place.city)}${wx.place.state ? ", " + esc(wx.place.state) : ""}${wx.now ? ` · now ${Math.round(wx.now.temperature_2m)}° ${WMO(wx.now.weather_code)[0]} 💨${Math.round(wx.now.wind_speed_10m)} mph` : ""}</div>
      <div class="wx-days">${wx.days.map(x => `<div class="wx-d"><b>${day(x.date)}</b><span class="wx-i" title="${WMO(x.code)[1]}">${WMO(x.code)[0]}</span>
        <span>${Math.round(x.hi)}°/${Math.round(x.lo)}°</span><span class="wx-s">💧${x.rain ?? 0}%</span><span class="wx-s ${x.wind >= 18 || x.gust >= 28 ? "wx-bad" : ""}">💨${Math.round(x.wind)}${x.gust >= x.wind + 6 ? `<small>/${Math.round(x.gust)}</small>` : ""}</span></div>`).join("")}</div>
      ${tip && !compact ? `<div class="wx-tip">${tip}</div>` : tip && compact ? `<div class="wx-tip">${tip.split(".")[0]}.</div>` : ""}
    </div>`;
  }

  function windows() {
    if (!fieldFile) return [];
    const e = thisEvent();
    return ((e && e.watch) || []).slice().sort((a, b) => a.start - b.start);
  }
  function state() {
    const ws = windows(), now = Date.now();
    if (!ws.length) return null;
    const on = ws.filter(w => w.start <= now && now < w.end).sort((a, b) => (a.kind === "Radio") - (b.kind === "Radio") || (a.kind === "TV" ? -1 : 1));
    const next = ws.filter(w => w.start > now && w.kind !== "Radio")[0] || ws.filter(w => w.start > now)[0];
    const over = ws.every(w => w.end <= now);
    return { ws, on, next, over };
  }
  const nowRow = (w) => `<a class="tv-now live" href="${esc(w.url || "#")}" target="_blank" rel="noopener">
      <span class="tv-dot"></span><span style="flex:1"><span class="tv-net">${esc(w.network)}</span> · ${esc(w.kind)}<br>
      <span class="hint" style="margin:0">Live now until ${time(w.end)}</span></span><b>Watch ›</b></a>`;
  const nextRow = (w) => `<div class="tv-now"><span style="font-size:20px">${ICON[w.kind] || "📺"}</span>
      <span style="flex:1"><b>Next:</b> ${link(w)} · ${esc(w.kind)}<br><span class="hint" style="margin:0">${isToday(w.start) ? "Today" : new Date(w.start).toLocaleDateString([], { weekday: "short" })} ${time(w.start)}–${time(w.end)}</span></span></div>`;

  function homeCard() {
    const s = state();
    if (!s || s.over) return "";
    return `<div class="card" id="tvHome"><h2>📺 Where to watch</h2>
      ${s.on.length ? s.on.slice(0, 2).map(nowRow).join("") : `<p class="hint" style="margin:0">Nothing on right now.</p>`}
      ${!s.on.length && s.next ? nextRow(s.next) : ""}
      ${wx && wx.now ? `<p class="hint" style="margin:8px 0 0">At the course: ${Math.round(wx.now.temperature_2m)}° ${WMO(wx.now.weather_code)[0]} ${WMO(wx.now.weather_code)[1].toLowerCase()}, wind ${Math.round(wx.now.wind_speed_10m)} mph</p>` : ""}
      <button class="btn ghost" style="margin-top:10px" data-tv="all">TV schedule and weather</button></div>`;
  }
  function fullCard() {
    const s = state();
    if (!s) return `<div class="card" id="tvFull"><h2>📺 Where to watch</h2><p class="hint">The TV and streaming schedule shows up here once the PGA Tour posts it, usually early in tournament week.</p>${weatherStrip(false)}</div>`;
    const now = Date.now();
    const byDay = {};
    s.ws.forEach(w => { const d = day(w.start); (byDay[d] = byDay[d] || []).push(w); });
    const nets = [...new Set(s.ws.filter(w => w.kind !== "Radio").map(w => w.network))];
    return `<div class="card" id="tvFull"><h2>📺 Where to watch</h2>
      <p class="hint" style="margin:0 0 6px">This week: ${nets.map(n => `<b>${esc(n)}</b>`).join(", ") || "see below"}. Times are your local time.</p>
      ${s.on.length ? s.on.map(nowRow).join("") : s.next ? nextRow(s.next) : ""}
      ${Object.entries(byDay).map(([d, list]) => `<div class="tv-day">${esc(d)}${list.some(w => w.round) ? ` · Round ${list.find(w => w.round).round}` : ""}</div>
        ${list.map(w => { const on = w.start <= now && now < w.end, past = w.end <= now;
          return `<div class="tv-row ${on ? "on" : ""}" style="${past ? "opacity:.45" : ""}"><span class="t">${time(w.start)}–${time(w.end)}</span>
          <span style="flex:1">${ICON[w.kind] || "📺"} ${link(w)} <span class="hint" style="margin:0">· ${esc(w.kind)}</span>${on ? `<span class="tv-tag">LIVE</span>` : ""}</span></div>`; }).join("")}`).join("")}
      ${weatherStrip(false)}
      <p class="hint" style="margin-top:10px">Featured groups streams follow a few top groups all day. Schedule from the PGA Tour; networks can change it late.</p></div>`;
  }

  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    load();
    loadWeather();
    const active = document.querySelector("section.active");
    const id = active && active.id;
    if (id === "home") {
      const wrap = document.getElementById("homeWrap");
      if (wrap && !wrap.querySelector("#tvHome")) {
        const html = homeCard();
        if (html) {
          const box = document.createElement("div");
          box.innerHTML = html;
          const el = box.firstElementChild;
          const hero = [...wrap.querySelectorAll(".card.hd-hero")].pop();
          hero ? hero.after(el) : wrap.prepend(el);
          el.querySelector("[data-tv=all]").onclick = () => {
            const b = document.querySelector('.hd-tabbar [data-tab="live"]'); if (b) b.click();
            setTimeout(() => { const c = document.getElementById("tvFull"); if (c) c.scrollIntoView({ behavior: "smooth" }); }, 300);
          };
        }
      }
    }
    if (id === "scores") {
      const sec = document.getElementById("scores");
      const old = document.getElementById("tvFull");
      const box = document.createElement("div");
      box.innerHTML = fullCard();
      const card = document.getElementById("tourneyCard");
      if (old) old.replaceWith(box.firstElementChild);
      else if (card) card.after(box.firstElementChild);
      else sec.appendChild(box.firstElementChild);
    }
  };
  window.HD = Object.assign(window.HD || {}, { watchWindows: windows, weatherStrip, loadWeather });
  // Keep "on now" fresh while the app sits open
  setInterval(() => { if (!document.hidden && dataReady) { const a = document.querySelector("section.active"); if (a && (a.id === "home" || a.id === "scores")) renderActive(); } }, 60000);
})();


/* ===== party.js ===== */
;// Watch party: watch the tournament together on FaceTime + SharePlay, with the app
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
            ${r.mine.map(e => `<span class="g">${e.kind === "hot" ? "🔥" : "🐶"} ${esc(e.name)} <span class="wp-sc ${scoreCls(e.p && e.p.toPar)}">${e.p ? `${esc(e.p.posText)} ${esc(e.p.toPar || "")}${e.p.thru ? ` (${esc(e.p.thru)})` : ""}` : "—"}</span></span>`).join("<br>")}</span></div>`).join("")}
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

  window.HD = Object.assign(window.HD || {}, { openParty, closeParty, startParty, watchingNow });
})();


/* ===== tips.js ===== */
;// Hotdawgs tips: guided tour, NEW badges on tabs, one-time feature tips,
// and a talking mascot. Load last, after extras.js.
// Each phone remembers what it has already seen, so tips don't repeat.

(function () {
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("hd-tips-" + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("hd-tips-" + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ===================== Styles and animations =====================
  const style = document.createElement("style");
  style.textContent = `
    .hd-badge { display: inline-block; margin-left: 4px; padding: 1px 5px; font-size: 9px; font-weight: 900;
      border-radius: 999px; background: var(--mustard); color: var(--ink); border: 1.5px solid var(--shadow);
      vertical-align: top; animation: hdBadge 1.6s ease-in-out infinite; }
    nav button.active .hd-badge { background: #fff; }
    @keyframes hdBadge { 0%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-3px) rotate(-8deg); } 60% { transform: translateY(0) rotate(6deg); } }

    .hd-spot { position: fixed; z-index: 90; border-radius: 16px; pointer-events: none;
      box-shadow: 0 0 0 9999px rgba(43,27,16,.72); transition: all .35s cubic-bezier(.3,1.3,.5,1);
      outline: 4px solid var(--mustard); animation: hdSpot 1.4s ease-in-out infinite; }
    @keyframes hdSpot { 0%, 100% { outline-offset: 2px; } 50% { outline-offset: 8px; } }
    .hd-block { position: fixed; inset: 0; z-index: 89; }

    .hd-bubble { position: fixed; z-index: 91; left: 14px; right: 14px; max-width: 420px; margin: 0 auto;
      background: var(--paper); border: 3px solid var(--shadow); border-radius: 16px; box-shadow: 5px 5px 0 var(--shadow);
      padding: 14px; display: flex; gap: 12px; align-items: flex-start; animation: hdPop .45s cubic-bezier(.3,1.6,.5,1); }
    @keyframes hdPop { from { transform: scale(.6) translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
    .hd-bubble .hd-dog { width: 54px; flex: none; animation: hdWiggle 1.8s ease-in-out infinite; transform-origin: bottom center; }
    @keyframes hdWiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-10deg); } 50% { transform: rotate(8deg); } 75% { transform: rotate(-4deg); } }
    .hd-bubble h3 { margin: 0 0 4px; font-family: "Rockwell", Georgia, serif; font-size: 17px; color: var(--red-dark); }
    .hd-bubble p { margin: 0; font-size: 14px; line-height: 1.35; }
    .hd-bubble .hd-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
    .hd-bubble .hd-dots { flex: 1; font-size: 11px; opacity: .6; font-weight: 800; }

    .hd-ring { animation: hdRing 1.1s ease-in-out 4 !important; }
    @keyframes hdRing { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,194,51,.9); } 50% { box-shadow: 0 0 0 10px rgba(255,194,51,0); } }


    .hd-coachbtn { position: fixed; right: 12px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 70;
      width: 64px; height: 74px; border: 0; background: transparent; padding: 0; cursor: pointer;
      animation: hdPeek .8s cubic-bezier(.3,1.6,.5,1) both, hdBob 3.2s ease-in-out 1s infinite; }
    .hd-coachbtn svg { width: 100%; height: 100%; filter: drop-shadow(2px 3px 0 rgba(43,27,16,.35)); }
    .hd-coachbtn span { position: absolute; left: -54px; top: 14px; background: var(--ink); color: #fff; font-size: 11px; font-weight: 900;
      padding: 4px 8px; border-radius: 999px; white-space: nowrap; animation: hdPop .5s 1.2s both; }
    @keyframes hdPeek { from { transform: translateY(110px) rotate(10deg); } to { transform: none; } }
    @keyframes hdBob { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-5px) rotate(-3deg); } }
    .hd-coach-hide { display: none; }
    .hd-tourbtn { margin-top: 10px; }
    #mascot { cursor: pointer; }
  `;
  document.head.appendChild(style);

  // Coach Frank Furter: the pool's veteran hot dog golf pro.
  // Red visor, white mustache, whistle, clipboard, and a club in his gloved hand.
  const COACH_SVG = (cls) => `<svg class="${cls}" viewBox="0 0 130 150" aria-hidden="true">
    <line x1="104" y1="60" x2="122" y2="128" stroke="#8A8A8A" stroke-width="4" stroke-linecap="round"/>
    <path d="M118 126 L128 124 L126 134 L114 134 Z" fill="#B9B9B9" stroke="#2B1B10" stroke-width="2"/>
    <line x1="88" y1="78" x2="104" y2="60" stroke="#2B1B10" stroke-width="5" stroke-linecap="round"/>
    <line x1="40" y1="80" x2="20" y2="92" stroke="#2B1B10" stroke-width="5" stroke-linecap="round"/>
    <rect x="97" y="52" width="15" height="13" rx="5" fill="#FFFFFF" stroke="#2B1B10" stroke-width="2"/>
    <rect x="4" y="82" width="22" height="28" rx="3" fill="#C98B4B" stroke="#2B1B10" stroke-width="2"/>
    <rect x="8" y="88" width="14" height="18" fill="#FFFFFF"/>
    <line x1="10" y1="93" x2="20" y2="93" stroke="#2B1B10" stroke-width="1.5"/>
    <line x1="10" y1="98" x2="18" y2="98" stroke="#2B1B10" stroke-width="1.5"/>
    <rect x="11" y="79" width="8" height="5" rx="1" fill="#8A8A8A"/>
    <line x1="54" y1="118" x2="49" y2="140" stroke="#2B1B10" stroke-width="5" stroke-linecap="round"/>
    <line x1="76" y1="118" x2="81" y2="140" stroke="#2B1B10" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="45" cy="142" rx="9" ry="4.5" fill="#2B1B10"/><ellipse cx="85" cy="142" rx="9" ry="4.5" fill="#2B1B10"/>
    <rect x="39" y="22" width="52" height="96" rx="26" fill="#C9302C" stroke="#2B1B10" stroke-width="3"/>
    <path d="M40 34 Q65 22 90 34 L90 40 Q65 30 40 40 Z" fill="#D92B2B" stroke="#2B1B10" stroke-width="2.5"/>
    <path d="M38 40 Q65 30 92 40 Q100 44 104 48 Q78 40 52 44 Q42 45 38 40 Z" fill="#9E1B1B" stroke="#2B1B10" stroke-width="2.5"/>
    <path d="M47 52 Q53 47 59 52" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
    <path d="M71 52 Q77 47 83 52" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="54" cy="58" rx="3.5" ry="4.5" fill="#2B1B10"/><ellipse cx="76" cy="58" rx="3.5" ry="4.5" fill="#2B1B10"/>
    <path d="M65 68 Q55 64 46 72 Q54 77 65 72 Q76 77 84 72 Q75 64 65 68 Z" fill="#FFFFFF" stroke="#2B1B10" stroke-width="2"/>
    <path d="M57 77 Q65 83 73 77" fill="none" stroke="#2B1B10" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M50 84 Q65 96 80 84" fill="none" stroke="#FFC233" stroke-width="2"/>
    <rect x="61" y="92" width="10" height="7" rx="2" fill="#B9B9B9" stroke="#2B1B10" stroke-width="1.5"/>
    <path d="M16 104 Q16 90 40 90 L90 90 Q114 90 114 104 Q114 120 90 120 L40 120 Q16 120 16 104 Z" fill="#E9A24A" stroke="#2B1B10" stroke-width="3"/>
    <path d="M24 106 Q34 99 44 106 T64 106 T84 106 T104 106" fill="none" stroke="#FFC233" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`;
  const DOG = COACH_SVG("hd-dog");

  // ===================== Speech bubble =====================
  let bubble = null;
  function closeBubble() { if (bubble) { bubble.remove(); bubble = null; } }
  // Place a bubble above or below a target element (or at the bottom if none)
  function showBubble({ title, text, target, buttons, dots }) {
    closeBubble();
    bubble = document.createElement("div");
    bubble.className = "hd-bubble";
    bubble.innerHTML = `${DOG}<div style="flex:1;min-width:0">
      ${title ? `<h3>${title}</h3>` : ""}<p>${text}</p>
      <div class="hd-row"><span class="hd-dots">${dots || ""}</span>${buttons.map((b, i) => `<button class="btn small ${b.ghost ? "ghost" : ""}" data-i="${i}">${b.label}</button>`).join("")}</div></div>`;
    document.body.appendChild(bubble);
    bubble.querySelectorAll("[data-i]").forEach(el => el.onclick = () => buttons[Number(el.dataset.i)].onClick());
    placeBubble(target);
    bubble._at = Date.now();
    return bubble;
  }
  function placeBubble(target) {
    if (!bubble) return;
    const vh = window.innerHeight;
    if (!target) { bubble.style.top = ""; bubble.style.bottom = "24px"; return; }
    const r = target.getBoundingClientRect();
    const h = bubble.offsetHeight;
    const below = r.bottom + 14 + h < vh - 10;
    bubble.style.bottom = "";
    bubble.style.top = (below ? r.bottom + 14 : Math.max(10, r.top - h - 14)) + "px";
  }

  // ===================== Guided tour =====================
  const STEPS = [
    { tab: "home", sel: null, title: "Welcome to the Clubhouse, kid 🌭",
      text: "Coach Frank Furter here, forty years teaching hot dogs to golf. Grandma asked me to show you around, and you don't say no to Grandma. Quick lesson?" },
    { tab: "home", sel: ".hd-hero", title: "Your home base",
      text: "This card changes all week. On draft day it tells you when you're up, during the tournament it shows your odds, and after Sunday it tells you who pays who." },
    { tab: "home", sel: ".hd-tabbar", title: "Five holes, one course",
      text: "Home, Draft, Live, Money and the Clubhouse. A pulsing dot means something needs you. NEW stickers mean stuff you haven't found yet." },
    { tab: "draft", sel: "#boardCard", title: "The draft board",
      text: "Snake draft, two rounds, first pick rotates weekly. When you're on the clock it turns red. You'll feel it, like a hockey check from behind." },
    { tab: "draft", sel: "#nudgeBtn", title: "The Nudge button",
      text: "Somebody napping on the clock? Tap this and the group chat does the heckling for you." },
    { tab: "scores", sel: "#tourneyCard", title: "Live scores",
      text: "ESPN scores for every pick land here. Once the tournament tees off, a Sweat Meter shows everyone's odds. Go find your happy place." },
    { tab: "payments", sel: "#paymentsWrap .card", title: "Settle up",
      text: "Who won, who owes, and a one-tap Venmo button. Pay on time and nobody has to call you Shooter." },
    { tab: "stats", sel: "#statsWrap .card", title: "Receipts for the trash talk",
      text: "Season money, who's paid who the most, best long-shot picks, and every week's history." },
    { tab: "clubhouse", sel: "#clubWrap .card", title: "The Clubhouse",
      text: "Trophy cards to share, season awards, head-to-head rivalries. This is where legends get made, Chubbs-style." },
    { tab: "clubhouse", sel: "#camIn", title: "Ketchup Cam 📸",
      text: "Post your hot dog setup and vote on everyone else's. Best dog wins bragging rights. Mustard is not optional." },
    { tab: "settings", sel: "#settingsWrap .card", title: "Your locker",
      text: "Tap your initial in the top corner anytime to get here. Your name, Venmo, and a button to replay this lesson live here. That's the whole course. Now go draft like Grandma's watching." }
  ];
  let tour = null; // { i, spot, block, timer }
  const visible = (el) => el && (el.offsetParent !== null || el.getClientRects().length);
  function targetFor(step) {
    if (!step.sel) return null;
    let el = document.querySelector(step.sel);
    if (el && el.type === "file") el = el.closest("label") || el;
    return visible(el) ? el : null;
  }
  function spotOn(el) {
    if (!tour) return;
    if (!el) { tour.spot.style.cssText = "top:50%;left:50%;width:0;height:0;outline:none"; return; }
    const r = el.getBoundingClientRect(), pad = 6;
    tour.spot.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${Math.min(r.height + pad * 2, window.innerHeight * .55)}px`;
  }
  function goTab(id) {
    const b = document.querySelector(`nav [data-tab="${id}"]`);
    if (b && !b.classList.contains("active")) b.click();
  }
  function showStep(i) {
    if (!tour) return;
    // Skip steps whose feature isn't on screen right now (except the welcome)
    while (i < STEPS.length && i > 0) {
      goTab(STEPS[i].tab);
      if (STEPS[i].sel === null || document.querySelector(STEPS[i].sel)) break;
      i++;
    }
    if (i >= STEPS.length) { endTour(true); return; }
    tour.i = i;
    const step = STEPS[i];
    goTab(step.tab);
    setTimeout(() => {
      if (!tour) return;
      const el = targetFor(step);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => {
        if (!tour) return;
        spotOn(el);
        const last = i === STEPS.length - 1;
        showBubble({
          title: step.title, text: step.text, target: el,
          dots: `${i + 1} of ${STEPS.length}`,
          buttons: i === 0
            ? [{ label: "Not now", ghost: true, onClick: () => endTour(false) }, { label: "Let's go ⛳", onClick: () => showStep(1) }]
            : [{ label: "Skip", ghost: true, onClick: () => endTour(true) }, { label: last ? "Relish it 🌭" : "Next", onClick: () => last ? endTour(true) : showStep(i + 1) }]
        });
      }, el ? 380 : 50);
    }, 260);
  }
  function startTour() {
    if (tour) return;
    closeCoach();
    const spot = document.createElement("div"); spot.className = "hd-spot";
    const block = document.createElement("div"); block.className = "hd-block";
    document.body.append(block, spot);
    tour = { i: 0, spot, block };
    // Keep the spotlight on target if the page redraws or scrolls
    tour.timer = setInterval(() => { if (tour) { const el = targetFor(STEPS[tour.i]); spotOn(el); placeBubble(el); } }, 600);
    showStep(0);
  }
  function endTour(done) {
    if (!tour) return;
    clearInterval(tour.timer);
    tour.spot.remove(); tour.block.remove();
    tour = null;
    closeBubble();
    store.set("tour", done ? "done" : "later");
    goTab("home");
    if (done) toast("Lesson's over. Keep your head down and your bun up 🌭");
  }

  // Start the tour once, after a new member finishes setup (name + Venmo)
  setInterval(() => {
    if (tour || store.get("tour") || !me || !(config.venmo || {})[me]) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    startTour();
  }, 2500);

  // ===================== NEW badges on tabs =====================
  const BADGE_TABS = ["live", "money", "clubhouse"];
  const tabBar = () => document.querySelector(".hd-tabbar") || document.querySelector("nav");
  function paintBadges() {
    const seen = store.get("seenTabs") || [];
    BADGE_TABS.forEach(t => {
      const b = tabBar().querySelector(`[data-tab="${t}"]`);
      if (!b) return;
      const has = b.querySelector(".hd-badge");
      if (!seen.includes(t) && !has) b.insertAdjacentHTML("beforeend", `<span class="hd-badge">NEW</span>`);
      if (seen.includes(t) && has) has.remove();
    });
  }
  tabBar().addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    const seen = store.get("seenTabs") || [];
    if (!seen.includes(b.dataset.tab)) { seen.push(b.dataset.tab); store.set("seenTabs", seen); }
    paintBadges();
  });
  paintBadges();

  // ===================== One-time feature tips =====================
  // The first time each feature shows up on this phone, Coach Frank points it out.
  const COACH = [
    { key: "nudge", sel: "#nudgeBtn", title: "Psst, the Nudge", text: "Tap this and the group chat gets a poke telling the next person they're up. Polite-ish." },
    { key: "sweat", sel: "#tourneyCard .bar", title: "Sweat Meter 😰", text: "Live odds of who wins the week, updated with every score. Breathe. Happy place." },
    { key: "grades", sel: "#gradesBtn", title: "Draft grades are in 📝", text: "Everyone's draft got graded and roasted. Post them to the chat if you're feeling brave." },
    { key: "payText", sel: "#payTextBtn", title: "Tournament's over 🏁", text: "One tap sends the payouts to the group, tagging everyone who owes. Shooter hated this button." },
    { key: "condolence", sel: "#condolenceBtn", title: "A bad beat happened 😢", text: "Someone's lead melted on Sunday. Send condolences. Or don't. Grandma would." },
    { key: "fillLive", sel: "#fillLiveBtn:not([disabled])", title: "Skip the typing", text: "This copies every pick's finish straight from the live leaderboard. Check it, then tap Calculate." },
    { key: "trophy", sel: "[data-trophy]", title: "Trophy card unlocked 🏆", text: "Make a shareable champion card for the group chat. Frame it for Grandma." },
    { key: "cam", sel: "#camIn", title: "Ketchup Cam 📸", text: "Snap your hot dog setup. Everyone votes, best dog wins the week." },
    { key: "react", sel: "[data-react]", title: "Talk some trash 🤡", text: "Tap any pick on the board to drop a reaction. Clown emoji encouraged for bad picks." },
    { key: "herald", sel: "[data-fun=herald]", title: "Extra! Extra! 📰", text: "Every finished week gets a front page in the Hotdawg Herald. Screenshot it for the group chat." },
    { key: "wrapped", sel: "[data-fun=wrapped]", title: "Your season, the movie 🎁", text: "Hotdawgs Wrapped tells the story of your season. Spoiler: you have a nemesis." },
    { key: "court", sel: "#eggCourt", title: "Egg Beer Court is in session ⚖️", text: "Finish last and you owe the group an egg beer. Photo proof required. I don't make the rules. Okay, I do." },
    { key: "focus", sel: "[data-focus]", title: "Tap a name", text: "See who that person has paid the most, and who's paid them. Great for grudges." }
  ];
  let coach = null;
  function closeCoach() { if (coach) { clearTimeout(coach.timer); coach.el && coach.el.classList.remove("hd-ring"); coach = null; closeBubble(); } }
  function checkCoach() {
    if (tour || coach || bubble || !store.get("tour")) return;
    const shown = store.get("coach") || [];
    for (const c of COACH) {
      if (shown.includes(c.key)) continue;
      let el = document.querySelector(c.sel);
      if (el && el.type === "file") el = el.closest("label") || el;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue; // only when it's on screen
      shown.push(c.key); store.set("coach", shown);
      el.classList.add("hd-ring");
      showBubble({ title: c.title, text: c.text, target: el, buttons: [{ label: "Got it", onClick: closeCoach }] });
      coach = { el, timer: null }; // stays until you tap "Got it" or tap elsewhere
      return;
    }
  }
  // Tips stay put until you dismiss them: "Got it", or a tap anywhere else
  // (ignored for the first moment so the tap that opened it doesn't close it)
  document.addEventListener("pointerdown", (e) => {
    if (!bubble || tour || bubble.contains(e.target) || Date.now() - (bubble._at || 0) < 800) return;
    if (coach) closeCoach(); else closeBubble();
  }, true);
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; checkCoach(); }, 700);
  }).observe(document.getElementById("appArea"), { childList: true, subtree: true });
  window.addEventListener("scroll", () => { if (!tour) setTimeout(checkCoach, 300); }, { passive: true });

  // ===================== Talking mascot =====================
  const TIPS = [
    "Tap me anytime for a tip. Forty years of coaching, and I still work for mustard.",
    "Dawgs beating hots pay more. Grandma always roots for the underdog.",
    "Ties go to the worse-ranked golfer. Respect the dawg.",
    "Stats live under the Money tab. Receipts for every grudge.",
    "Paying late is a Shooter move. Tap Mark paid after you Venmo.",
    "The Sweat Meter shows up once the tournament tees off. Hydrate.",
    "Trophy cards live in the Clubhouse. Every champ deserves a gold jacket. Or a bun.",
    "Ketchup Cam voting is serious business. Mustard gets bonus points from me.",
    "Lost a lead on Sunday? Bad beats get a memorial on the Live tab.",
    "Your best pick history is on Stats. Long shots that cashed rise to the top.",
    "Chubbs would want you to draft with your heart. And maybe check the rankings.",
    "Want the full lesson again? Tap your initial in the top corner.",
    "Coach Frank's rule one: relish the moment. Rule two: pay your Venmo."
    ,"Mustard up, kid. Nobody ever won a pool playing scared."
    ,"Forty years on tour and I've never seen anyone chug an egg beer gracefully. Prove me wrong."
    ,"Never draft right after an egg beer. Your judgment's scrambled."
    ,"Lose a bad beat on Sunday? Egg beer. Win the pool? Egg beer. See the pattern?"
  ];
  function coachTip(target) {
    if (tour) return;
    closeCoach();
    const i = (store.get("tipIdx") || 0) % TIPS.length;
    store.set("tipIdx", i + 1);
    showBubble({ title: "Coach Frank says…", text: TIPS[i], target, buttons: [{ label: "Thanks, Coach", onClick: closeBubble }] });
  }
  const mascot = document.getElementById("mascot");
  if (mascot) mascot.addEventListener("click", () => {
    mascot.classList.remove("hop"); void mascot.getBBox(); mascot.classList.add("hop");
    setTimeout(() => mascot.classList.remove("hop"), 1600);
    coachTip(mascot);
  });
  const coachBtn = document.createElement("button");
  coachBtn.className = "hd-coachbtn";
  coachBtn.setAttribute("aria-label", "Ask Coach Frank for a tip");
  coachBtn.innerHTML = COACH_SVG("") + (store.get("askedCoach") ? "" : "<span>Ask Coach</span>");
  coachBtn.onclick = () => {
    store.set("askedCoach", true);
    const label = coachBtn.querySelector("span"); if (label) label.remove();
    coachBtn.animate([{ transform: "rotate(0)" }, { transform: "rotate(-14deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0)" }], { duration: 500 });
    coachTip(null);
  };
  document.body.appendChild(coachBtn);
  // Hide him on the password screen and during the tour
  setInterval(() => {
    const gate = document.getElementById("gate");
    coachBtn.classList.toggle("hd-coach-hide", !!tour || (gate && !gate.hidden));
  }, 500);
  // Mix a few tips into the rotating footer
  if (typeof JOKES !== "undefined" && JOKES.footer) {
    JOKES.footer.push("Tip: tap Coach Frank in the corner for advice. He's chatty.", "Tip: a pulsing dot on a tab means something needs you.");
  }

  // ===================== Replay button on the Me tab =====================
  const meWrap = document.getElementById("settingsWrap");
  new MutationObserver(() => {
    if (document.getElementById("hdTourBtn")) return;
    const firstCard = meWrap.querySelector(".card");
    if (!firstCard) return;
    firstCard.insertAdjacentHTML("beforeend", `<button class="btn ghost hd-tourbtn" id="hdTourBtn">Take the tour again ⛳</button>`);
    document.getElementById("hdTourBtn").onclick = () => { store.set("tour", null); startTour(); };
  }).observe(meWrap, { childList: true });
})();


/* ===== settle.js ===== */
;// Smooth rendering. Lots of things refresh the screen in the background (live
// scores, the 10-second pick check, weather, who's watching). Rebuilding the page
// replays the pop-in animations, which looked like the controls blinking.
//  - Background refreshes are batched (one redraw per ~150ms) and skip the pop-in animations.
//  - Anything right after you tap or type redraws immediately, with animations.
// Load last.

(function () {
  const style = document.createElement("style");
  style.textContent = `
    html.hd-quiet section.active, html.hd-quiet .hd-hero, html.hd-quiet .slot.filled,
    html.hd-quiet .hd-cam-pop, html.hd-quiet .hd-rpick { animation: none !important; }
  `;
  document.head.appendChild(style);

  let lastTouch = 0;
  ["pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));
  const userDriven = () => Date.now() - lastTouch < 1200;

  const realRender = renderActive;
  let timer = null, quietTimer = null;
  function paint(quiet) {
    clearTimeout(quietTimer);
    if (quiet) document.documentElement.classList.add("hd-quiet");
    else document.documentElement.classList.remove("hd-quiet");
    const y = window.scrollY;
    window.__hdPaints = (window.__hdPaints || 0) + 1;
    realRender();
    if (quiet && Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); // keep your place
    if (quiet) quietTimer = setTimeout(() => document.documentElement.classList.remove("hd-quiet"), 400);
  }
  renderActive = function () {
    if (userDriven()) { clearTimeout(timer); timer = null; return paint(false); }
    if (timer) return;
    timer = setTimeout(() => { timer = null; paint(true); }, 150);
  };
  window.HD = Object.assign(window.HD || {}, { renderNow: () => { clearTimeout(timer); timer = null; paint(false); } });
})();
