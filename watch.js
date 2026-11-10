// Where to watch: TV, streaming and radio for this week's tournament.
// The schedule comes from the PGA Tour (saved in field.json by the "Update field"
// task). Shows "on now" on Home and the full week on the Live tab. Times are in
// your phone's time zone. Load after home.js.

(function () {
  const style = document.createElement("style");
  style.textContent = `
    .tv-now { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 2px solid var(--shadow); border-radius: 12px;
      background: var(--cream); margin-top: 8px; text-decoration: none; color: var(--ink); }
    .tv-now.live { background: #fff; box-shadow: 2px 2px 0 var(--shadow); }
    .tv-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); flex: none; animation: tvPulse 1.2s ease-in-out infinite; }
    @keyframes tvPulse { 50% { opacity: .3; transform: scale(.7); } }
    .tv-net { font-weight: 900; }
    .tv-day { margin-top: 12px; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: var(--red-dark); }
    .tv-row { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--bun); font-size: 14px; align-items: baseline; }
    .tv-row:last-child { border-bottom: 0; }
    .tv-row .t { width: 118px; flex: none; font-variant-numeric: tabular-nums; opacity: .8; }
    .tv-row a { color: var(--ink); font-weight: 900; }
    .tv-row.on { background: #fff4c8; border-radius: 8px; padding: 6px 6px; }
    .tv-tag { font-size: 11px; font-weight: 900; background: var(--red); color: #fff; border-radius: 999px; padding: 1px 7px; margin-left: 4px; }
  `;
  document.head.appendChild(style);

  const ICON = { TV: "📺", "Featured groups": "🎥", "Featured holes": "🎥", "Live stream": "🎥", Radio: "📻" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const isToday = (ms) => new Date(ms).toDateString() === new Date().toDateString();
  const link = (w, label) => w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(label || w.network)}</a>` : esc(label || w.network);

  let fieldFile = null, loadedAt = 0;
  async function load() {
    if (Date.now() - loadedAt < 30 * 60000) return;
    loadedAt = Date.now();
    try {
      const r = await fetch("field.json?v=" + Date.now(), { cache: "no-store" });
      if (r.ok) { fieldFile = await r.json(); renderActive(); }
    } catch (e) {}
  }
  function windows() {
    if (!fieldFile) return [];
    const t = weekTourney(currentWeek()) || (live.event ? { start: live.event.start } : null);
    const e = t && (fieldFile.events || []).find(x => x.start === t.start);
    return ((e && e.watch) || []).slice().sort((a, b) => a.start - b.start);
  }
  function state() {
    const ws = windows(), now = Date.now();
    if (!ws.length) return null;
    const on = ws.filter(w => w.start <= now && now < w.end).sort((a, b) => (a.kind === "Radio") - (b.kind === "Radio") || (a.kind === "TV" ? -1 : 1));
    const next = ws.filter(w => w.start > now && w.kind !== "Radio")[0] || ws.filter(w => w.start > now)[0];
    const over = ws.every(w => w.end <= now);
    return { ws, on, next, over };
  }
  const nowRow = (w) => `<a class="tv-now live" href="${esc(w.url || "#")}" target="_blank" rel="noopener">
      <span class="tv-dot"></span><span style="flex:1"><span class="tv-net">${esc(w.network)}</span> · ${esc(w.kind)}<br>
      <span class="hint" style="margin:0">Live now until ${time(w.end)}</span></span><b>Watch ›</b></a>`;
  const nextRow = (w) => `<div class="tv-now"><span style="font-size:20px">${ICON[w.kind] || "📺"}</span>
      <span style="flex:1"><b>Next:</b> ${link(w)} · ${esc(w.kind)}<br><span class="hint" style="margin:0">${isToday(w.start) ? "Today" : new Date(w.start).toLocaleDateString([], { weekday: "short" })} ${time(w.start)}–${time(w.end)}</span></span></div>`;

  function homeCard() {
    const s = state();
    if (!s || s.over) return "";
    return `<div class="card" id="tvHome"><h2>📺 Where to watch</h2>
      ${s.on.length ? s.on.slice(0, 2).map(nowRow).join("") : `<p class="hint" style="margin:0">Nothing on right now.</p>`}
      ${!s.on.length && s.next ? nextRow(s.next) : ""}
      <button class="btn ghost" style="margin-top:10px" data-tv="all">This week's TV schedule</button></div>`;
  }
  function fullCard() {
    const s = state();
    if (!s) return `<div class="card" id="tvFull"><h2>📺 Where to watch</h2><p class="hint">The TV and streaming schedule shows up here once the PGA Tour posts it, usually early in tournament week.</p></div>`;
    const now = Date.now();
    const byDay = {};
    s.ws.forEach(w => { const d = day(w.start); (byDay[d] = byDay[d] || []).push(w); });
    const nets = [...new Set(s.ws.filter(w => w.kind !== "Radio").map(w => w.network))];
    return `<div class="card" id="tvFull"><h2>📺 Where to watch</h2>
      <p class="hint" style="margin:0 0 6px">This week: ${nets.map(n => `<b>${esc(n)}</b>`).join(", ") || "see below"}. Times are your local time.</p>
      ${s.on.length ? s.on.map(nowRow).join("") : s.next ? nextRow(s.next) : ""}
      ${Object.entries(byDay).map(([d, list]) => `<div class="tv-day">${esc(d)}${list.some(w => w.round) ? ` · Round ${list.find(w => w.round).round}` : ""}</div>
        ${list.map(w => { const on = w.start <= now && now < w.end, past = w.end <= now;
          return `<div class="tv-row ${on ? "on" : ""}" style="${past ? "opacity:.45" : ""}"><span class="t">${time(w.start)}–${time(w.end)}</span>
          <span style="flex:1">${ICON[w.kind] || "📺"} ${link(w)} <span class="hint" style="margin:0">· ${esc(w.kind)}</span>${on ? `<span class="tv-tag">LIVE</span>` : ""}</span></div>`; }).join("")}`).join("")}
      <p class="hint" style="margin-top:10px">Featured groups streams follow a few top groups all day. Schedule from the PGA Tour; networks can change it late.</p></div>`;
  }

  const baseRender = renderActive;
  renderActive = function () {
    baseRender.apply(this, arguments);
    if (!me || !dataReady) return;
    load();
    const active = document.querySelector("section.active");
    const id = active && active.id;
    if (id === "home") {
      const wrap = document.getElementById("homeWrap");
      if (wrap && !wrap.querySelector("#tvHome")) {
        const html = homeCard();
        if (html) {
          const box = document.createElement("div");
          box.innerHTML = html;
          const el = box.firstElementChild;
          const hero = [...wrap.querySelectorAll(".card.hd-hero")].pop();
          hero ? hero.after(el) : wrap.prepend(el);
          el.querySelector("[data-tv=all]").onclick = () => {
            const b = document.querySelector('.hd-tabbar [data-tab="live"]'); if (b) b.click();
            setTimeout(() => { const c = document.getElementById("tvFull"); if (c) c.scrollIntoView({ behavior: "smooth" }); }, 300);
          };
        }
      }
    }
    if (id === "scores") {
      const sec = document.getElementById("scores");
      const old = document.getElementById("tvFull");
      const box = document.createElement("div");
      box.innerHTML = fullCard();
      const card = document.getElementById("tourneyCard");
      if (old) old.replaceWith(box.firstElementChild);
      else if (card) card.after(box.firstElementChild);
      else sec.appendChild(box.firstElementChild);
    }
  };
  window.HD = Object.assign(window.HD || {}, { watchWindows: windows });
  // Keep "on now" fresh while the app sits open
  setInterval(() => { if (!document.hidden && dataReady) { const a = document.querySelector("section.active"); if (a && (a.id === "home" || a.id === "scores")) renderActive(); } }, 60000);
})();
