/* WebTroller Lite (c) 2026 Vertzz - developed by Vertzz - https://t.me/vertzz_official
   Runs in every frame. Receives keys, mouse moves, clicks and scrolls from the overlay
   and plays them inside the embedded game frame that has focus. */
/* page volume: volume.js (inside the page) listens for the "wt-vol" event; here it gets the saved value and every change, in every frame */
(() => {
  const send = (v) => { try { document.dispatchEvent(new CustomEvent("wt-vol", { detail: String(v) })); } catch (e) {} };
  try { chrome.storage.local.get("wt", (r) => { try { const s = JSON.parse((r && r.wt) || "null"); if (s && s.vol !== undefined && +s.vol < 100) send(s.vol); } catch (e) {} }); } catch (e) {}
  try { chrome.runtime.onMessage.addListener((m) => { if (m && m.wtVol !== undefined) send(m.wtVol); }); } catch (e) {}
})();

const wtDeep = () => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; };   /* the focused element, also inside a component's shadow DOM */
(() => {
  if (window === top) return;
  chrome.runtime.onMessage.addListener((m) => {
    if (!m || !m.emu || !document.hasFocus()) return;
    const a = document.activeElement;
    if (a && /^i?frame$/i.test(a.tagName)) return;          /* a frame inside this one has the focus */
    try {
      if (m.kind === "key") {
        const t = (m.vk && wtDeep()) || a || document.body;      /* m.vk: typed on WebTroller's keyboard (not a controller button) */
        const ok = t.dispatchEvent(new KeyboardEvent(m.type, m.init));
        if (m.vk && m.type === "keydown" && ok && window.__wtType) window.__wtType(t, m);
        return;
      }
      const t = document.elementFromPoint(m.x, m.y) || document.body;
      if (m.kind === "wheel") {
        const ok = t.dispatchEvent(new WheelEvent("wheel", { clientX: m.x, clientY: m.y, deltaX: m.dx || 0, deltaY: m.dy, bubbles: true, cancelable: true }));
        if (ok) scrollBy(m.dx || 0, m.dy);
      } else {
        const o = Object.assign({}, m.o, { clientX: m.x, clientY: m.y });
        if (m.type === "mousedown" && t.focus) t.focus();
        t.dispatchEvent(new MouseEvent(m.type, o));
      }
    } catch (e) {}
  });
})();

/* Phone keyboard off inside frames. While WebTroller's ⌨ Keyboard is on, text fields inside embedded frames (also other sites' frames, which the overlay cannot reach)
   never open the phone keyboard, WebTroller's keyboard types into them, and the text bar shows what they contain. The overlay tells the background script whether the
   phone keyboard must stay off (message "nk"); the background passes it to every frame, and tells a frame that just loaded (message "nkq"). */
