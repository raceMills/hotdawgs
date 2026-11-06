// Hotdawgs Stats tab: season money leaderboard, who pays whom, best picks, and pick history.
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

    for (let w = 1; w <= currentWeek(); w++) {
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
            <span style="flex:1">${b.name} <span class="hint" style="margin:0">(${b.who}, week ${b.w}, ${b.kind})</span></span>
            <span class="hint" style="margin:0 8px 0 0">${b.rank < 999 ? "World #" + b.rank : "Unranked"} · ${ord(b.pos)}</span>
            <span class="amt">${money(b.won)}</span>
          </div>`).join("") : `<p class="hint">No winning picks yet. Check back after the first payout.</p>`}
      </div>

      <div class="card">
        <h2>Pick history</h2>
        ${history.length ? history.map(h => `
          <div class="wk">
            <div style="font-weight:900">Week ${h.w}${h.settle && h.settle.winner ? ` · ${h.settle.winner} won ${money(perPayerOf(h.settle) * (MEMBERS.length - 1))}` : " · not settled"}</div>
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
