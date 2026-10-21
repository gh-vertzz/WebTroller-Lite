/* WebTroller Lite (c) 2026 Vertzz - developed by Vertzz - https://t.me/vertzz_official
   Ad Blocker, page part. Runs inside the page (page world) in every frame, like volume.js. While the Ad Blocker is on it stops pop-ups and pop-unders:
   window.open and script-made link clicks that were not started by a tap, and any pop-up that goes to a known ad network.
   frame.js tells it whether the blocker is on, and which ad hosts to refuse, through the "wt-adb" event. */
(() => {
  const KEY = Symbol.for("webtroller.adblock");
  if (window[KEY]) return;
  window[KEY] = true;
  let on = false, ads = null;
  document.addEventListener("wt-adb", (e) => {
    try { const d = JSON.parse(e.detail); on = !!d.on; if (d.re) ads = new RegExp(d.re, "i"); } catch (err) {}
  });
  /* a real tap or key press gives the page a short time in which it may open a window */
  const tapped = () => (navigator.userActivation ? navigator.userActivation.isActive : true);
  const isAd = (u) => !!ads && ads.test(String(u || ""));

  const open = window.open;
  window.open = function (url) {
    if (on && (!tapped() || isAd(url))) return null;
    return open.apply(this, arguments);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (on && (isAd(this.href) || (this.target && this.target !== "_self" && !tapped()))) return;
    return click.apply(this, arguments);
  };
})();