(() => {
  if (window === top) return;
  const NOT = /^(button|checkbox|radio|submit|range|color|file|image|reset)$/i;
  const ED = "input,textarea,[contenteditable]";
  const isEd = (el) => !!el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !NOT.test(el.type)));
  const real = (e) => { try { const p = e.composedPath && e.composedPath(); if (p && p[0] && p[0].nodeType === 1) return p[0]; } catch (x) {} return e.target; };
  const ex = (c, v) => { try { return document.execCommand(c, false, v); } catch (e) { return false; } };
  let on = false, obs = null, newT = 0;
  const L = new Set(), ROS = new Set(), NEW = new Set(), CARET = new WeakMap();

  /* --- phone keyboard off --- */
  const roOn = (el) => { if (!on || !el || !("readOnly" in el) || el.__wtro !== undefined) return; el.__wtro = el.readOnly; el.readOnly = true; ROS.add(el); };
  const roOff = (el) => { if (!el || el.__wtro === undefined) return; try { el.readOnly = el.__wtro; } catch (e) {} delete el.__wtro; ROS.delete(el); };
  /* a page that takes readonly off again, or sets its own inputmode, is put back at once (40 times per field at most) */
  let GRD = null;
  const grd = (el) => {
    try {
      if (!GRD && typeof MutationObserver === "function") GRD = new MutationObserver((ms) => {
        if (!on) return;
        for (const m of ms) {
          const e = m.target; if (!e || e.__wtim === undefined) continue;
          e.__wtg = (e.__wtg || 0) + 1; if (e.__wtg > 40) continue;
          if (e.getAttribute("inputmode") !== "none") e.setAttribute("inputmode", "none");
          if (e.__wtro !== undefined && "readOnly" in e && !e.readOnly) e.readOnly = true;
        }
      });
      if (GRD) GRD.observe(el, { attributes: true, attributeFilter: ["inputmode", "readonly"] });
    } catch (e) {}
  };
  const lock = (el) => {
    if (!on || !isEd(el) || el.__wtim !== undefined) return;   /* never lock after the phone keyboard was allowed again (a sweep queued earlier) */
    el.__wtim = el.getAttribute("inputmode"); L.add(el);
    try { el.setAttribute("inputmode", "none"); el.setAttribute("virtualkeyboardpolicy", "manual"); } catch (e) {}
    grd(el);
    try { const h = el.closest && el.closest("[contenteditable]:not([contenteditable=false])"); if (h && h !== el) lock(h); } catch (e) {}   /* the host of an editable area is locked too */
    if (wtDeep() === el) { roOn(el); try { el.blur(); el.focus(); } catch (e) {} }
  };
  const sweep = (root) => {
    try { (root || document).querySelectorAll(ED).forEach(lock); } catch (e) {}
    if (root && root.matches && root.matches(ED)) lock(root);
  };
  const obsOn = () => {
    if (obs || typeof MutationObserver !== "function") return;
    obs = new MutationObserver((ms) => {
      let fast = 0;
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && NEW.size < 40) {
        NEW.add(n);
        if (fast < 20 && on) { fast++; try { if (n.matches(ED)) lock(n); else if (n.childElementCount < 60) n.querySelectorAll(ED).forEach(lock); } catch (e) {} }   /* a new field is locked at once */
      }
      if (!newT && NEW.size) newT = setTimeout(() => {
        newT = 0; const l = Array.from(NEW); NEW.clear(); if (!on) return;
        const run = () => l.forEach((n) => { if (n.isConnected) sweep(n); });
        window.requestIdleCallback ? requestIdleCallback(run, { timeout: 1500 }) : run();
      }, 400);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  };
  const obsOff = () => { if (obs) { obs.disconnect(); obs = null; } NEW.clear(); clearTimeout(newT); newT = 0; };
  const restore = () => {
    Array.from(ROS).forEach(roOff);
    L.forEach((el) => { try { el.removeAttribute("virtualkeyboardpolicy"); if (el.__wtim === null) el.removeAttribute("inputmode"); else el.setAttribute("inputmode", el.__wtim); } catch (e) {} delete el.__wtim; });
    L.clear(); obsOff(); if (GRD) { try { GRD.disconnect(); } catch (e) {} GRD = null; }
  };
  const apply = (v) => {
    if (v === on) return;
    on = v;
    if (on) { obsOn(); sweep(document); const a = wtDeep(); if (isEd(a)) lock(a); }
    else { restore(); lastF = 0; }
  };
  /* a tap that is about to focus a field switches its phone keyboard off first */
  ["pointerdown", "touchstart", "mousedown", "click"].forEach((t) => document.addEventListener(t, (e) => {
    if (!on) return;
    const x = real(e), el = x && x.closest && x.closest(ED + ",label"); if (!el) return;
    const f = el.tagName === "LABEL" ? el.control : el; if (!f) return;
    lock(f);
    if (isEd(f)) { roOn(f); setTimeout(() => { if (f.__wtro !== undefined && wtDeep() !== f) roOff(f); }, 700); }   /* tapped but never focused: give it back */
  }, true));
  document.addEventListener("focusin", (e) => { const t = real(e); if (on && isEd(t)) { lock(t); roOn(t); } report(); }, true);
  document.addEventListener("focusout", (e) => { const t = real(e); if (t && t.__wtro !== undefined) roOff(t); report(); }, true);
  try {
    chrome.runtime.onMessage.addListener((m) => {          /* the overlay saw the phone keyboard open anyway: lock the field and focus it again */
      if (!m || !m.wtNd || !on || !document.hasFocus()) return;
      const a = wtDeep(); if (!isEd(a)) return;
      lock(a); roOn(a); try { a.blur(); } catch (e) {}
      setTimeout(() => { try { a.focus({ preventScroll: true }); } catch (e) {} }, 60);
    });
  } catch (e) {}
  try { chrome.runtime.sendMessage({ wt: "nkq" }, (r) => { void chrome.runtime.lastError; if (r && r.nk) apply(true); }); } catch (e) {}

  /* --- typing into the focused field (keys from WebTroller's keyboard) --- */
  const put = (a, t) => {
    if (ex("insertText", t)) return;
    if (typeof a.value === "string") {
      try { a.setRangeText(t, a.selectionStart, a.selectionEnd, "end"); } catch (x) { a.value += t; }
      a.dispatchEvent(new InputEvent("input", { bubbles: true, data: t, inputType: "insertText" }));
    }
  };
  const del = (a) => {
    if (ex("delete")) return;
    if (typeof a.value === "string") {
      try { let s = a.selectionStart; const e = a.selectionEnd; if (s === e) s = Math.max(0, s - 1); a.setRangeText("", s, e, "end"); } catch (x) { a.value = a.value.slice(0, -1); }
      a.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    }
  };
  const move = (a, d) => {
    if (typeof a.value === "string") {
      let s = null, e = null; try { s = a.selectionStart; e = a.selectionEnd; } catch (x) {}
      const len = a.value.length; let p;
      if (typeof s === "number" && typeof e === "number") { p = s !== e ? (d < 0 ? s : e) : Math.max(0, Math.min(len, s + d)); try { a.setSelectionRange(p, p); return; } catch (x) {} }
      p = Math.max(0, Math.min(len, (CARET.has(a) ? CARET.get(a) : len) + d)); CARET.set(a, p);     /* email / number fields cannot report a caret */
      const t = a.type; try { a.type = "text"; a.setSelectionRange(p, p); } catch (x) {} finally { try { a.type = t; } catch (x) {} }
      return;
    }
    const sel = getSelection(); if (!sel) return;
    if (!sel.rangeCount || !a.contains(sel.anchorNode)) { const r = document.createRange(); r.selectNodeContents(a); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    if (!sel.isCollapsed) { try { d < 0 ? sel.collapseToStart() : sel.collapseToEnd(); } catch (x) {} return; }
    if (sel.modify) sel.modify("move", d < 0 ? "backward" : "forward", "character");
  };
  /* Cursor Up / Down keys. One-line fields: Up goes to the start, Down to the end (like a desktop browser). Text areas: the caret moves one visible line, keeping its column
     (measured on an invisible copy of the text with the same width and font, so wrapped lines count as lines). Editable page areas move with Selection.modify. */
  function moveLine(a,d){
    if(!a)return;
    if(typeof a.value==="string"){
      const len=a.value.length;let s=null,e=null;try{s=a.selectionStart;e=a.selectionEnd}catch(x){}
      const setP=p=>{
        try{if(typeof s==="number"){a.setSelectionRange(p,p);return}}catch(x){}
        CARET.set(a,p);const t=a.type;try{a.type="text";a.setSelectionRange(p,p)}catch(x){}finally{try{a.type=t}catch(x){}}   /* email / number / ... */
      };
      if(a.tagName!=="TEXTAREA"){setP(d<0?0:len);return}
      const cur=typeof s==="number"?(s!==e?(d<0?s:e):s):len;
      const cs=getComputedStyle(a),m=document.createElement("div"),ms=m.style;
      ms.cssText="all:initial";
      ["paddingTop","paddingRight","paddingBottom","paddingLeft","fontFamily","fontSize","fontWeight","fontStyle","fontVariant","fontStretch","letterSpacing","wordSpacing","textTransform","textIndent","tabSize","direction","lineHeight","wordBreak","overflowWrap","textAlign","whiteSpace"].forEach(k=>{try{ms[k]=cs[k]}catch(x){}});
      ms.position="fixed";ms.left="-99999px";ms.top="0";ms.visibility="hidden";ms.boxSizing="content-box";ms.display="block";
      ms.width=Math.max(1,a.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight))+"px";
      const tn=document.createTextNode(a.value+"\u200b");m.appendChild(tn);(document.body||document.documentElement).appendChild(m);
      try{
        const rg=document.createRange(),memo={};
        const R=p=>{if(memo[p])return memo[p];rg.setStart(tn,p);rg.setEnd(tn,p+1);const r=rg.getClientRects()[0]||rg.getBoundingClientRect();return memo[p]=r};
        const Y=p=>{const r=R(p);return r.height||r.width?r.top:(p>0?Y(p-1):0)},X=p=>R(p).left;
        const lh=(R(0).height||parseFloat(cs.lineHeight)||16),eps=Math.max(3,lh*.5);
        const lower=t=>{let lo=0,hi=len+1;while(lo<hi){const mid=(lo+hi)>>1;if(Y(mid)>=t-eps)hi=mid;else lo=mid+1}return lo};   /* first position on the line at height t */
        const upper=t=>{let lo=0,hi=len+1;while(lo<hi){const mid=(lo+hi)>>1;if(Y(mid)>t+eps)hi=mid;else lo=mid+1}return lo};   /* first position below that line */
        const y0=Y(cur),x0=X(cur);let from,to;
        if(d<0){const f=lower(y0);if(f===0){setP(0);return}from=lower(Y(f-1));to=f-1}
        else{const n=upper(y0);if(n>len){setP(len);return}from=n;to=Math.min(len,upper(Y(n))-1)}
        let best=from,bd=1e9;for(let p=from;p<=to;p++){const dx=Math.abs(X(p)-x0);if(dx<bd){bd=dx;best=p}}
        setP(best);
        const cy=Y(best)-m.getBoundingClientRect().top;                 /* keep the caret line in view */
        if(cy<a.scrollTop)a.scrollTop=cy;else if(cy+lh>a.scrollTop+a.clientHeight)a.scrollTop=cy+lh-a.clientHeight+parseFloat(cs.paddingBottom||0);
      }finally{m.remove()}
      return;
    }
    const sel=getSelection();if(!sel)return;
    if(!sel.rangeCount||!a.contains(sel.anchorNode)){const r=document.createRange();r.selectNodeContents(a);r.collapse(false);sel.removeAllRanges();sel.addRange(r)}
    if(!sel.isCollapsed){try{d<0?sel.collapseToStart():sel.collapseToEnd()}catch(x){}}
    if(sel.modify)sel.modify("move",d<0?"backward":"forward","line");
  }
  document.addEventListener("input", (e) => { const t = real(e); if (t) CARET.delete(t); }, true);
  window.__wtType = (a, m) => {
    if (!isEd(a)) return;
    const key = m.init && m.init.key, w = a.__wtro !== undefined && a.readOnly;
    if (w) a.readOnly = false;                                  /* open for this one key press only, so the phone keyboard never gets a chance */
    try {
      if (key === "Backspace") del(a);
      else if (key === "ArrowLeft" || key === "ArrowRight") move(a, key === "ArrowLeft" ? -1 : 1);
      else if (key === "ArrowUp" || key === "ArrowDown") moveLine(a, key === "ArrowUp" ? -1 : 1);
      else if (key === "Enter") {
        if (a.tagName === "TEXTAREA" || (a.isContentEditable && a.tagName !== "INPUT")) { if (!ex("insertLineBreak")) put(a, "\n"); }
        else if (a.form) { a.form.requestSubmit ? a.form.requestSubmit() : a.form.submit(); }
      } else if (m.ch) {
        if (a.dispatchEvent(new KeyboardEvent("keypress", Object.assign({}, m.init, { charCode: m.ch.charCodeAt(0) })))) put(a, m.ch);
      }
    } catch (e) {} finally { if (w) a.readOnly = true; }
    report();
  };

  /* --- tell the overlay what the field contains, for its text bar --- */
  const PR = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "letterSpacing", "wordSpacing", "textTransform", "textIndent", "tabSize", "direction", "lineHeight", "wordBreak", "overflowWrap", "hyphens", "whiteSpace"];
  /* a code editor's line numbers sit inside the editable area but are not typed text: leave them out (same rule as the overlay's text bar) */
  const GUT = '.CodeMirror-gutters,.CodeMirror-gutter-wrapper,.CodeMirror-gutter-elt,.CodeMirror-linenumber,.cm-gutters,.cm-gutter,.cm-gutterElement,.cm-lineNumbers,.ace_gutter,.ace_gutter-cell,.line-numbers-rows,.line-number,.linenumber,.lineno,.gutter,[class*="line-number"]:not(pre):not(code),[class*="linenumber"]:not(pre):not(code),[class*="LineNumber"]:not(pre):not(code),[class*="gutter"]:not(pre):not(code)';
  const isGut = (n) => { try { if (n.matches(GUT)) return true; return n.getAttribute("contenteditable") === "false" && n.textContent.length < 9 && /^\s*\d+\s*$/.test(n.textContent); } catch (e) { return false; } };
  const scan = (root, an, ao) => {                              /* text of an editable area with its line breaks, and where the caret is */
    let s = "", pos = -1, nl = false;
    const need = () => { if (nl) { if (s && s[s.length - 1] !== "\n") s += "\n"; nl = false; } };
    const BLK = /^(DIV|P|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|FORM|HR)$/;
    const walk = (n) => {
      if (n.nodeType === 3) { need(); if (n === an) pos = s.length + Math.min(ao, n.data.length); s += n.data; return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName; if (t === "SCRIPT" || t === "STYLE" || t === "TEMPLATE") return; if (n !== root && !(an && n.contains(an)) && isGut(n)) return;
      if (t === "BR") { need(); s += "\n"; return; }
      const b = n !== root && BLK.test(t);
      if (b) { need(); if (s && s[s.length - 1] !== "\n") s += "\n"; }
      const k = n.childNodes;
      for (let i = 0; i < k.length; i++) { if (n === an && i === ao) pos = s.length; walk(k[i]); }
      if (n === an && ao >= k.length) pos = s.length;
      if (b) nl = true;
    };
    walk(root);
    return { s, pos };
  };
  let lastF = 0, lastSig = "", rt = 0;
  let pwEl = null, pwShow = false;                               /* the focused field, and whether its password is shown in the text bar */
  const send = () => {
    rt = 0;
    if (!on) return;
    const a = wtDeep(); let o = { f: 0 };
    if (a !== pwEl) { pwEl = a; pwShow = false; }              /* another field: the password is hidden again */
    if (isEd(a) && document.hasFocus()) {
      let s = "", pos = 0;
      try {
        if (typeof a.value === "string") {
          s = a.value; pos = typeof a.selectionStart === "number" ? a.selectionStart : s.length;
          if (a.type === "password" && !pwShow) s = "\u2022".repeat(s.length);       /* a password only leaves the frame while the eye button is on */
        } else {
          const q = getSelection(); let an = null, ao = 0;
          if (q && q.rangeCount && a.contains(q.focusNode)) { an = q.focusNode; ao = q.focusOffset; }
          const r = scan(a, an, ao); s = r.s; pos = r.pos < 0 ? s.length : Math.min(r.pos, s.length);
        }
        const d = {}, cs = getComputedStyle(a); PR.forEach((p) => { d[p] = cs[p]; });
        d.ml = a.tagName !== "INPUT";
        d.w = d.ml ? Math.max(0, (a.clientWidth || a.getBoundingClientRect().width) - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) : 0;
        o = { f: 1, s, pos, ph: a.placeholder || "", d };
        if (a.type === "password") { o.pw = 1; o.rv = pwShow ? 1 : 0; }     /* the overlay shows its eye button for password fields in frames too */
      } catch (e) { o = { f: 0 }; }
    }
    if (!o.f && !lastF) return;                                  /* nothing focused here and nothing reported before: stay quiet */
    lastF = o.f;
    const sig = JSON.stringify(o); if (sig === lastSig) return; lastSig = sig;
    try { chrome.runtime.sendMessage({ wt: "fv", v: o }); } catch (e) {}
  };
  const report = () => { if (on && !rt) rt = requestAnimationFrame(send); };
  ["input", "keyup", "selectionchange", "pointerup", "mouseup", "touchend", "compositionend", "focusin"].forEach((t) => document.addEventListener(t, report, true));   /* focusin: a password field is known as soon as it gets the focus */
  addEventListener("blur", report);

  try { chrome.runtime.onMessage.addListener((m) => { if (m && m.wtNk !== undefined) { apply(!!m.wtNk); report(); } }); } catch (e) {}
  try { chrome.runtime.onMessage.addListener((m) => { if (m && m.wtFq && document.hasFocus()) { lastSig = ""; send(); } }); } catch (e) {}   /* the overlay's keyboard just opened: tell it now what the focused field is (text, password...) */
  try {
    chrome.runtime.onMessage.addListener((m) => {                /* the eye button in the overlay: show or hide the password in the text bar (only the frame that has the focus answers) */
      if (!m || m.wtPw === undefined || !document.hasFocus()) return;
      const a = wtDeep(); if (!a || a.type !== "password") return;
      pwEl = a; pwShow = !!m.wtPw; lastSig = ""; send();
    });
  } catch (e) {}
})();

