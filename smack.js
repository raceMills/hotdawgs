// Talk smack: one tap writes a trash-talk text based on where things stand right now.
//  - You're in first: you brag.
//  - Someone else is: you go after them (and their golfers).
// "First" means: who'd win if it ended now (during play), this week's winner (once
// settled), or the season money leader (before play starts). Sent with the iPhone
// share sheet, so you pick the group chat.
// Load after party.js and calm.js, before tips.js and settle.js.

(function () {
  const C = HDCore;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const emo = (k) => k === "hot" ? "🔥" : "🌭";
  const last = (n) => String(n || "").split(" ").slice(-1)[0];

  // ---------- Where things stand ----------
  function situation() {
    const w = currentWeek(), doc = weekOf(w);
    const entries = C.entriesOf(doc.picks);
    const find = (n) => live.players.find(p => p.name === n);
    const golfersOf = (m) => entries.filter(e => e.who === m).map(e => Object.assign({}, e, { p: find(e.name) }))
      .sort((a, b) => ((a.p && a.p.pos) || 999) - ((b.p && b.p.pos) || 999));
    const sixteen = entries.map(e => Object.assign({}, e, { p: find(e.name) })).filter(e => e.p && (e.p.hole === 16 || e.p.hole === 17 && e.p.thru === "16"));
    // Week settled
    if (doc.settle && doc.settle.winner) {
      const per = (doc.settle.rules || []).reduce((s, id) => s + C.amountFor(id, config.amounts), 0);
      return { phase: "final", leader: doc.settle.winner, per, total: per * (MEMBERS.length - 1), golfersOf, sixteen };
    }
    // During play
    const st = HD.liveStandings ? HD.liveStandings() : null;
    const playing = live.event && live.players.some(p => p.posText && p.posText !== "—");
    if (st && playing && entries.length) {
      const leader = st.winner || (st.rows[0] && st.rows[0].m);
      const place = 1 + st.rows.findIndex(r => r.m === me);
      return { phase: "live", leader, per: st.per, total: st.per * (MEMBERS.length - 1), golfersOf, place, of: st.rows.length, round: live.event.round, sixteen };
    }
    // Before play: season money leader, else the draft
    const season = HD.seasonData ? HD.seasonData() : null;
    const board = season ? Object.values(season.stats).sort((a, b) => b.net - a.net) : [];
    const top = board[0] && board[0].net > 0 ? board[0] : null;
    return { phase: "pre", leader: top ? top.m : null, net: top ? top.net : 0, myNet: season && season.stats[me] ? season.stats[me].net : 0, golfersOf, drafted: entries.length > 0, sixteen };
  }

  // ---------- The lines ----------
  const PUTTING = [
    "{g} is about to jam it in her lag hole.",
    "{g} is lagging it in her jam hole. Textbook.",
    "Watch {g} on the greens: lag it in her jam hole, then jam it in her lag hole. Fundamentals."
  ];
  const PUTT_MISS = [
    "{g} tried to jam it in her lag hole and lagged it in nobody's hole.",
    "{g} couldn't lag it in her jam hole if the hole was a hula hoop."
  ];
  const SIXTEEN = [
    "🚨 {g} is on 16. Shirts off, boys. You know the rules.",
    "{g} just reached 16. Somewhere a Hotdawg is already shirtless on the tee.",
    "16 tee is coming up for {g}. Shirtless tee shot or forfeit your egg beer rights."
  ];
  // Group lore
  function lore(s, t) {
    const out = [
      `Hold it together like you're on a barstool. Nobody craps their pants on the barstool. Nobody.`,
      `Deep breaths. Pretend you're on a barstool and keep it together. We've all seen what happens when you don't.`,
      `Still a safer bet than riding shotgun in a golf cart with Race. Ask Ryan.`,
      `This leaderboard hurts worse than Brian serenading us with his guitar at 1am.`,
      `Somebody cue up Brian on the guitar. This performance deserves a slow, painful ballad.`,
      `I'd rather sit through a full Brian guitar set than watch this leaderboard.`
    ];
    if (s.leader && s.leader !== me) out.push(`@${s.leader}, Brian is already writing a sad song about your lead. Acoustic. Four verses.`);
    if (s.leader === me) out.push(`Brian, grab the guitar. Victory serenade for the leader. Take requests from nobody.`);
    if (t === "Race") out.push(`@Race is leading? The man nearly killed Ryan crashing a golf cart and now he's crashing the leaderboard.`,
      `Race in first is scarier than Race behind the wheel of a golf cart. Ryan, buckle up.`);
    if (me === "Race" && t !== "Race") out.push(`I'm driving this pool like I drive a golf cart: fast, reckless, and Ryan should hold on.`);
    if (t === "Ryan") out.push(`@Ryan survived Race's golf cart crash just to get run over on this leaderboard.`,
      `Ryan, you've had a near-death experience in a golf cart. Losing this week won't even register.`);
    if (me === "Ryan") out.push(`I survived Race's golf cart. I can survive this leaderboard.`);
    if (s.phase === "live" && t && t !== me) out.push(`@${t}, sitting in first must feel like a barstool after six beers. Hold it together, don't crap your pants.`);
    return pick(out);
  }
  function brag(s) {
    const mine = s.golfersOf(me), best = mine[0];
    const g = best ? `${emo(best.kind)} ${best.name}` : "my guys";
    const pos = best && best.p ? best.p.posText : "";
    const list = s.phase === "final" ? [
      `🏆 Final. I won. $${s.per} from each of you, $${s.total} total. Venmo me like Happy's grandma's house depends on it.`,
      `🌭 Cash me outside. $${s.total} from the boys. I'll be drinking it as egg beers.`,
      `🥚🍺 Winner winner, egg beer dinner. ${g} carried me. Pay up, Shooters.`,
      `I'm the Happy Gilmore of this pool and you're all Shooter McGavin. $${s.per} each. Now.`
    ] : s.phase === "live" ? [
      `📈 If it ended right now: me, $${s.total}. ${g} is ${pos}. Get comfortable in second, boys.`,
      `${g} is ${pos} and I'm already shopping for hot dog toppings with your money.`,
      `🥚🍺 I'm leading the pool. Cracking an egg beer in my own honor. ${g} on fire.`,
      `Happy's happy place was his grandma's house. Mine is first place in the Hotdawgs pool. ${g} ${pos}.`,
      `${g} is about to jam it in her lag hole and I'm about to jam $${s.per} out of each of your Venmos.`,
      `Coach Frank says don't celebrate early. Coach Frank isn't $${s.total} up. ${g} ${pos}.`
    ] : [
      `💰 Season money leader, checking in. +$${s.net}. Draft scared, boys.`,
      `+$${s.net} on the season. I'm the reason Venmo has a "request" button.`,
      `Top of the season standings and I haven't even taken my shirt off on 16 yet.`
    ];
    return pick(list);
  }
  function roast(s, t) {
    const theirs = s.golfersOf(t), best = theirs[0];
    const tg = best ? `${emo(best.kind)} ${best.name}` : "their guys";
    const tpos = best && best.p ? best.p.posText : "";
    const mine = s.golfersOf(me), myBest = mine[0];
    const mg = myBest ? `${emo(myBest.kind)} ${last(myBest.name)}` : "my guy";
    const list = s.phase === "final" ? [
      `Congrats @${t}. Enjoy the $${s.per}. Shooter McGavin also won a few. Nobody liked him either.`,
      `@${t} won the week. Lucky. Even the gopher gets a hole sometimes.`,
      `@${t} you won $${s.total} and you're still going to lag it in her jam hole next week. Mark my words.`,
      `Fine @${t}, $${s.per} is coming. Enjoy your egg beer. I hope the yolk breaks early.`
    ] : s.phase === "live" ? [
      `@${t} is leading with ${tg} (${tpos}). Bold of you to celebrate before the shirtless 16 tee shot, buddy.`,
      `@${t}, ${tg} is about to lag it in her jam hole from 4 feet. I can feel it.`,
      `Enjoy first place, @${t}. ${tg} has the nerve of a guy putting with a hockey stick.`,
      `@${t}, ${tg} is ${tpos} now. The alligator on 12 is hungry and ${last(best ? best.name : "")} looks like a snack.`,
      `@${t} is in first. Somebody tell ${tg} that Carl the groundskeeper has explosives.`,
      `@${t} you're winning with ${tg}? That's like winning the egg beer contest. Technically impressive, mostly gross.`,
      `${mg} is coming for you @${t}. Jam it in her lag hole, ${last(myBest ? myBest.name : "")}. Let's go.`,
      `@${t}, ${s.place && s.place > 1 ? `I'm ${["", "", "2nd", "3rd"][s.place] || s.place + "th"} and ` : ""}${mg} hasn't even taken his shirt off on 16 yet. Plenty of golf left.`
    ] : s.drafted ? [
      `@${t} you're the season money leader and you drafted like Shooter at a putting contest.`,
      `Hey @${t}, enjoy the top of the standings. Your picks this week can't lag it in a jam hole.`,
      `@${t}, nice season. It's about to end like Happy's first tee shot: in the parking lot.`
    ] : [
      `@${t}, you're up $${s.net} on the season. Enjoy it. Egg beers are on you when it's gone.`,
      `Season leader @${t}? The gopher also thought he was winning.`
    ];
    return pick(list);
  }
  function line() {
    const s = situation();
    let text;
    if (!s.leader) text = pick([
      "Nobody's winning yet, which means I'm technically tied for first. 🌭",
      "No leader yet. I'll be there soon. Ice the egg beers.",
      "All square. Shirts on for now, boys. 16 is coming."
    ]);
    else text = s.leader === me ? brag(s) : roast(s, s.leader);
    // At most one extra: 16-tee alert, group lore, or a putting jab
    const has = (re) => re.test(text);
    if (s.sixteen && s.sixteen.length && Math.random() < 0.6) {
      const e = s.sixteen[0];
      text += " " + pick(SIXTEEN).replace("{g}", `${emo(e.kind)} ${last(e.name)}`);
    } else if (Math.random() < 0.3) {
      text += " " + lore(s, s.leader);
    } else if (s.phase === "live" && !has(/hole/) && Math.random() < 0.3) {
      const targetG = (s.leader && s.leader !== me ? s.golfersOf(s.leader) : s.golfersOf(me))[0];
      if (targetG) text += " " + pick(s.leader === me ? PUTTING : PUTT_MISS).replace("{g}", last(targetG.name));
    }
    return text;
  }

  // ---------- The pop-up ----------
  function openSmack() {
    let text = line();
    const ov = document.createElement("div");
    ov.className = "hd-ov";
    ov.style.cssText = "display:flex;align-items:center;justify-content:center;padding:20px";
    const draw = () => {
      ov.innerHTML = `<div class="card" style="max-width:420px;width:100%;margin:0">
        <h2>🗣️ Talk smack</h2>
        <p style="font-size:17px;margin:6px 0 14px">“${esc(text)}”</p>
        <button class="btn" data-s="send">Send it 💬</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <button class="btn ghost" data-s="again" style="margin:0">🔄 Another one</button>
          <button class="btn ghost" data-s="close" style="margin:0">Cancel</button></div></div>`;
      ov.querySelector("[data-s=send]").onclick = () => { ov.remove(); HD.shareText(`🗣️ ${text}\n${location.origin + location.pathname}`); };
      ov.querySelector("[data-s=again]").onclick = () => { text = line(); draw(); };
      ov.querySelector("[data-s=close]").onclick = () => ov.remove();
    };
    draw();
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  // ---------- Buttons: Home (top card), Live tab, watch party ----------
  const btnHtml = `<button class="btn ghost hd-smack" style="margin-top:8px">🗣️ Talk smack</button>`;
  function addButtons() {
    const a = document.querySelector("section.active");
    const id = a && a.id;
    let host = null;
    if (id === "home") host = document.querySelector("#homeWrap > .card.hd-hero");
    if (id === "scores") host = document.getElementById("tourneyCard");
    if (host && !host.querySelector(".hd-smack")) {
      host.insertAdjacentHTML("beforeend", btnHtml);
      host.querySelector(".hd-smack").onclick = openSmack;
    }
    const wp = document.querySelector(".wp .wp-bar");
    if (wp && !wp.querySelector(".hd-smack-wp")) {
      wp.insertAdjacentHTML("afterbegin", `<button class="hd-smack-wp" title="Talk smack">🗣️</button>`);
      wp.querySelector(".hd-smack-wp").onclick = openSmack;
    }
  }
  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (me && dataReady) addButtons();
  };
  setInterval(() => { if (document.querySelector(".wp")) addButtons(); }, 2000);

  window.HD = Object.assign(window.HD || {}, { smackLine: line, openSmack });
})();
