// Hotdawgs extras: sweat meter, bad beats, draft grades, trophy cards,
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
    return MEMBERS.filter(m => m !== me && ph[m]).map(m => String(ph[m]).replace(/[^\d+]/g, "")).filter(n => n.length >= 10);
  }
  async function shareText(text) {
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
