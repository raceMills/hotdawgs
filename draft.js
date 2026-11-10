// Hotdawgs draft: 2-round snake with a rotating first pick (rules live in core.js).
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
  async function draftPick(g) {
    const week = currentWeek(), who = actor();
    const kind = g.hot ? "hot" : "dawg";
    const t = currentTourney();
    const forWho = who === me ? "your" : `${who}'s`;
    if (!confirm(`Draft ${g.name} as ${forWho} ${kind}${t ? ` for the ${splitName(t.name).main}` : ""}?`)) return;
    await loadWeek(week); // latest picks, so two people can't grab the same golfer
    const st = draftState(week);
    if (st.onClock !== who) { toast("That turn is over. Someone already picked."); renderActive(); return; }
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
          <span class="nm ${taken.has(C.compactKey(n)) ? "gone" : ""}">${n}</span>
          <button class="hd-mini" data-qup="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="hd-mini" data-qdown="${i}" ${i === q.length - 1 ? "disabled" : ""}>↓</button>
          <button class="hd-mini" data-qdel="${i}">✕</button></div>`).join("")
        : `<p class="hint" style="margin:0">Your queue is empty. Tap ☆ next to any golfer below.</p>`}
      ${next ? `<p class="hint" style="margin:10px 0 0">Next up for you: <b>${next.golfer.name}</b> ${next.fromQueue ? "(from your queue)" : "(best-ranked available)"}</p>` : ""}
      ${myTurn && next ? `<button class="btn" id="qPickBtn">Draft ${next.golfer.name}</button>` : ""}`;
    const move = (i, d) => { const a = q.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; setQueue(week, a); };
    card.querySelectorAll("[data-qup]").forEach(b => b.onclick = () => move(Number(b.dataset.qup), -1));
    card.querySelectorAll("[data-qdown]").forEach(b => b.onclick = () => move(Number(b.dataset.qdown), 1));
    card.querySelectorAll("[data-qdel]").forEach(b => b.onclick = () => { const a = q.slice(); a.splice(Number(b.dataset.qdel), 1); setQueue(week, a); });
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
      + `<p class="hint">${myTurn ? `Tap a golfer to draft ${proxy ? "for " + who : "them"}.` : need ? "Browse and star golfers for your queue. You can pick when it's your turn." : "You're done this week. Browse the field below."}${hasOdds ? " Odds to win are in teal." : ""}</p>`;
    golfers.filter(g => (filter === "hot") === g.hot).forEach(g => {
      const key = C.compactKey(g.name);
      const owner = owners[key];
      const isMine = mine.hot === g.name || mine.dawg === g.name;
      const qi = queued.indexOf(key);
      const el = document.createElement("div");
      el.className = "golfer" + (isMine ? " selected" : "") + (owner && owner !== who ? " taken" : "");
      el.innerHTML = `<div><div>${g.name}</div><div class="rank">${g.rank < 999 ? "World #" + g.rank : "Unranked"}${g.odds ? ` · <span class="hd-odds">${g.odds}</span>` : ""}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
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
