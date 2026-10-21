/* WebTroller Lite (c) 2026 Vertzz - developed by Vertzz - https://t.me/vertzz_official
   Runs inside the page (page world) in every frame. It lets the Volume slider in the WebTroller menu turn the
   page's sound up and down: HTML audio / video and Web Audio (what most games and emulators use).
   It only scales the sound. Nothing is changed while the slider is at 100%. */
(() => {
  const KEY = Symbol.for("webtroller.volume");
  if (window[KEY]) return;
  window[KEY] = true;
  let vol = 1;
  const gains = [];                                   /* weak references to the master gain of each audio context */
  const ref = (g) => (window.WeakRef ? new WeakRef(g) : { deref: () => g });
  const setGain = (g) => { try { g.gain.value = vol; } catch (e) {} };

  /* Web Audio: everything that would go straight to the speakers goes through one gain node first */
  try {
    const AN = window.AudioNode && AudioNode.prototype, Dest = window.AudioDestinationNode, Off = window.OfflineAudioContext;
    if (AN && Dest) {
      const oc = AN.connect, od = AN.disconnect, masters = new WeakMap();
      const master = (ctx) => {
        let g = masters.get(ctx);
        if (!g) { g = ctx.createGain(); setGain(g); oc.call(g, ctx.destination); masters.set(ctx, g); gains.push(ref(g)); }
        return g;
      };
      AN.connect = function (t) {
        try {
          if (t instanceof Dest && !(Off && t.context instanceof Off)) {
            const g = master(t.context);
            if (this !== g) { oc.call(this, g, ...Array.prototype.slice.call(arguments, 1)); return t; }
          }
        } catch (e) {}
        return oc.apply(this, arguments);
      };
      AN.disconnect = function (t) {
        try {
          if (t instanceof Dest) {
            const g = masters.get(t.context);
            if (g) return od.call(this, g, ...Array.prototype.slice.call(arguments, 1));
          }
        } catch (e) {}
        return od.apply(this, arguments);
      };
    }
  } catch (e) {}

  /* <audio> and <video>: the page still reads back the volume it set; the sound is scaled underneath */
  let applyEl = () => {};
  try {
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume"), want = new WeakMap();
    if (d && d.get && d.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "volume", {
        configurable: true, enumerable: d.enumerable,
        get() { return want.has(this) ? want.get(this) : d.get.call(this); },
        set(v) { if (!(v >= 0 && v <= 1)) return d.set.call(this, v); want.set(this, v); d.set.call(this, v * vol); },
      });
      applyEl = (el) => {
        try { if (!want.has(el)) want.set(el, d.get.call(el)); d.set.call(el, want.get(el) * vol); } catch (e) {}
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { applyEl(this); return play.apply(this, arguments); };
      ["play", "playing", "loadedmetadata"].forEach((t) =>
        document.addEventListener(t, (e) => { if (e.target instanceof HTMLMediaElement) applyEl(e.target); }, true));
    }
  } catch (e) {}

  const set = (v) => {
    vol = Math.max(0, Math.min(1, v));
    for (let i = gains.length - 1; i >= 0; i--) { const g = gains[i].deref(); if (!g) gains.splice(i, 1); else setGain(g); }
    try { document.querySelectorAll("audio,video").forEach(applyEl); } catch (e) {}
  };
  document.addEventListener("wt-vol", (e) => { const n = parseFloat(e.detail); if (n >= 0) set(n / 100); });
})();
