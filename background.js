/* WebTroller Lite (c) 2026 Vertzz - developed by Vertzz - https://t.me/vertzz_official
   Background: opens WebTroller on a tab, keeps it open across reloads and page changes,
   remembers hide/show for each tab, and hands input to game frames. */
const api = typeof browser !== "undefined" ? browser : chrome;
const KEY = "wtTabs";

const getTabs = async () => (await api.storage.session.get(KEY))[KEY] || {};
async function patch(id, p) {
  const t = await getTabs();
  if (p === null) delete t[id]; else t[id] = Object.assign(t[id] || {}, p);
  await api.storage.session.set({ [KEY]: t });
}
async function inject(id) {
  try { await api.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] }); } catch (e) {}
}

/* icon click or shortcut: open on this tab, afterwards show / hide */
async function toggle(tab) {
  if (!tab || tab.id == null) return;
  const state = (await getTabs())[tab.id];
  if (!state) { await patch(tab.id, { hidden: false }); await inject(tab.id); return; }
  const hidden = !state.hidden;
  await patch(tab.id, { hidden });
  await inject(tab.id);
  try { await api.tabs.sendMessage(tab.id, { wt: "set", hidden }); } catch (e) {}
}
api.action.onClicked.addListener(toggle);
api.commands.onCommand.addListener(async (c) => {
  if (c !== "toggle-webtroller") return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});

/* a tab that has WebTroller open gets it again after every page load */
api.tabs.onUpdated.addListener(async (id, info) => {
  if (info.status === "complete" && (await getTabs())[id]) inject(id);
});
api.tabs.onRemoved.addListener((id) => { patch(id, null); });

api.runtime.onMessage.addListener((m, sender, reply) => {
  const id = sender.tab && sender.tab.id;
  if (!m || id == null) return;
  if (m.wt === "nk") {                         /* the overlay says whether the phone keyboard must stay off: remembered for the tab and passed to every frame (frame.js) */
    getTabs().then((t) => { if (t[id]) patch(id, { nk: !!m.on }); });
    Promise.resolve(api.tabs.sendMessage(id, { wtNk: !!m.on })).catch(() => {});
    return;
  }
  if (m.wt === "nkq") { getTabs().then((t) => reply({ nk: !!(t[id] && t[id].nk) })); return true; }   /* a frame that just loaded asks */
  if (m.wt === "nd") { Promise.resolve(api.tabs.sendMessage(id, { wtNd: 1 })).catch(() => {}); return; }   /* the phone keyboard opened anyway: the frame with the focus closes it */
  if (m.wt === "fq") { Promise.resolve(api.tabs.sendMessage(id, { wtFq: 1 })).catch(() => {}); return; }   /* keyboard opened: the frame with the focus reports its field again */
  if (m.wt === "pw") { Promise.resolve(api.tabs.sendMessage(id, { wtPw: !!m.on })).catch(() => {}); return; }   /* the eye button: every frame of the tab hears it, the one with the focus answers */
  if (m.wt === "fv") { Promise.resolve(api.tabs.sendMessage(id, { wtFv: m.v }, { frameId: 0 })).catch(() => {}); return; }   /* a text field in a frame reports its text and caret to the overlay */
  if (m.wtVol !== undefined) { Promise.resolve(api.tabs.sendMessage(id, { wtVol: m.wtVol })).catch(() => {}); return; }   /* volume: every frame of the tab */
  if (m.wt === "hello") { getTabs().then((t) => reply(t[id] || { hidden: false })); return true; }
  if (m.wt === "state") {
    const p = {};
    if (m.hidden !== undefined) p.hidden = m.hidden;
    patch(id, p);
  } else if (m.emu) {
    Promise.resolve(api.tabs.sendMessage(id, m)).catch(() => {});   /* game frames listen in frame.js */
  }
});

/* Ad Blocker: the menu's Ad Blocker button saves "adb" in the settings; here it turns the network block list (rules/ads.json) on or off for every tab */
const adbSync = async (on) => {
  try { await api.declarativeNetRequest.updateEnabledRulesets(on ? { enableRulesetIds: ["ads"] } : { disableRulesetIds: ["ads"] }); } catch (e) {}
};
const adbOf = (txt) => { try { return !!JSON.parse(txt || "null").adb; } catch (e) { return false; } };
api.storage.local.get("wt").then((r) => adbSync(adbOf(r && r.wt)));
api.storage.onChanged.addListener((c, area) => { if (area === "local" && c.wt) adbSync(adbOf(c.wt.newValue)); });
