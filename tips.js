// Hotdawgs tips: guided tour, NEW badges on tabs, one-time feature tips,
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
