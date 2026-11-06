// Hotdawgs form guide: each golfer's recent finishes, their history at this
// week's event, and last week's leaderboard, shown while drafting.
// Built from ESPN's scoreboard feed by asking for past tournament dates.
// Past results are cached on the phone, so each old tournament downloads once.
// Load after extras.js (before or after tips.js is fine).

(function () {
  const RECENT = 4;  // tournaments of recent form
  const YEARS = 3;   // years of history at this event

  const style = document.createElement("style");
  style.textContent = `
    .hd-form { font-size: 11px !important; opacity: .85 !important; margin-top: 2px; line-height: 1.35; }
    .hd-form b { font-weight: 900; }
    .hd-good { color: var(--green); font-weight: 900; }
    .hd-bad { color: var(--red); font-weight: 900; }
    .hd-chip { display: inline-block; padding: 0 5px; border-radius: 6px; background: var(--cream); border: 1px solid var(--bun); margin-right: 3px; }
  `;
  document.head.appendChild(style);

  // ----- Fetch and cache one tournament's final leaderboard by date -----
  const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem("hd-hist-" + k)); } catch (e) { return null; } };
  const cacheSet = (k, v) => { try { localStorage.setItem("hd-hist-" + k, JSON.stringify(v)); } catch (e) {} };
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; };

  function parseEvent(data) {
    const ev = (data.events || [])[0];
    const comp = ev && (ev.competitions || [])[0];
    if (!ev || !comp) return null;
    const done = !!(ev.status && ev.status.type && ev.status.type.completed);
    const players = (comp.competitors || []).map((c, i) => {
      const st = c.status || {};
      const posText = (st.position && st.position.displayName) || (c.order != null ? String(c.order) : "");
      const cut = /cut|wd|dq|mdf/i.test(posText) || /cut|wd|dq/i.test((st.type && st.type.name) || "");
      const n = parseInt(String(posText).replace(/\D/g, ""), 10);
      return {
        name: (c.athlete && (c.athlete.displayName || c.athlete.fullName)) || "",
        pos: cut ? 999 : (Number.isFinite(n) ? n : (c.order || i + 1)),
        posText: cut ? (/wd/i.test(posText) ? "WD" : "MC") : (posText || String(i + 1))
      };
    }).filter(p => p.name);
    return { name: ev.name || "", start: (ev.date || "").slice(0, 10), venue: (comp.venue && comp.venue.fullName) || "", done, players };
  }

  async function eventOn(date) {
    const key = ymd(date);
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
      const r = await fetch(`${LIVE_URL}?dates=${key}`, { cache: "no-store" });
      if (!r.ok) return null;
      const e = parseEvent(await r.json());
      if (e && e.done && e.players.length) cacheSet(key, e); // only cache finished events
      return e;
    } catch (err) { return null; }
  }

  // ----- Is a past event the same tournament as this week's? -----
  const GENERIC = new Set(["the", "championship", "open", "classic", "invitational", "tournament", "presented", "golf",
    "club", "national", "pro", "am", "challenge", "memorial", "players", "masters", "cup", "series", "world"]);
  const words = (s) => norm(s).split(" ").filter(w => w.length >= 4 && !GENERIC.has(w));
  function sameEvent(a, b) {
    if (!a || !b) return false;
    if (a.venue && b.venue) return norm(a.venue) === norm(b.venue);
    const wa = new Set(words(a.name));
    return words(b.name).some(w => wa.has(w)) || norm(a.name) === norm(b.name);
  }

  // ----- Build the form guide for this week -----
  let guide = { state: "idle", forKey: "", recent: [], course: [], lastWeek: null, byName: new Map() };

  async function buildGuide(cur) {
    const forKey = cur.name + cur.start;
    if (guide.forKey === forKey && guide.state !== "error") return;
    guide = { state: "loading", forKey, recent: [], course: [], lastWeek: null, byName: new Map() };

    // Recent tournaments: the last few schedule events that ended before this one
    const past = (live.calendar || []).filter(e => e.start && e.end && e.end < cur.start).sort((a, b) => b.start.localeCompare(a.start)).slice(0, RECENT);
    const recent = [];
    for (const e of past) {
      const ev = await eventOn(addDays(e.start, 1));
      if (ev && ev.players.length && ev.start !== cur.start) recent.push({ ...ev, label: e.name });
    }

    // This event in past years: same week last year, then a week either side
    const course = [];
    for (let y = 1; y <= YEARS; y++) {
      for (const shift of [0, 7, -7]) {
        const ev = await eventOn(addDays(cur.start, -364 * y + shift + 1));
        if (ev && ev.players.length && sameEvent(cur, ev)) { course.push({ ...ev, year: ev.start.slice(0, 4) }); break; }
      }
    }

    // Index by golfer
    const byName = new Map();
    const slot = (n) => { const k = nameKey(n); if (!byName.has(k)) byName.set(k, { recent: [], course: [] }); return byName.get(k); };
    recent.forEach((ev, i) => ev.players.forEach(p => { slot(p.name).recent[i] = p; }));
    course.forEach((ev, i) => ev.players.forEach(p => { slot(p.name).course[i] = p; }));

    guide = { state: recent.length || course.length ? "ready" : "error", forKey, recent, course, lastWeek: recent[0] || null, byName };
    renderActive();
  }

  // Start (or refresh) the guide once ESPN has told us this week's event
  setInterval(() => {
    const cur = live.event;
    if (!cur || !cur.start || !live.calendar.length) return;
    if (guide.state === "loading") return;
    if (guide.forKey !== cur.name + cur.start) buildGuide(cur);
  }, 1500);

  // ----- Helpers for display -----
  const cls = (p) => !p ? "" : p.pos <= 10 ? "hd-good" : p.pos >= 999 ? "hd-bad" : "";
  const cell = (p) => p ? `<span class="${cls(p)}">${p.posText}</span>` : `<span style="opacity:.5">—</span>`;
  const yy = (y) => "'" + String(y).slice(2);

  function formLine(name) {
    if (guide.state !== "ready") return "";
    const h = guide.byName.get(nameKey(name));
    const parts = [];
    if (guide.recent.length) {
      const r = guide.recent.map((_, i) => cell(h && h.recent[i])).join(" · ");
      parts.push(`<b>Form</b> ${r}`);
    }
    if (guide.course.length) {
      const c = guide.course.map((ev, i) => `${yy(ev.year)} ${cell(h && h.course[i])}`).join(" · ");
      parts.push(`<b>Here</b> ${c}`);
    }
    return parts.join("<br>");
  }

  function lastWeekCard() {
    const lw = guide.lastWeek;
    if (!lw) return "";
    const pw = weekOf(currentWeek() - 1).picks || {};
    const owner = {};
    Object.entries(pw).forEach(([m, p]) => { if (p.hot) owner[nameKey(p.hot)] = m; if (p.dawg) owner[nameKey(p.dawg)] = m; });
    const top = lw.players.filter(p => p.pos < 999).slice(0, 10);
    return `<details style="margin-top:12px"><summary style="font-weight:900;cursor:pointer">Last week: ${lw.label || lw.name} ▾</summary>
      ${top.map(p => `<div class="rule"><span style="width:34px;font-weight:900">${p.posText}</span>
        <span style="flex:1">${p.name}${owner[nameKey(p.name)] ? ` <span class="hint" style="margin:0">(${owner[nameKey(p.name)]})</span>` : ""}</span></div>`).join("")}
    </details>`;
  }

  function guideHeader() {
    if (guide.state === "loading") return `<p class="hint">Loading form guide… 📈</p>`;
    if (guide.state === "error") return `<p class="hint">Form guide unavailable right now.</p>`;
    if (guide.state !== "ready") return "";
    const recentNames = guide.recent.map(e => e.label || e.name).join(", ");
    const years = guide.course.map(e => e.year).join(", ");
    return `<p class="hint" style="margin-top:6px"><b>Form</b> = last ${guide.recent.length} events, newest first (${recentNames}).
      ${guide.course.length ? `<b>Here</b> = this event in ${years}.` : "No past results found for this event."}
      <span class="hd-good">Green</span> is a top 10, <span class="hd-bad">red</span> is a missed cut.</p>`;
  }

  // ----- Add the form guide to the draft screen -----
  const baseDraft = renderDraft;
  renderDraft = function () {
    baseDraft();
    const list = document.getElementById("golferList");
    if (!list || list.hidden) return;
    // Legend and last week's top 10 at the top of the golfer list
    const head = document.createElement("div");
    head.innerHTML = guideHeader() + lastWeekCard();
    list.insertBefore(head, list.firstChild);
    // Form line under each golfer
    list.querySelectorAll(".golfer").forEach(row => {
      const nameEl = row.querySelector("div > div");
      if (!nameEl) return;
      const line = formLine(nameEl.textContent.trim());
      if (!line) return;
      const info = nameEl.parentElement;
      if (!info.querySelector(".hd-form")) info.insertAdjacentHTML("beforeend", `<div class="rank hd-form">${line}</div>`);
    });
  };

  // Show the same form line on the Ranks tab's field view
  const baseRankings = renderRankings;
  renderRankings = function () {
    baseRankings();
    if (guide.state !== "ready") return;
    document.querySelectorAll("#rankingsWrap .golfer").forEach(row => {
      const nameEl = row.querySelector("div > div");
      if (!nameEl) return;
      const line = formLine(nameEl.textContent.trim());
      if (line && !nameEl.parentElement.querySelector(".hd-form")) nameEl.parentElement.insertAdjacentHTML("beforeend", `<div class="rank hd-form">${line}</div>`);
    });
  };
})();