/* Ad Blocker (page part): while it is on, ad boxes that the block list could not stop are hidden in every frame, and adblock.js (in the page) is told to stop pop-ups */
(() => {
  /* ad and pop-up networks: ad frames and links to them are hidden, and pop-ups to them are refused */
  const HOSTS = ["doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google", "adnxs.com", "adsrvr.org", "taboola.com", "outbrain.com",
    "criteo.", "pubmatic.com", "rubiconproject.com", "openx.net", "amazon-adsystem.com", "mgid.com", "popads.net", "popcash.net", "propellerads.com", "exoclick.com",
    "exosrv.com", "exdynsrv.com", "trafficjunky.net", "juicyads.com", "adcash.com", "clickadu.com", "hilltopads.net", "adsterra.com", "a-ads.com", "ad-maven.com",
    "admaven.com", "richpush.co", "onclickads.net", "onclkds.com", "clkrev.com", "yllix.com", "plugrush.com", "realsrv.com", "tsyndicate.com", "trafficstars.com",
    "zeropark.com", "adskeeper.com", "revcontent.com", "adxpansion.com", "ero-advertising.com", "popmyads.com", "bidvertiser.com", "clicksor.com", "medianet",
    "tradedoubler.com", "adform.net", "smartadserver.com", "teads.tv", "moatads.com", "propeller-tracking.com", "pushwhy.com", "notifpush.com"];
  const HOST_RE = HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|");
  const SEL = [
    "ins.adsbygoogle", "[class*='adsbygoogle']", "[id^='google_ads_']", "[id*='google_ads_iframe']", "[id^='div-gpt-ad']", "[data-google-query-id]", "[data-ad-slot]", "[data-adslot]",
    "[data-ad-client]", "[data-ad-unit]", "iframe[id^='aswift_']", "iframe[title='Advertisement']", "iframe[title='3rd party ad content']", "iframe[name^='google_ads']",
    ".adsbox", ".ad-banner", ".ad-container", ".ad-slot", ".ad-wrapper", ".ad-unit", ".ad-placement", ".ad-holder", ".ad-box", ".ad-block", ".ad-space", ".ad-leaderboard",
    ".adunit", ".advert", ".advertisement", ".advertising", ".advertise", ".sponsored-ad", ".banner-ad", ".banner_ad", ".bannerad", ".google-ad", ".google-ads", ".gpt-ad",
    ".mediavine-ad", ".ezoic-ad", ".taboola", "[id^='taboola-']", ".OUTBRAIN", ".ob-widget", ".trc_related_container", ".mgid-widget", "[id^='mgid_']", "[id^='ad-slot']",
    "[id^='ad_slot']", "[id^='ad-container']", "[id^='ad_container']", "[id^='ad-wrapper']", "[id^='ad-banner']", "[id^='ad_banner']", "[id$='-ad-container']",
    "[id*='banner-ad']", "[id*='banner_ad']", "[id*='ad-placement']", "[class*='ad-placement']", "[class*='-ad-slot']", "[class*='ad_banner']",
    "[class*='adthrive']", "[id*='adthrive']", "[class*='mnet-ad']", "[class*='aniview']", "[id*='aniview']", "[id*='primis']", "[class*='primis']"
  ];
  const hostSel = (tag, attr) => HOSTS.map((h) => tag + "[" + attr + "*='" + h + "']");
  const CSS = SEL.concat(hostSel("iframe", "src"), hostSel("iframe", "data-src"), hostSel("a", "href"), hostSel("ins", "data-src")).join(",")
    + "{display:none!important;visibility:hidden!important;pointer-events:none!important;width:0!important;height:0!important}";
  let el = null;
  const tell = (on) => { try { document.dispatchEvent(new CustomEvent("wt-adb", { detail: JSON.stringify({ on, re: HOST_RE }) })); } catch (e) {} };
  const apply = (on) => {
    tell(on);
    if (on && !el) { el = document.createElement("style"); el.id = "wt-adblock"; el.textContent = CSS; (document.head || document.documentElement).appendChild(el); }
    else if (!on && el) { el.remove(); el = null; }
  };
  const adbOf = (txt) => { try { return !!JSON.parse(txt || "null").adb; } catch (e) { return false; } };
  try { chrome.storage.local.get("wt", (r) => apply(adbOf(r && r.wt))); } catch (e) {}
  try { chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.wt) apply(adbOf(c.wt.newValue)); }); } catch (e) {}
})();
