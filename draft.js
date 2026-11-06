// Hotdawgs draft order: 2-round snake draft with a rotating first pick.
// Week 1 starts with the first member, week 2 with the second, and so on.
// Round 1 goes in order, round 2 goes in reverse. Each member ends with one hot and one dawg.
// This file replaces the draft screen from index.html, so it must load after the main script.

(function () {
  let lastClock = null;     // who was on the clock last render, to alert the next person
  let justPickedWeek = null; // after you pick, offer to nudge the next person

  const appLink = () => location.origin + location.pathname;

  function draftOrder(week) {
    const n = MEMBERS.length;
    const s = (week - 1) % n;
    return MEMBERS.slice(s).concat(MEMBERS.slice(0, s));
  }
  function slots(week) {
    const o = draftOrder(week);
    return o.concat(o.slice().reverse());
  }
  function picksOf(week, m) {
    const p = (weekOf(week).picks || {})[m] || {};
    return (p.hot ? 1 : 0) + (p.dawg ? 1 : 0);
  }
  // A member's 1st slot is filled once they have 1 pick, their 2nd once they have 2
  function draftState(week) {
    const s = slots(week), seen = {};
    let clock = -1;
    const board = s.map((m, i) => {
      seen[m] = (seen[m] || 0) + 1;
      const nth = seen[m];
      const done = picksOf(week, m) >= nth;
      if (!done && clock < 0) clock = i;
      return { m, i, nth, round: i < MEMBERS.length ? 1 : 2, done };
    });
    return { board, clock, onClock: clock >= 0 ? s[clock] : null, complete: clock < 0, total: s.length };
  }
  // Which golfer went in a member's 1st or 2nd slot
  function slotPick(week, m, nth) {
    const p = (weekOf(week).picks || {})[m] || {};
    const first = p.first || (p.hot ? "hot" : "dawg");
    const kind = nth === 1 ? first : (first === "hot" ? "dawg" : "hot");
    return p[kind] ? { name: p[kind], kind } : null;
  }

  window.HD = Object.assign(window.HD || {}, { draftState, draftOrder });

  async function nudge(who, week, st) {
    const text = who === null
      ? `🌭 Week ${week} draft is done! Picks are in: ${appLink()}`
      : `🌭 @${who} you're on the clock! Week ${week} draft, pick ${st.clock + 1} of ${st.total}. Make your pick: ${appLink()}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { return; }
    }
    location.href = "sms:&body=" + encodeURIComponent(text);
  }

  function ensureBoard() {
    let b = document.getElementById("boardCard");
    if (!b) {
      b = document.createElement("div");
      b.className = "card";
      b.id = "boardCard";
      const dc = document.getElementById("draftCard");
      dc.insertBefore(b, dc.firstChild);
    }
    return b;
  }

  async function draftPick(g) {
    const week = currentWeek();
    const kind = g.hot ? "hot" : "dawg";
    if (!confirm(`Draft ${g.name} as your ${kind}?`)) return;
    // Re-read the latest picks so two people can't grab the same golfer
    try {
      const { data } = await sb.from("pool_weeks").select("data").eq("week", week).maybeSingle();
      if (data) weekDocs[week] = data.data;
    } catch (e) {}
    const st = draftState(week);
    if (st.onClock !== me) { toast("It's not your turn anymore."); renderActive(); return; }
    if (claimedMap(week)[g.name]) { toast(`${g.name} was just taken.`); renderActive(); return; }
    const mine = (weekOf(week).picks || {})[me] || {};
    if (mine[kind]) { toast(`You already have your ${kind}. Pick a ${kind === "hot" ? "dawg" : "hot"}.`); return; }
    const entry = { [kind]: g.name };
    if (!mine.hot && !mine.dawg) entry.first = kind;
    await write("week", week, { picks: { [me]: entry } });
    justPickedWeek = week;
    celebrate();
  }

  renderDraft = function () {
    renderSetup();
    if (!me) { $("#draftCard").hidden = true; return; }
    $("#draftCard").hidden = false;
    const week = currentWeek();
    const st = draftState(week);
    const mine = (weekOf(week).picks || {})[me] || {};
    const myTurn = st.onClock === me;
    const need = mine.hot && mine.dawg ? null : (!mine.hot && !mine.dawg ? "either" : (!mine.hot ? "hot" : "dawg"));

    // Alert when it becomes your turn while the app is open
    if (st.onClock !== lastClock) {
      if (myTurn && lastClock !== null) {
        toast("🌭 You're on the clock!");
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
      lastClock = st.onClock;
    }

    // ----- Draft board -----
    const board = ensureBoard();
    const row = (s) => {
      const p = s.done ? slotPick(week, s.m, s.nth) : null;
      const now = s.i === st.clock;
      return `<div class="rule" style="${now ? "background:var(--mustard);border-radius:10px;padding:8px;" : ""}">
        <span style="width:26px;font-weight:900">${s.i + 1}</span>
        <span style="flex:1">${s.m}${s.m === me ? " (you)" : ""}</span>
        <span class="hint" style="margin:0">${p ? `${p.name} · ${p.kind === "hot" ? "🔥" : "🐶"}` : (now ? "On the clock" : "")}</span>
      </div>`;
    };
    let banner;
    if (st.complete) {
      banner = `<div class="big">Draft complete ✓</div>`;
    } else if (myTurn) {
      banner = `<div style="background:var(--red);color:#fff;border:3px solid var(--shadow);border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:900">🌭 You're on the clock!</div>
        <div>Pick ${st.clock + 1} of ${st.total}: draft your ${need === "either" ? "hot or dawg" : need}.</div></div>`;
    } else {
      banner = `<div class="big">On the clock: ${st.onClock}</div>
        <div class="hint">Pick ${st.clock + 1} of ${st.total}</div>`;
    }
    const justPicked = justPickedWeek === week && !myTurn;
    const nudgeBtn = st.complete
      ? `<button class="btn ghost" id="nudgeBtn">Tell the group the draft is done 💬</button>`
      : (!myTurn ? `<button class="btn ${justPicked ? "" : "ghost"}" id="nudgeBtn">${justPicked ? `Your pick is in. Text ${st.onClock} they're up 💬` : `Nudge ${st.onClock} in the group chat 💬`}</button>` : "");
    board.innerHTML = `
      <h2>Week ${week} draft order</h2>
      ${banner}
      ${nudgeBtn}
      <p class="hint" style="margin-top:14px">Round 1</p>
      ${st.board.filter(s => s.round === 1).map(row).join("")}
      <p class="hint" style="margin-top:12px">Round 2 (reverse order)</p>
      ${st.board.filter(s => s.round === 2).map(row).join("")}
      <p class="hint" style="margin-top:10px">First pick rotates each week. Next week ${draftOrder(week + 1)[0]} picks first.</p>`;
    const nb = document.getElementById("nudgeBtn");
    if (nb) nb.onclick = () => { justPickedWeek = null; nudge(st.complete ? null : st.onClock, week, st); renderDraft(); };

    // ----- Your picks -----
    $("#draftTitle").innerHTML = `Your picks<small>${need ? (myTurn ? "Your turn" : "Waiting for your turn") : "Both picks in"}</small>`;
    fillSlot($("#slotHot"), mine.hot, "Hot", "Pick a top 10");
    fillSlot($("#slotDawg"), mine.dawg, "Dawg", "Pick a field golfer");

    // ----- Golfer list -----
    if (myTurn && (need === "hot" || need === "dawg") && filter !== need) {
      filter = need;
      document.querySelectorAll(".chip[data-filter]").forEach(x => x.classList.toggle("on", x.dataset.filter === need));
    }
    const taken = claimedMap(week);
    const list = $("#golferList");
    list.innerHTML = myTurn
      ? `<p class="hint">Tap a golfer to draft them.</p>`
      : `<p class="hint">${need ? `Browse while you wait. You can pick when it's your turn.` : "You're done this week. Browse the field below."}</p>`;
    golfers.filter(g => (filter === "hot") === g.hot).forEach(g => {
      const owner = taken[g.name];
      const isMine = mine.hot === g.name || mine.dawg === g.name;
      const el = document.createElement("div");
      el.className = "golfer" + (isMine ? " selected" : "") + (owner && owner !== me ? " taken" : "");
      el.innerHTML = `<div><div>${g.name}</div><div class="rank">${g.rank < 999 ? "World #" + g.rank : "Unranked"}</div></div>`
        + (owner ? `<span class="owner">${owner === me ? "You ✓" : owner}</span>` : "");
      el.onclick = () => {
        if (owner) { if (owner !== me) toast(`${g.name} is already taken by ${owner}`); return; }
        if (!myTurn) { toast(st.complete ? "The draft is done for this week." : `Not your turn yet. ${st.onClock} is on the clock.`); return; }
        const kind = g.hot ? "hot" : "dawg";
        if (mine[kind]) { toast(`You already have your ${kind}. Pick a ${kind === "hot" ? "dawg" : "hot"}.`); return; }
        draftPick(g);
      };
      list.appendChild(el);
    });

    // Picks save one at a time now, so the old two-pick button isn't needed
    $("#submitBtn").hidden = true;
  };

  // ----- Payout alert when the tournament ends -----
  // Adds a box to the top of the tournament card once ESPN marks the event final.
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
        <p class="hint" style="margin:4px 0 0">Payouts aren't set yet. Fill in the results and calculate the winner.</p>
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
         <p class="hint" style="margin:4px 0 0">${owing.length} still owe ${money(per)} each: ${owing.join(", ")}.</p>
         <button class="btn" id="payTextBtn">Text payouts to the group 💬</button>`
      : `<div style="font-size:18px;font-weight:900">🏁 ${s.winner} won ${money(per * payers.length)}. Everyone's paid 🎉</div>`;
    el.insertBefore(box, el.firstChild);
    const btn = document.getElementById("payTextBtn");
    if (btn) btn.onclick = async () => {
      const text = `🌭 Week ${w} is final! ${s.winner} wins ${money(per * payers.length)}. `
        + `${owing.map(p => "@" + p).join(" ")} each owe ${money(per)}. Pay on Venmo in the app: ${appLink()}`;
      if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} return; }
      location.href = "sms:&body=" + encodeURIComponent(text);
    };
  };

  // Redraw with the new draft screen if the app has already started
  try { renderActive(); } catch (e) {}
})();
