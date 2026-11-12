// A calmer Home: the most important things first, at most three cards, and
// everything else tucked under "More this week". Also adds:
//  - My weekend: your two golfers live, and what's on the line if it ended now
//  - A one-time "turn on notifications" prompt (replaces the group-text setup nag)
// Runs after every other file that adds Home cards. Load before tips.js and settle.js.

(function () {
  const C = HDCore;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = { get(k) { try { return JSON.parse(localStorage.getItem("hd-calm-" + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("hd-calm-" + k, JSON.stringify(v)); } catch (e) {} } };

  const style = document.createElement("style");
  style.textContent = `
    .hd-more { margin: 4px 0 14px; }
    .hd-more > summary { list-style: none; cursor: pointer; text-align: center; font-weight: 900; padding: 10px; border: 3px dashed var(--bun);
      border-radius: 16px; color: var(--ink); background: var(--cream); }
    .hd-more > summary::-webkit-details-marker { display: none; }
    .hd-more[open] > summary { margin-bottom: 12px; }
    .hd-more .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--red); margin-left: 6px; vertical-align: middle; }
    .mw-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 2px dashed var(--bun); }
    .mw-row:last-of-type { border-bottom: 0; }
    .mw-pos { min-width: 54px; text-align: center; font-family: "Rockwell", Georgia, serif; font-weight: 900; font-size: 22px; }
    .mw-sc { font-variant-numeric: tabular-nums; font-weight: 900; }
    .mw-sc.under { color: var(--red); }
    .mw-line { margin: 10px 0 0; padding: 10px 12px; border-radius: 12px; font-weight: 800; }
    .mw-line.win { background: #e3f4e6; border: 2px solid #1f8a4c; }
    .mw-line.lose { background: #fdeaea; border: 2px solid var(--red); }
  `;
  document.head.appendChild(style);

  const started = () => live.event && live.players.some(p => p.posText && p.posText !== "—");
  const weekMatches = () => { const t = weekTourney(currentWeek()); return !t || !live.event || live.event.start === t.start; };

  // ---------- My weekend ----------
  function myWeekendCard() {
    if (!started() || !weekMatches() || (live.event && live.event.final)) return "";
    const mine = C.entriesOf(weekOf(currentWeek()).picks).filter(e => e.who === me);
    if (!mine.length) return "";
    const st = HD.liveStandings ? HD.liveStandings() : null;
    const rows = mine.map(e => Object.assign(e, { p: live.players.find(x => x.name === e.name) }))
      .sort((a, b) => (a.p ? a.p.pos : 999) - (b.p ? b.p.pos : 999));
    const place = st ? 1 + st.rows.findIndex(r => r.m === me) : 0;
    const line = !st || !st.winner ? "" : st.winner === me
      ? `<div class="mw-line win">💰 If it ended now, <b>you win $${st.per}</b> from everyone ($${st.per * (MEMBERS.length - 1)} total).</div>`
      : `<div class="mw-line lose">If it ended now, <b>${esc(st.winner)}</b> wins and you owe $${st.per}. You're ${place ? ["", "1st", "2nd", "3rd"][place] || place + "th" : "—"} of ${st.rows.length}.</div>`;
    const round = live.event.round ? `Round ${live.event.round}` : "Live";
    return `<div class="card hd-hero" id="hdMyWeekend">
      <div class="hd-kicker">My weekend · ${esc(round)}</div>
      ${rows.map(e => `<div class="mw-row"><span class="mw-pos">${e.p ? esc(e.p.posText) : "—"}</span>
        <span style="flex:1"><b>${e.kind === "hot" ? "🔥" : "🌭"} ${esc(e.name)}</b><br>
        <span class="hint" style="margin:0"><span class="mw-sc ${/^-/.test(e.p && e.p.toPar || "") ? "under" : ""}">${e.p && e.p.toPar ? esc(e.p.toPar) : "E"}</span>${e.p && HDCore.holeLabel(e.p) ? ` · <b>${esc(HDCore.holeLabel(e.p))}</b>` : ""}</span></span></div>`).join("")}
      ${line}
      <div class="wp-btns" style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn" style="margin:0" data-mw="board">Full leaderboard</button>
        <button class="btn ghost" style="margin:0" data-mw="party">🍿 Watch party</button></div></div>`;
  }

  // ---------- Notifications prompt ----------
  function notifyCard() {
    const ps = HD.pushState ? HD.pushState() : "unknown";
    if (ps === "on" || ps === "unknown" || ps === "unsupported" || store.get("notifyDismissed")) return "";
    const home = ps === "needs-home";
    return `<div class="card" id="hdNotify" style="border-color:var(--mustard)">
      <h2>🔔 Want a heads-up?</h2>
      <p style="margin:4px 0 10px">Get a ping when it's your pick, when your golfer makes a move, and when the week pays out. That's it. No spam.</p>
      ${home ? `<p class="hint" style="margin:0 0 10px">First add Hotdawgs to your Home Screen: in Safari tap <b>Share</b> → <b>Add to Home Screen</b>, then open it from there.</p>`
        : ps === "blocked" ? `<p class="hint" style="margin:0 0 10px">They're blocked right now. iPhone Settings → Notifications → Hotdawgs → Allow.</p>`
        : `<button class="btn" data-notify="on">Turn on pings</button>`}
      <button class="btn ghost" data-notify="no" style="margin-top:6px">Not now</button></div>`;
  }

  // ---------- One card for the week while it's live ----------
  // The live Home card (your chances, your golfers) absorbs the "where to watch"
  // card: what's on now, course weather, and the TV schedule button.
  function mergeTournament(wrap) {
    const hero = [...wrap.querySelectorAll(".card.hd-hero")].find(c => !c.classList.contains("hot") && c.querySelector('[data-go="scores"]'));
    const tv = wrap.querySelector("#tvHome");
    if (!hero || !tv) return;
    const watch = document.createElement("div");
    watch.className = "mw-watch";
    watch.style.cssText = "margin-top:12px;padding-top:10px;border-top:2px dashed var(--bun)";
    const nows = [...tv.querySelectorAll(".tv-now")];
    const wx = [...tv.querySelectorAll("p.hint")].find(p => /At the course/.test(p.textContent));
    if (!nows.length && !wx) return;
    watch.innerHTML = `<div class="hd-kicker" style="margin-bottom:2px">📺 Watch</div>`;
    nows.forEach(n => watch.appendChild(n));
    if (wx) { wx.style.margin = "8px 0 0"; watch.appendChild(wx); }
    const lb = hero.querySelector('[data-go="scores"]');
    lb.before(watch);
    const tvBtn = tv.querySelector("[data-tv=all]");
    const btns = document.createElement("div");
    btns.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px";
    lb.replaceWith(btns);
    lb.style.margin = "0";
    btns.appendChild(lb);
    if (tvBtn) { tvBtn.style.margin = "0"; tvBtn.textContent = "TV & weather"; btns.appendChild(tvBtn); }
    tv.remove();
  }

  // ---------- Arrange Home ----------
  function score(el) {
    const txt = el.textContent || "";
    if (el.id === "hdWDCard") return 100;
    if (el.classList.contains("hot") && el.querySelector("[data-go=settings]")) return 95; // add your Venmo
    if (el.id === "hdMyWeekend") return 92;
    if (el.classList.contains("hd-hero")) return document.getElementById("hdMyWeekend") ? 45 : 88; // My weekend covers the live sweat
    if (el.id === "hdNotify") return 80;
    if (/Outstanding egg beers/.test(txt)) return el.style.borderColor ? 75 : 30;
    if (el.id === "wpHome" && /Watching now/.test(txt)) return 70;
    if (el.querySelector("[data-fun=herald]") || el.dataset.fun === "herald") return /NEW/.test(txt) ? 65 : 20;
    if (el.id === "tvHome") return started() ? 55 : 35;
    if (el.id === "wpHome") return 40;
    if (/Ketchup Cam/.test(txt)) return el.querySelector(".hd-new, .hd-cam-pop") ? 50 : 25;
    if (el.id === "hdSetupTexts") return 10;
    if (/Your season/.test(txt)) return 22;
    if (/Your rival/.test(txt)) return 15;
    return 30;
  }
  function arrange() {
    const wrap = document.getElementById("homeWrap");
    if (!wrap || wrap.querySelector("#hdCalmDone")) return; // already arranged this render
    const mark = document.createElement("i"); mark.id = "hdCalmDone"; mark.hidden = true; wrap.appendChild(mark);
    // Unwrap boxes other files used to hold several cards
    [...wrap.children].forEach(el => {
      if (el.tagName === "DIV" && !el.classList.contains("card") && !el.classList.contains("hd-hello") && !el.classList.contains("hd-quick")
          && el.children.length && [...el.children].every(c => c.classList.contains("card"))) {
        [...el.children].forEach(c => el.before(c));
        if (el.id !== "hdFunHome") el.remove(); else el.hidden = true; // keep fun.js's marker so it doesn't re-add
      }
    });
    const hello = wrap.querySelector(".hd-hello");
    const add = (html) => { if (!html) return; const b = document.createElement("div"); b.innerHTML = html; wrap.appendChild(b.firstElementChild); };
    add(notifyCard());
    mergeTournament(wrap);
    // Group-text setup only nags once notifications are sorted
    const setup = wrap.querySelector("#hdSetupTexts");
    if (setup && wrap.querySelector("#hdNotify")) setup.remove();
    // Cards sit straight in Home, or alone inside a wrapper another file added
    const cards = [...wrap.children].filter(el => el.classList.contains("card"));
    const quick = wrap.querySelector(".hd-quick");
    const ranked = cards.map((el, i) => ({ el, s: score(el), i })).sort((a, b) => b.s - a.s || a.i - b.i);
    const keep = ranked.slice(0, 3), rest = ranked.slice(3);
    const anchor = hello ? hello : null;
    let prev = anchor;
    keep.forEach(({ el }) => { if (prev) prev.after(el); else wrap.prepend(el); prev = el; });
    if (rest.length) {
      const det = document.createElement("details");
      det.className = "hd-more";
      det.open = !!store.get("moreOpen");
      const fresh = rest.some(r => /NEW/.test(r.el.textContent) || r.el.querySelector(".hd-new"));
      det.innerHTML = `<summary>More this week (${rest.length})${fresh ? `<span class="dot"></span>` : ""}</summary>`;
      rest.sort((a, b) => b.s - a.s).forEach(({ el }) => det.appendChild(el));
      det.addEventListener("toggle", () => store.set("moreOpen", det.open));
      prev ? prev.after(det) : wrap.appendChild(det);
      if (quick) det.after(quick);
    }
    // Wrapper divs left empty by moving their cards

    wire(wrap);
  }
  function wire(wrap) {
    wrap.querySelectorAll("[data-mw]").forEach(b => b.onclick = () => {
      if (b.dataset.mw === "party" && HD.openParty) return HD.openParty();
      const t = document.querySelector('.hd-tabbar [data-tab="live"]'); if (t) t.click();
    });
    wrap.querySelectorAll("[data-notify]").forEach(b => b.onclick = async () => {
      if (b.dataset.notify === "no") { store.set("notifyDismissed", Date.now()); const c = document.getElementById("hdNotify"); if (c) c.remove(); return; }
      if (HD.turnOnPush) await HD.turnOnPush();
      renderActive();
    });
  }

  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    const a = document.querySelector("section.active");
    if (a && a.id === "home") arrange();
  };
  // "Not now" comes back after a week, in case they change their mind
  const d = store.get("notifyDismissed");
  if (d && Date.now() - d > 7 * 86400000) store.set("notifyDismissed", null);
})();
