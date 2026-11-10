// Hotdawgs fun pack:
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
