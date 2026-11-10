// Hotdawgs Home: a personal dashboard plus a 5-tab bottom bar.
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
      HD.shareText(`🌭 @${n.dataset.nudge} you're on the clock! Week ${wk(w)} draft, pick ${st.clock + 1} of ${st.total}. Make your pick: ${location.origin + location.pathname}`);
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
