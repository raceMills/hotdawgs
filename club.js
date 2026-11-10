// Hotdawgs club tools: phone notifications and the commissioner's toolbox.
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
        ${lp ? `<button class="btn ghost" data-club="undo">↩️ Undo last pick (${esc(lp.m)}: ${esc(lp.name)})</button>` : ""}
      </div>

      ${C.entriesOf(picks).length ? `
      <div class="field" style="margin-top:14px"><label>Fix a pick (withdrawals: anyone who hasn't teed off)</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="fixWho">${MEMBERS.filter(m => picks[m] && (picks[m].hot || picks[m].dawg)).map(m => `<option>${m}</option>`).join("")}</select>
          <select id="fixKind"><option value="hot">Hot</option><option value="dawg">Dawg</option></select>
        </div>
        <input id="fixName" list="fixList" placeholder="Replacement golfer" style="margin-top:6px">
        <datalist id="fixList">${golfers.filter(g => !taken.has(g.name) && (!HD.notTeedOff || HD.notTeedOff(g.name))).map(g => `<option value="${esc(g.name)}">`).join("")}</datalist>
        <button class="btn ghost" data-club="fix" style="margin-top:6px">Save fix</button></div>` : ""}

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
    if (what === "undo") {
      await loadWeek(w);
      const lp = lastPick(w);
      if (!lp || !confirmTap("undo")) return;
      const patch = { picks: { [lp.m]: { [lp.kind]: null } }, pickLog: { [lp.idx]: null }, draftOpenAt: Date.now() };
      if (!lp.other) patch.picks[lp.m].first = null;
      await write("week", w, patch);
      return toast(`↩️ Took back ${lp.name}. ${lp.m} is on the clock again.`);
    }
    if (what === "fix") {
      const who = $("#fixWho").value, kind = $("#fixKind").value, typed = $("#fixName").value.trim();
      const g = golfers.find(x => x.name.toLowerCase() === typed.toLowerCase());
      if (!g) return toast("Pick a golfer from the list.");
      if (C.entriesOf(weekOf(w).picks).some(e => e.name === g.name)) return toast(`${g.name} is already taken.`);
      $("#fixName").value = "";
      document.activeElement && document.activeElement.blur();
      await write("week", w, { picks: { [who]: { [kind]: g.name } } });
      return toast(`Fixed: ${who}'s ${kind} is now ${g.name}.`);
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
    return baseRender.apply(this, arguments);
  };

  window.HD = Object.assign(window.HD || {}, { pushState: () => subState, turnOnPush: turnOn });
})();
