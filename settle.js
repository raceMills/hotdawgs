// Smooth rendering. Lots of things refresh the screen in the background (live
// scores, the 10-second pick check, weather, who's watching). Rebuilding the page
// replays the pop-in animations, which looked like the controls blinking.
//  - Background refreshes are batched (one redraw per ~150ms) and skip the pop-in animations.
//  - Anything right after you tap or type redraws immediately, with animations.
// Load last.

(function () {
  const style = document.createElement("style");
  style.textContent = `
    html.hd-quiet section.active, html.hd-quiet .hd-hero, html.hd-quiet .slot.filled,
    html.hd-quiet .hd-cam-pop, html.hd-quiet .hd-rpick { animation: none !important; }
    /* Keep the tab bar and toasts pinned on iPhone while the page scrolls or redraws */
    .hd-tabbar, .hd-coachbtn { transform: translateZ(0); -webkit-transform: translateZ(0); will-change: transform; }
    .toast { will-change: transform; } /* its own transform hides it, so leave that alone */
    .toast:not(.show) { opacity: 0; pointer-events: none; }
    .toast { transition: transform .4s cubic-bezier(.3,1.5,.5,1), opacity .25s; }
  `;
  document.head.appendChild(style);

  let lastTouch = 0, lastScroll = 0, touching = false;
  addEventListener("scroll", () => { lastScroll = Date.now(); }, { passive: true });
  addEventListener("touchstart", () => { touching = true; }, { passive: true, capture: true });
  addEventListener("touchend", () => { touching = false; lastScroll = Date.now(); }, { passive: true, capture: true });
  // Redrawing the page mid-scroll makes iPhone jump the bottom bar around,
  // so background redraws wait until you've stopped scrolling.
  const scrolling = () => touching || Date.now() - lastScroll < 900;
  ["click", "keydown", "change", "submit"].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));
  const userDriven = () => Date.now() - lastTouch < 1200 && !touching; // taps, not scrolls

  const realRender = renderActive;
  let timer = null, quietTimer = null;
  function paint(quiet) {
    clearTimeout(quietTimer);
    if (quiet) document.documentElement.classList.add("hd-quiet");
    else document.documentElement.classList.remove("hd-quiet");
    const y = window.scrollY;
    window.__hdPaints = (window.__hdPaints || 0) + 1;
    realRender();
    if (quiet && Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); // keep your place
    if (quiet) quietTimer = setTimeout(() => document.documentElement.classList.remove("hd-quiet"), 400);
  }
  renderActive = function () {
    if (userDriven()) { clearTimeout(timer); timer = null; return paint(false); }
    if (timer) return;
    const tryPaint = () => { if (scrolling()) { timer = setTimeout(tryPaint, 400); return; } timer = null; paint(true); };
    timer = setTimeout(tryPaint, 150);
  };
  window.HD = Object.assign(window.HD || {}, { renderNow: () => { clearTimeout(timer); timer = null; paint(false); } });
})();
