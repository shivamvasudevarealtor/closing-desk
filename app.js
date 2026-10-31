(function () {
  "use strict";
  var STAGES = ["New", "Contacted", "Meeting set", "Active", "Under contract", "Closed", "Past client"];
  var SIDE = ["Nurture", "Dead"];
  var ALL_STAGES = STAGES.concat(SIDE);
  var TEMPS = ["hot", "warm", "cold", "stale"];
  var RHYTHM = { hot: 2, warm: 7, cold: 30, stale: 90 };
  var RHYTHM_LABEL = { hot: "every 2 days", warm: "every week", cold: "every month", stale: "every 3 months" };
  var KINDS = ["buyer", "seller", "investor"];
  var PROVS = ["Alberta", "British Columbia", "Saskatchewan", "Manitoba", "Ontario", "Quebec", "New Brunswick", "Nova Scotia / PEI", "Newfoundland and Labrador", "Yukon / NWT / Nunavut", "Unknown"];
  var PROV_TAG = { "Alberta": "ab", "British Columbia": "bc", "Saskatchewan": "sk", "Manitoba": "mb", "Ontario": "on", "Quebec": "qc", "New Brunswick": "nb", "Nova Scotia / PEI": "ns-pe", "Newfoundland and Labrador": "nl", "Yukon / NWT / Nunavut": "north", "Unknown": "unknown" };
  var SOURCES = ["Meta Ads", "Facebook Marketplace", "Open house", "Instagram", "Referral", "Friend or family", "SOI", "Phone contacts", "Door knock", "Flyer", "Other"];
  var BTYPES = ["Detached", "Townhome", "Duplex", "Condo", "Acreage", "Pre-con", "Investment"];
  var BTIMES = ["Now", "1-3 months", "3-6 months", "6-12 months", "12+ months"];
  var BPRE = ["Not started", "In progress", "Approved"];
  var TABS = ["today", "pipeline", "lists", "more"];
  var TITLES = { today: "Today", pipeline: "Pipeline", lists: "Lists", more: "More" };

  var APP_VERSION = "1.1.0";
  var DEFAULT_SETTINGS = { listingsGoal: 20, buyersGoal: 30, dailyCap: 15, goalYear: 2027, deals: [], spend: [] };
  var Store = window.CDStore;
  var S = {
    contacts: new Map(),
    settings: Object.assign({}, DEFAULT_SETTINGS),
    user: null, offline: false, live: false, lastLoad: 0, pend: {}, setup: false,
    pendingRestore: null, restoring: null, restoreError: "",
    tab: "today", sheetId: null, loaded: false, connectNote: false,
    f: { q: "", prov: "", temp: "", stage: "", kind: "", source: "", tag: "", email: false, phone: false, limit: 60 },
    selecting: false, selected: new Set(), showAllDue: false, confirmSpread: false,
    pipeMore: {}
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- dates ---------- */
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var p = s.split("-").map(Number); return iso(new Date(p[0], p[1] - 1, p[2] + n)); }
  function diff(a, b) { var x = a.split("-").map(Number), y = b.split("-").map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000); }
  function fdate(s) { if (!s) return "none"; var p = s.split("-").map(Number); var d = new Date(p[0], p[1] - 1, p[2]); var o = { month: "short", day: "numeric" }; if (p[0] !== new Date().getFullYear()) o.year = "numeric"; return d.toLocaleDateString("en-CA", o); }

  /* ---------- contact helpers ---------- */
  function nm(c) { return ((c.first || "") + " " + (c.last || "")).trim() || c.email || fphone(c.phone) || "No name"; }
  function fphone(p) { var m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? "(" + m[1] + ") " + m[2] + "-" + m[3] : (p || ""); }
  function normPhone(v) { var d = String(v || "").replace(/\D/g, ""); if (d.length === 10) return "+1" + d; if (d.length === 11 && d[0] === "1") return "+" + d; return String(v || "").trim(); }
  var WA_TEMPLATES = [
    { id: "flyer-warm", name: "Flyer follow-up (warm)", body: "Hi {name}, it's Shivam Vasudeva with The Modern Real Estate Group at Real Broker. You may remember my flyer about buyers looking in {community}. I'm sorry I'm only following up now. I'm working with new buyers looking in the area, and I'd love to hear whether you've ever thought about what's next for your home. No pressure at all. If you'd rather I didn't message, just tell me and I won't." },
    { id: "flyer-short", name: "Flyer follow-up (short)", body: "Hi {name}, Shivam Vasudeva here (Real Broker, Calgary). Following up on my flyer: I'm now working with buyers looking in {community}. If selling is ever on your mind, I'd be glad to walk you through what that could look like. Just tell me if you'd rather not hear from me." },
    { id: "anniversary", name: "Home anniversary", body: "Hi {name}, it's Shivam. I was thinking of you today. It's been {yearsWord} since we closed your home deal. I hope the home has been good to you. If you're ever curious what's happening in your neighbourhood, I'm happy to share, no strings attached." },
    { id: "birthday", name: "Birthday", body: "Hi {name}, it's Shivam. Wishing you a very happy birthday! I hope today is full of good people and good food." },
    { id: "listing-match", name: "A home that fits", body: "Hi {name}, it's Shivam. A home just came up in {community} that fits some of what you told me you're looking for. Want me to send you the details?" },
    { id: "checkin", name: "Friendly check-in", body: "Hi {name}, it's Shivam Vasudeva with Real Broker in Calgary. Just checking in to see how you're doing. If real estate is ever on your mind, I'm always happy to chat." }
  ];
  function greetName(c) { var f = String(c.first || "").trim(); if (!f || /\d/.test(f)) return "there"; var w = f.split(/\s+/); if (/^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(w[0]) && w[1]) return w[1]; return w[0]; }
  function yrsOf(c) { var cd = closeDateOf(c); return cd ? Math.max(0, Number(today().slice(0, 4)) - Number(cd.slice(0, 4))) : 0; }
  function fillMsg(body, c, extra) {
    extra = extra || {};
    var yrs = extra.years != null ? extra.years : yrsOf(c), yw = yrs === 1 ? "1 year" : (yrs > 1 ? yrs + " years" : "a while");
    return body.replace(/\{name\}/g, greetName(c)).replace(/\{community\}/g, extra.community || String(c.city || "").trim() || "your area").replace(/\{yearsWord\}/g, yw);
  }
  function tplById(id) { for (var i = 0; i < WA_TEMPLATES.length; i++) if (WA_TEMPLATES[i].id === id) return WA_TEMPLATES[i]; return null; }
  function defaultTpl(c) { return (c.source === "Flyer" || (c.tags || []).indexOf("src:flyer") >= 0) ? "flyer-warm" : ""; }
  function defaultMsg(c) { var t = tplById(defaultTpl(c)); return t ? fillMsg(t.body, c) : ""; }
  function waUrl(c, text) { return "https://wa.me/" + String(c.phone || "").replace(/\D/g, "") + (text ? "?text=" + encodeURIComponent(text) : ""); }
  function updateWa() { var c = S.contacts.get(S.sheetId), a = $("#shWaOpen"), m = $("#shMsg"); if (!c || !a || !m) return; a.hidden = !c.phone; a.href = waUrl(c, m.value.trim()); }
  function rhythm(c) { if (c.stage === "Past client") return 90; if (c.stage === "Closed") return 14; return RHYTHM[c.temp] || 30; }
  function cleanTag(v) { v = String(v || "").toLowerCase().trim(); var i = v.indexOf(":"); return i > 0 ? slug(v.slice(0, i)) + ":" + slug(v.slice(i + 1)) : slug(v); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function rank(c) { return (c.stage === "New" ? 0 : 1) * 10 + Math.max(TEMPS.indexOf(c.temp), 0); }
  function byPriority(a, b) { return rank(a) - rank(b) || (a.next || "").localeCompare(b.next || ""); }
  function all() { return Array.from(S.contacts.values()); }
  function dueList() { var t = today(); return all().filter(function (c) { return c.stage !== "Dead" && c.next && c.next <= t; }).sort(byPriority); }
  function pill(t) { return t ? '<span class="pill ' + esc(t) + '">' + esc(t[0].toUpperCase() + t.slice(1)) + "</span>" : ""; }
  function dueText(c) { if (!c.next) return "No date"; var d = diff(c.next, today()); if (d > 0) return '<span class="late">' + d + (d === 1 ? " day" : " days") + " overdue</span>"; if (d === 0) return "Due today"; return "Due " + fdate(c.next); }

  /* ---------- feedback ---------- */
  var toastTimer;
  function toast(msg) { var h = $("#toastHost"); h.innerHTML = '<div class="toast" role="status">' + esc(msg) + "</div>"; clearTimeout(toastTimer); toastTimer = setTimeout(function () { h.innerHTML = ""; }, 3200); }

  /* ---------- storage ---------- */
  var queue = {};
  /* One write at a time per contact. While a write is in flight, live updates for that contact are ignored (see applyRemote),
     so a slow echo can never flicker an older value back. If a write fails, onFail puts the screen back the way it was. */
  function chain(key, fn, onFail) {
    S.pend[key] = (S.pend[key] || 0) + 1;
    var p = (queue[key] || Promise.resolve()).then(fn).catch(function (e) {
      if (onFail) onFail();
      toast("Not saved: " + ((e && (e.message || e.code)) || "unknown error") + ". Check your connection."); scheduleRender();
    }).then(function (r) { S.pend[key]--; if (!S.pend[key]) delete S.pend[key]; return r; });
    queue[key] = p; return p;
  }
  function save(id, fields) {
    var c = S.contacts.get(id); if (!c || !S.user) return Promise.resolve();
    var prev = {}; Object.keys(fields).forEach(function (k) { prev[k] = c[k]; });
    S.contacts.set(id, Object.assign({}, c, fields)); scheduleRender();
    return chain("c:" + id, function () { return Store.patch(id, fields); }, function () {
      var cur = S.contacts.get(id); if (cur) S.contacts.set(id, Object.assign({}, cur, prev));
    }).then(function (data) {
      if (data && !S.pend["c:" + id] && S.contacts.has(id)) { S.contacts.set(id, data); scheduleRender(); }
    });
  }
  function saveSettings(fields) {
    var prev = S.settings;
    S.settings = Object.assign({}, S.settings, fields); scheduleRender();
    if (!S.user) return Promise.resolve();
    var snap = S.settings;
    return chain("settings", function () { return Store.putSettings(snap); }, function () { S.settings = prev; });
  }

  /* ---------- render scheduling ---------- */
  var raf = 0;
  function scheduleRender() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; render(); }); }

  function render() {
    $("#title").textContent = TITLES[S.tab];
    var due = dueList().length;
    $("#subtitle").textContent = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }) + "";
    var badge = $("#dueBadge"); badge.hidden = !due; badge.textContent = due > 99 ? "99+" : due;
    document.querySelectorAll(".tabs button").forEach(function (b) { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("#warnBar").innerHTML = S.offline ? '<div class="warn">Can\'t reach the server right now. ' + (S.contacts.size ? 'You are looking at your last saved copy, and changes will not save until the connection is back.' : 'Your contacts will show up here as soon as it is back.') + (S.loadError ? ' <span class="muted">(' + esc(S.loadError) + ')</span>' : '') + ' <button class="lnk" type="button" data-act="refresh">Try again</button></div>' : (S.connectNote && !S.loaded ? '<div class="warn">Still connecting to your database...</div>' : "");
    renderBulk();
    if (!S.user) return;
    if (!S.loaded) { $("#view").innerHTML = '<div class="empty"><h2>Opening your contacts</h2><p>Connecting to the database.</p></div>'; return; }
    if (S.tab === "lists") { renderLists(); }
    else if (S.contacts.size === 0 && S.offline) $("#view").innerHTML = '<div class="card empty"><h2>Can\'t load your contacts</h2><p>Check your connection, then tap Try again above.</p></div>';
    else if (S.contacts.size === 0) renderEmpty();
    else if (S.tab === "today") renderToday();
    else if (S.tab === "pipeline") renderPipeline();
    else renderMore();
    if (S.sheetId === "__match") renderMatchResults(); else if (S.sheetId) refreshSheetParts();
  }

  /* ---------- empty / restore ---------- */
  function renderEmpty() {
    $("#view").innerHTML = '<div class="card empty"><h2>No contacts yet</h2><p>Restore your backup file to bring your contacts in, or add your first lead with the button above.</p></div><div class="card stack" style="margin-top:12px"><h2>Restore a backup</h2>' + restoreCard() + "</div>";
  }
  function restoreCard() {
    var r = S.restoring, p = S.pendingRestore;
    if (r) return '<p class="note" style="margin:0">Restoring. Keep this page open until it finishes.</p><div class="prog"><i style="width:' + Math.round(r.done / Math.max(r.total, 1) * 100) + '%"></i></div><div class="note num">' + r.done + " of " + r.total + "</div>";
    var err = S.restoreError ? '<p class="late" style="margin:0">' + esc(S.restoreError) + "</p>" : "";
    if (p) return '<p style="margin:0"><b class="num">' + p.rows.length + "</b> contacts in <b>" + esc(p.name) + '</b>.' + (p.settings ? " Goals and closed deals come back too." : "") + ' Contacts with the same ID are replaced by the backup.</p><div class="row"><button class="btn primary" type="button" data-act="restorego">Restore ' + p.rows.length + ' contacts</button><button class="btn" type="button" data-act="restorecancel">Cancel</button></div>' + err;
    return '<label class="btn" style="text-align:center;cursor:pointer">Choose a backup file<input id="restoreFile" type="file" accept=".json,application/json" hidden></label><p class="note" style="margin:0">Use the .json file from Download backup.</p>' + err;
  }
  function readRestore(file) {
    S.restoreError = "";
    if (!file) return;
    var fr = new FileReader();
    fr.onerror = function () { S.restoreError = "Could not read that file."; render(); };
    fr.onload = function () {
      try {
        var j = JSON.parse(String(fr.result || ""));
        var rows = Array.isArray(j) ? j : (j && Array.isArray(j.contacts) ? j.contacts : null);
        if (!rows) throw new Error("This does not look like a Closing Desk backup.");
        rows = rows.filter(function (r) { return r && typeof r === "object" && typeof r.id === "string" && r.id; });
        if (!rows.length) throw new Error("No contacts found in that file.");
        var ids = {}; rows = rows.filter(function (r) { if (ids[r.id]) return false; ids[r.id] = 1; return true; });
        S.pendingRestore = { name: file.name, rows: rows, settings: (j && !Array.isArray(j) && j.settings && typeof j.settings === "object") ? j.settings : null };
      } catch (e) { S.restoreError = (e && e.message) || "Could not read that file."; S.pendingRestore = null; }
      render();
    };
    fr.readAsText(file);
  }
  function runRestore() {
    var p = S.pendingRestore; if (!p || S.restoring || !S.user) return;
    S.restoreError = ""; S.restoring = { done: 0, total: p.rows.length }; render();
    Store.bulkPut(p.rows, function (d, t) { S.restoring = { done: d, total: t }; scheduleRender(); }).then(function () {
      return p.settings ? Store.putSettings(Object.assign({}, DEFAULT_SETTINGS, p.settings)) : null;
    }).then(function () {
      S.restoring = null; S.pendingRestore = null; toast("Restored " + p.rows.length + " contacts"); return reload();
    }).catch(function (e) {
      S.restoring = null; S.restoreError = "Restore stopped: " + ((e && e.message) || "unknown error") + ". Nothing was lost. Tap Restore to try again."; scheduleRender();
    });
  }

  /* ---------- Moments: birthdays and home anniversaries ---------- */
  function mmdd(v) { var m = /(\d\d)-(\d\d)$/.exec(v || ""); return m ? m[1] + "-" + m[2] : ""; }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function occ(md, y) { if (md === "02-29" && !isLeap(y)) md = "02-28"; return y + "-" + md; }
  function closeDateOf(c) {
    var best = c.closeDate || "";
    (S.settings.deals || []).forEach(function (d) { if (d.contact === c.id && d.date && d.date > best) best = d.date; });
    return best;
  }
  function moments() {
    var t = today(), y = Number(t.slice(0, 4)), lo = addDays(t, -3), hi = addDays(t, 7), out = [];
    all().forEach(function (c) {
      if (c.stage === "Dead") return;
      var done = c.moments || [], b = mmdd(c.birthday), cd = closeDateOf(c), cm = mmdd(cd), cy = Number(String(cd).slice(0, 4));
      [y - 1, y, y + 1].forEach(function (yy) {
        if (b) { var d = occ(b, yy); if (d >= lo && d <= hi && done.indexOf("b" + yy) < 0) out.push({ c: c, kind: "birthday", date: d, key: "b" + yy, years: 0 }); }
        if (cm && yy - cy >= 1) { var d2 = occ(cm, yy); if (d2 >= lo && d2 <= hi && done.indexOf("a" + yy) < 0) out.push({ c: c, kind: "anniversary", date: d2, key: "a" + yy, years: yy - cy }); }
      });
    });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date) || byPriority(a.c, b.c); });
  }
  function momentLabel(m) {
    var when = m.date === today() ? "today" : (m.date < today() ? "missed " + fdate(m.date) : fdate(m.date));
    return m.kind === "birthday" ? "Birthday, " + when : m.years + "-year home anniversary, " + when;
  }
  function momentRow(m) {
    var c = m.c, msg = fillMsg(tplById(m.kind).body, c, { years: m.years });
    return '<div class="mrow"><button class="main" type="button" data-open="' + esc(c.id) + '"><span class="nm">' + esc(nm(c)) + '</span><span class="ln"><span>' + esc(momentLabel(m)) + "</span></span></button>" +
      (c.phone ? '<a class="lnk" href="' + esc(waUrl(c, msg)) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
      '<button class="lnk ghost" type="button" data-act="momentdone" data-id="' + esc(c.id) + '" data-key="' + esc(m.key) + '" data-kind="' + esc(m.kind) + '">Done</button></div>';
  }
  function momentsCard() {
    var ms = moments(); if (!ms.length) return "";
    var shown = ms.slice(0, 8);
    return '<div class="card" style="margin-bottom:12px"><div class="sec" style="margin:0 0 4px"><h2>Moments this week</h2><span class="meta num">' + ms.length + '</span></div>' + shown.map(momentRow).join("") + (ms.length > shown.length ? '<p class="note" style="margin:8px 0 0">' + (ms.length - shown.length) + " more coming up</p>" : "") + '<p class="note" style="margin:8px 0 0">Tap Done after you send. Add birthdays and closing dates inside a contact.</p></div>';
  }
  var TOUCH_RE = /^(Talked|Sent a message|No answer|Call:|Text:|WhatsApp:|Email:|Meeting:|Note:|Birthday wishes|Home anniversary)/;
  function weekStats() {
    var since = addDays(today(), -6), touches = 0, leads = 0;
    all().forEach(function (c) {
      (c.log || []).forEach(function (l) { if (l.d >= since && TOUCH_RE.test(l.t || "")) touches++; });
      if (c.added && c.added >= since) leads++;
    });
    return { touches: touches, leads: leads, deals: (S.settings.deals || []).filter(function (d) { return d.date >= since; }).length };
  }
  function weekCard() {
    var w = weekStats();
    return '<div class="card wk" style="margin-bottom:12px"><div class="lbl">Last 7 days</div><div class="three"><div><b class="num">' + w.touches + "</b><span>touches</span></div><div><b class=\"num\">" + w.leads + "</b><span>new leads</span></div><div><b class=\"num\">" + w.deals + "</b><span>deals closed</span></div></div></div>";
  }

  /* ---------- Buyer profile + match ---------- */
  function money(v) {
    var t = String(v == null ? "" : v).toLowerCase().replace(/[$,\s]/g, ""), mult = 1;
    if (/k$/.test(t)) { mult = 1000; t = t.slice(0, -1); } else if (/m$/.test(t)) { mult = 1000000; t = t.slice(0, -1); }
    var n = parseFloat(t) * mult; return isFinite(n) && n > 0 ? Math.round(n) : "";
  }
  function fmtMoney(n) { if (!n) return ""; return n >= 1000000 ? "$" + (n / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1000) + "k"; }
  function budgetText(b) { b = b || {}; return b.min && b.max ? fmtMoney(b.min) + " to " + fmtMoney(b.max) : (b.max ? "up to " + fmtMoney(b.max) : (b.min ? "from " + fmtMoney(b.min) : "no budget yet")); }
  function areaHit(areas, area) {
    var a = String(area || "").toLowerCase().trim(); if (!a) return false;
    return String(areas || "").toLowerCase().split(/[,;\/]+/).some(function (tk) { tk = tk.trim(); return tk.length >= 3 && (tk.indexOf(a) >= 0 || a.indexOf(tk) >= 0); });
  }
  function hasProfile(c) { var b = c.buy || {}; return !!(b.min || b.max || b.areas || (b.types || []).length) || c.kind === "buyer" || c.kind === "investor"; }
  function matchBuyers(q) {
    var out = [], skipped = 0;
    all().forEach(function (c) {
      if (c.stage === "Dead" || !hasProfile(c)) return;
      var b = c.buy || {}, score = 0, why = [], bad = false;
      if (q.price) {
        if (b.max && q.price > b.max * 1.05) bad = true;
        else if (b.min && q.price < b.min * 0.8) bad = true;
        else if (b.max || b.min) { score += 3; why.push("budget fits"); } else why.push("no budget on file");
      }
      if (q.type) {
        if ((b.types || []).length) { if (b.types.indexOf(q.type) >= 0) { score += 2; why.push(q.type.toLowerCase()); } else bad = true; } else why.push("no type on file");
      }
      if (q.beds && b.beds && Number(b.beds) > q.beds) bad = true;
      if (bad) { skipped++; return; }
      if (q.area) { if (b.areas) { if (areaHit(b.areas, q.area)) { score += 3; why.push("area match"); } else why.push("different area"); } else why.push("no area on file"); }
      if (b.pre === "Approved") { score += 1; why.push("pre-approved"); }
      if (b.time === "Now") { score += 1; why.push("ready now"); }
      if (c.temp === "hot") score += 1;
      out.push({ c: c, score: score, why: why });
    });
    out.sort(function (a, b) { return b.score - a.score || byPriority(a.c, b.c); });
    return { rows: out, skipped: skipped };
  }
  function openMatch() {
    $("#sheetHost").innerHTML = '<div class="veil" id="veil"><div class="sheet" role="dialog" aria-modal="true" aria-label="Match buyers"><div class="sheet-top"><h2>Match buyers</h2><button class="btn" type="button" data-act="closesheet">Close</button></div><div class="stack">' +
      '<p class="note" style="margin:0">Enter the home. You get the buyers whose profile fits it. Only buyers with a profile show up, so fill profiles in as you talk to people.</p>' +
      '<div class="two"><label>Price ($)<input class="field num" id="mPrice" inputmode="numeric" placeholder="650000"></label><label>Community<input class="field" id="mArea" placeholder="Cranston"></label></div>' +
      '<div class="two"><label>Home type<select class="field" id="mType"><option value="">Any</option>' + BTYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + '</select></label><label>Bedrooms<select class="field" id="mBeds"><option value="">Any</option>' + [1, 2, 3, 4, 5].map(function (n) { return "<option>" + n + "</option>"; }).join("") + '</select></label></div>' +
      '<div id="mResults"></div></div></div></div>';
    $("#veil").addEventListener("click", function (e) { if (e.target.id === "veil") closeSheet(); });
    S.sheetId = "__match"; renderMatchResults();
  }
  function renderMatchResults() {
    var host = $("#mResults"); if (!host) return;
    var q = { price: money($("#mPrice").value) || 0, area: $("#mArea").value.trim(), type: $("#mType").value, beds: Number($("#mBeds").value) || 0 };
    var r = matchBuyers(q), h = "";
    var anyProfile = all().some(hasProfile);
    if (!anyProfile) { host.innerHTML = '<div class="card empty"><p style="margin:0">No buyer profiles yet. Open a contact, tap Add buyer profile, and fill in budget, areas and home type.</p></div>'; return; }
    h += '<div class="sec" style="margin:4px 0"><h2 class="num">' + r.rows.length + (r.rows.length === 1 ? " buyer fits" : " buyers fit") + '</h2><span class="meta num">' + r.skipped + " ruled out</span></div>";
    h += r.rows.slice(0, 40).map(function (m) {
      var c = m.c, b = c.buy || {}, msg = fillMsg(tplById("listing-match").body, c, { community: q.area || c.city });
      return '<div class="mrow"><button class="main" type="button" data-open="' + esc(c.id) + '"><span class="nm">' + esc(nm(c)) + '</span><span class="ln">' + pill(c.temp) + "<span>" + esc(budgetText(b)) + "</span>" + (b.areas ? "<span>" + esc(b.areas) + "</span>" : "") + '</span><span class="why">' + esc(m.why.join(", ")) + "</span></button>" + (c.phone ? '<a class="lnk" href="' + esc(waUrl(c, msg)) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") + "</div>";
    }).join("");
    if (r.rows.length > 40) h += '<p class="note">Showing the best 40.</p>';
    if (r.rows.length) h += '<p class="note">Check the home against each profile before you send. Say only what is true about the listing.</p>';
    host.innerHTML = h;
  }
  function buyFormHtml() {
    return '<div class="card stack"><div class="two"><label>Budget from ($)<input class="field num" id="buyMin" inputmode="numeric" placeholder="500000"></label><label>Budget up to ($)<input class="field num" id="buyMax" inputmode="numeric" placeholder="750000"></label></div>' +
      '<label>Areas<input class="field" id="buyAreas" placeholder="Cranston, Mahogany, Airdrie"></label>' +
      '<div><div class="lbl">Home type</div><div id="buyTypes"></div></div>' +
      '<div class="two"><label>Bedrooms (at least)<select class="field" id="buyBeds"><option value="">Any</option>' + [1, 2, 3, 4, 5].map(function (n) { return "<option>" + n + "</option>"; }).join("") + '</select></label><label>Timeline<select class="field" id="buyTime"><option value="">Not sure</option>' + BTIMES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + "</select></label></div>" +
      '<div><div class="lbl">Pre-approval</div><div id="buyPre"></div></div>' +
      '<label>Must-haves<textarea class="field" id="buyMust" rows="2" placeholder="Basement suite, 2-car garage, near a school"></textarea></label></div>';
  }
  function refreshBuy(c) {
    var host = $("#shBuy"); if (!host) return;
    var want = (c.buy || c.kind === "buyer" || c.kind === "investor") ? "form" : "button";
    if (host.dataset.mode !== want) { host.innerHTML = want === "form" ? buyFormHtml() : '<button class="btn" type="button" data-act="addbuy">Add buyer profile</button>'; host.dataset.mode = want; }
    if (want !== "form") return;
    var b = c.buy || {}, setv = function (id, v) { var el = $(id); if (el && el !== document.activeElement) el.value = v; };
    setv("#buyMin", b.min || ""); setv("#buyMax", b.max || ""); setv("#buyAreas", b.areas || ""); setv("#buyBeds", b.beds || ""); setv("#buyTime", b.time || ""); setv("#buyMust", b.must || "");
    $("#buyTypes").innerHTML = '<div class="chips" role="group" aria-label="Home type">' + BTYPES.map(function (v) { return '<button class="chip" type="button" data-set="btype" data-v="' + esc(v) + '" aria-pressed="' + ((b.types || []).indexOf(v) >= 0 ? "true" : "false") + '">' + esc(v) + "</button>"; }).join("") + "</div>";
    $("#buyPre").innerHTML = chips("bpre", BPRE, b.pre || "");
  }
  function readBuy(c) {
    var b = Object.assign({}, c.buy || {}); b.types = (b.types || []).slice();
    b.min = money($("#buyMin").value); b.max = money($("#buyMax").value); b.areas = $("#buyAreas").value.trim(); b.beds = $("#buyBeds").value; b.time = $("#buyTime").value; b.must = $("#buyMust").value.trim();
    if (b.pre == null) b.pre = "";
    return b;
  }

  /* ---------- Scorecard ---------- */
  var FUNNEL_MTG = ["Meeting set", "Active", "Under contract", "Closed", "Past client"];
  function periodStart() { var p = S.period || "90"; return p === "all" ? "0000-00-00" : addDays(today(), -Number(p)); }
  function scoreRows() {
    var start = periodStart(), rows = {}, byId = {};
    function row(s) { s = s || "Unknown"; return rows[s] || (rows[s] = { source: s, leads: 0, mtg: 0, deals: 0, spend: 0 }); }
    all().forEach(function (c) {
      byId[c.id] = c;
      if (c.added && c.added >= start) { var r = row(c.source); r.leads++; if (FUNNEL_MTG.indexOf(c.stage) >= 0) r.mtg++; }
    });
    (S.settings.deals || []).forEach(function (d) { if (d.date >= start) row(byId[d.contact] && byId[d.contact].source).deals++; });
    (S.settings.spend || []).forEach(function (x) { if (x.date >= start) row(x.source).spend += Number(x.amount) || 0; });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.leads - a.leads || b.spend - a.spend; });
  }
  function dollars(n) { return "$" + Math.round(n).toLocaleString("en-CA"); }
  function scorecardCard() {
    var rows = scoreRows(), p = S.period || "90", sp = (S.settings.spend || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5);
    var h = '<div class="card stack" style="margin-bottom:12px"><h2>Scorecard</h2><div class="chips" role="group" aria-label="Period">' + [["30", "30 days"], ["90", "90 days"], ["all", "All time"]].map(function (x) { return '<button class="chip" type="button" data-act="period" data-v="' + x[0] + '" aria-pressed="' + (p === x[0] ? "true" : "false") + '">' + x[1] + "</button>"; }).join("") + "</div>";
    if (rows.length) {
      h += '<div class="tbl"><table class="rh"><tr><th>Source</th><th>Leads</th><th>Mtgs</th><th>Deals</th><th>Spend</th><th>Per lead</th></tr>' + rows.map(function (r) {
        return "<tr><td>" + esc(r.source) + '</td><td class="num">' + r.leads + '</td><td class="num">' + r.mtg + '</td><td class="num">' + r.deals + '</td><td class="num">' + (r.spend ? dollars(r.spend) : "") + '</td><td class="num">' + (r.spend && r.leads ? dollars(r.spend / r.leads) : "") + "</td></tr>";
      }).join("") + "</table></div>";
    } else h += '<p class="note" style="margin:0">No leads, deals or spend in this period yet. Leads count from the date they were added.</p>';
    h += '<div class="lbl">Log ad spend</div><div class="two"><label>Source<select class="field" id="spSource">' + SOURCES.map(function (x) { return "<option" + (x === "Meta Ads" ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + '</select></label><label>Amount ($)<input class="field num" id="spAmount" inputmode="decimal" placeholder="150"></label></div><div class="row"><input class="field" style="width:auto" id="spDate" type="date" value="' + today() + '"><button class="btn small" type="button" data-act="addspend">Add spend</button></div>';
    if (sp.length) h += sp.map(function (x) { return '<div class="row" style="justify-content:space-between"><span>' + esc(x.source) + ' <span class="muted num">' + esc(fdate(x.date)) + '</span></span><span class="row"><b class="num">' + dollars(x.amount) + '</b><button class="btn small danger" type="button" data-act="delspend" data-id="' + esc(x.id) + '">Remove</button></span></div>'; }).join("");
    return h + "</div>";
  }

  /* ---------- Today ---------- */
  function scoreCard(label, n, goal) { var pct = Math.min(100, Math.round(n / Math.max(goal, 1) * 100)); return '<div class="card"><div class="lbl">' + esc(label) + '</div><div class="big num">' + n + ' <small>/ ' + goal + '</small></div><div class="bar" role="progressbar" aria-valuenow="' + n + '" aria-valuemin="0" aria-valuemax="' + goal + '" aria-label="' + esc(label) + '"><i style="width:' + pct + '%"></i></div></div>'; }
  function dealCount(type) { var y = String(S.settings.goalYear); return (S.settings.deals || []).filter(function (d) { return d.type === type && String(d.date || "").slice(0, 4) === y; }).length; }
  function reachRow(c) {
    var out = "";
    if (c.phone) {
      var d = c.phone.replace(/\D/g, "");
      out += '<span class="phone">' + esc(fphone(c.phone)) + '</span><button class="lnk ghost" type="button" data-act="copy" data-v="' + esc(c.phone) + '">Copy</button><a class="lnk" href="tel:' + esc(c.phone) + '">Call</a><a class="lnk" href="' + esc(waUrl(c, defaultMsg(c))) + '" target="_blank" rel="noopener">WhatsApp</a>';
    }
    if (c.email) out += '<span class="phone">' + esc(c.email) + '</span><button class="lnk ghost" type="button" data-act="copy" data-v="' + esc(c.email) + '">Copy</button><a class="lnk ghost" href="mailto:' + esc(c.email) + '">Email</a>';
    if (!out) out = '<span class="note">No phone or email yet</span>';
    return out;
  }
  function dueCard(c) {
    return '<article class="card due"><button class="due-head" type="button" data-open="' + esc(c.id) + '"><span class="nm">' + esc(nm(c)) + '</span><span class="ln">' + pill(c.temp) + "<span>" + esc(c.stage) + "</span><span>" + dueText(c) + "</span>" + (c.kind ? "<span>" + esc(c.kind) + "</span>" : "") + "</span></button>" +
      '<div class="reach">' + reachRow(c) + '</div><div class="outcomes"><button type="button" data-act="talked" data-id="' + esc(c.id) + '">Talked</button><button type="button" data-act="messaged" data-id="' + esc(c.id) + '">Messaged</button><button type="button" data-act="noanswer" data-id="' + esc(c.id) + '">No answer</button><button type="button" data-act="later" data-id="' + esc(c.id) + '">Later</button></div></article>';
  }
  function renderToday() {
    var due = dueList(), cap = S.settings.dailyCap || 15, shown = S.showAllDue ? due : due.slice(0, cap), h = "";
    h += '<div class="score">' + scoreCard(S.settings.goalYear + " listings", dealCount("listing"), S.settings.listingsGoal) + scoreCard(S.settings.goalYear + " buyers", dealCount("buyer"), S.settings.buyersGoal) + "</div>";
    h += weekCard() + momentsCard();
    if (due.length) {
      h += '<div class="sec"><h2>Reach out today</h2><span class="meta num">' + shown.length + " of " + due.length + " due</span></div><div class=\"stack\">" + shown.map(dueCard).join("") + "</div>";
      if (due.length > shown.length) h += '<p class="more"><button type="button" data-act="showall">Show all ' + due.length + " due</button> (your daily list is capped at " + cap + ")</p>";
    } else {
      var up = all().filter(function (c) { return c.stage !== "Dead" && c.next; }).sort(function (a, b) { return a.next.localeCompare(b.next) || byPriority(a, b); }).slice(0, 8);
      h += '<div class="card empty"><h2>Nothing due today</h2><p>Your next follow-ups are below. They appear here on their date.</p></div>';
      if (up.length) h += '<div class="sec"><h2>Coming up</h2><span class="meta">next ' + up.length + "</span></div><div>" + up.map(function (c) { return listRow(c, false); }).join("") + "</div>";
    }
    $("#view").innerHTML = h;
  }

  /* ---------- Pipeline ---------- */
  function pipeCard(c, i) {
    var nextStage = STAGES.indexOf(c.stage) >= 0 && STAGES.indexOf(c.stage) < STAGES.length - 1 ? STAGES[STAGES.indexOf(c.stage) + 1] : (c.stage === "Nurture" ? "Contacted" : "");
    return '<div class="pc"><button class="main" type="button" data-open="' + esc(c.id) + '"><span class="nm">' + esc(nm(c)) + '</span><span class="ln">' + pill(c.temp) + "<span>" + esc(c.next ? fdate(c.next) : "no date") + "</span></span></button>" + (nextStage ? '<button class="adv" type="button" data-act="advance" data-id="' + esc(c.id) + '" aria-label="Move ' + esc(nm(c)) + " to " + esc(nextStage) + '" title="Move to ' + esc(nextStage) + '">&rarr;</button>' : "") + "</div>";
  }
  function renderPipeline() {
    var by = {}; ALL_STAGES.forEach(function (s) { by[s] = []; });
    all().forEach(function (c) { (by[c.stage] || (by[c.stage] = [])).push(c); });
    var h = '<p class="note">Tap a card to open it. The arrow moves it to the next stage. Nurture holds long-term contacts; use Lists to work through them.</p><div class="board">';
    ALL_STAGES.forEach(function (s) {
      var lst = by[s].sort(byPriority), lim = S.pipeMore[s] || 25, shown = lst.slice(0, lim);
      h += '<section class="col" aria-label="' + esc(s) + '"><h3>' + esc(s) + "<span class=\"num\">" + lst.length + "</span></h3>";
      h += shown.length ? shown.map(pipeCard).join("") : '<div class="note" style="padding:6px 4px">Empty</div>';
      if (lst.length > shown.length) h += '<div class="more"><button type="button" data-act="pipemore" data-stage="' + esc(s) + '">Show 25 more</button> <span class="num">(' + (lst.length - shown.length) + " hidden)</span></div>";
      h += "</section>";
    });
    $("#view").innerHTML = h + "</div>";
  }

  /* ---------- Lists ---------- */
  function filtered() {
    var f = S.f, q = f.q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
    return all().filter(function (c) {
      if (f.prov && c.province !== f.prov) return false;
      if (f.temp && c.temp !== f.temp) return false;
      if (f.stage && c.stage !== f.stage) return false;
      if (f.kind && c.kind !== f.kind) return false;
      if (f.source && c.source !== f.source) return false;
      if (f.email && !c.email) return false;
      if (f.phone && !c.phone) return false;
      if (f.tag && !(c.tags || []).some(function (t) { return t.indexOf(f.tag.toLowerCase().trim()) >= 0; })) return false;
      if (q) {
        var hay = (nm(c) + " " + (c.email || "") + " " + (c.city || "") + " " + (c.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) < 0 && !(qd.length >= 3 && (c.phone || "").replace(/\D/g, "").indexOf(qd) >= 0)) return false;
      }
      return true;
    }).sort(function (a, b) { return (a.last || a.first || "").toLowerCase().localeCompare((b.last || b.first || "").toLowerCase()) || (a.first || "").localeCompare(b.first || ""); });
  }
  function opt(list, v, label) { return '<option value="">' + esc(label) + "</option>" + list.map(function (x) { return '<option' + (x === v ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }
  function listRow(c, withCheck) {
    return '<div class="li">' + (withCheck ? '<input type="checkbox" data-sel="' + esc(c.id) + '"' + (S.selected.has(c.id) ? " checked" : "") + ' aria-label="Select ' + esc(nm(c)) + '">' : "") + '<button class="main" type="button" data-open="' + esc(c.id) + '"><span class="nm">' + esc(nm(c)) + '</span><span class="ln">' + pill(c.temp) + "<span>" + esc(c.stage) + "</span><span>" + esc(c.province) + "</span>" + (c.phone ? '<span class="num">' + esc(fphone(c.phone)) + "</span>" : "") + (c.next ? "<span>next " + esc(fdate(c.next)) + "</span>" : "") + "</span></button></div>";
  }
  var listsShellFor = "";
  function renderLists() {
    if (S.contacts.size === 0) { renderEmpty(); listsShellFor = ""; return; }
    if (listsShellFor !== "on" || !$("#listResults")) {
      var provs = PROVS.filter(function (p) { return all().some(function (c) { return c.province === p; }); });
      var srcs = Array.from(new Set(all().map(function (c) { return c.source; }).filter(Boolean))).sort();
      $("#view").innerHTML = '<div class="filters"><input class="field wide" id="fq" type="search" placeholder="Search name, phone, email, tag" value="' + esc(S.f.q) + '" aria-label="Search">' +
        '<select class="field" id="fprov" aria-label="Province">' + opt(provs, S.f.prov, "All provinces") + '</select><select class="field" id="ftemp" aria-label="Temperature">' + opt(TEMPS, S.f.temp, "Any temperature") + "</select>" +
        '<select class="field" id="fstage" aria-label="Stage">' + opt(ALL_STAGES, S.f.stage, "Any stage") + '</select><select class="field" id="fkind" aria-label="Type">' + opt(KINDS, S.f.kind, "Any type") + "</select>" +
        '<select class="field" id="fsource" aria-label="Source">' + opt(srcs, S.f.source, "Any source") + '</select><input class="field" id="ftag" type="text" placeholder="Tag contains" value="' + esc(S.f.tag) + '" aria-label="Tag contains">' +
        '<div class="row wide"><label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="femail"' + (S.f.email ? " checked" : "") + '> Has email</label><label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="fphone"' + (S.f.phone ? " checked" : "") + '> Has phone</label><button class="btn small" type="button" data-act="clearf">Clear</button></div></div><div id="listResults"></div>';
      listsShellFor = "on";
    }
    var res = filtered(), lim = S.f.limit, shown = res.slice(0, lim), h = "";
    h += '<div class="sec" style="margin-top:6px"><h2 class="num">' + res.length + (res.length === 1 ? " contact" : " contacts") + '</h2><span class="row"><button class="btn small" type="button" data-act="match">Match buyers</button><button class="btn small" type="button" data-act="selmode">' + (S.selecting ? "Done" : "Select") + '</button><button class="btn small" type="button" data-act="export">Export CSV</button></span></div>';
    if (S.selecting) h += '<div class="row" style="margin-bottom:8px"><button class="btn small" type="button" data-act="selall" data-n="' + res.length + '">Select all ' + res.length + '</button><button class="btn small" type="button" data-act="selnone">Clear selection</button></div>';
    h += shown.map(function (c) { return listRow(c, S.selecting); }).join("");
    if (!res.length) h += '<div class="card empty"><p style="margin:0">No contacts match these filters.</p></div>';
    if (res.length > shown.length) h += '<p class="more"><button type="button" data-act="listmore">Show 60 more</button> <span class="num">(' + (res.length - shown.length) + " hidden)</span></p>";
    h += '<p class="note" style="margin-top:14px">Exports include name, email, phone, province, tags and stage. Notes are never exported.</p>';
    $("#listResults").innerHTML = h;
  }
  function renderBulk() {
    var host = $("#bulkHost");
    if (S.tab !== "lists" || !S.selecting) { host.innerHTML = ""; return; }
    var n = S.selected.size;
    if (host.firstChild && host.dataset.n === String(n)) return;
    host.dataset.n = String(n);
    host.innerHTML = '<div class="bulk"><div class="in"><strong class="num">' + n + ' selected</strong><select id="bTemp" aria-label="Set temperature"><option value="">Set temp</option>' + TEMPS.map(function (t) { return "<option>" + t + "</option>"; }).join("") + '</select><select id="bStage" aria-label="Set stage"><option value="">Set stage</option>' + ALL_STAGES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + '</select><select id="bKind" aria-label="Set type"><option value="">Set type</option>' + KINDS.map(function (t) { return "<option>" + t + "</option>"; }).join("") + '</select><input id="bTag" type="text" placeholder="Add tag" size="10" aria-label="Add tag"><button class="btn small primary" type="button" data-act="bulkgo"' + (n ? "" : " disabled") + ">Apply</button></div></div>";
  }
  function bulkApply() {
    var ids = Array.from(S.selected); if (!ids.length) return;
    var t = $("#bTemp").value, st = $("#bStage").value, k = $("#bKind").value, tag = cleanTag($("#bTag").value);
    if (!t && !st && !k && !tag) { toast("Pick something to apply"); return; }
    var td = today();
    toast("Updating " + ids.length + " contacts...");
    var jobs = [];
    ids.forEach(function (id) {
      var c = S.contacts.get(id); if (!c) return; var f = {};
      if (t) { f.temp = t; var cap = addDays(td, RHYTHM[t]); if (!c.next || c.next > cap) f.next = cap; }
      if (st) f.stage = st;
      if (k) f.kind = k === c.kind ? "" : k;
      if (tag && (c.tags || []).indexOf(tag) < 0) f.tags = (c.tags || []).concat([tag]);
      if (Object.keys(f).length) jobs.push([id, f]);
    });
    saveMany(jobs).then(function () { toast("Updated " + jobs.length + " contacts"); S.selected.clear(); S.selecting = false; $("#bulkHost").dataset.n = ""; scheduleRender(); }, function () {});
  }
  /* Saves many contacts in a few requests. Screen updates first; if the server refuses, everything is put back. */
  function saveMany(list) {
    if (!S.user || !list.length) return Promise.resolve();
    var prevs = [], items = [];
    list.forEach(function (j) {
      var id = j[0], c = S.contacts.get(id); if (!c) return;
      var p = {}; Object.keys(j[1]).forEach(function (k) { p[k] = c[k]; });
      prevs.push([id, p]); items.push({ id: id, fields: j[1] });
      S.contacts.set(id, Object.assign({}, c, j[1])); S.pend["c:" + id] = (S.pend["c:" + id] || 0) + 1;
    });
    scheduleRender();
    function release() { prevs.forEach(function (p) { var k = "c:" + p[0]; S.pend[k]--; if (!S.pend[k]) delete S.pend[k]; }); }
    return Store.patchMany(items).then(release, function (e) {
      release();
      prevs.forEach(function (p) { var cur = S.contacts.get(p[0]); if (cur) S.contacts.set(p[0], Object.assign({}, cur, p[1])); });
      toast("Not saved: " + ((e && (e.message || e.code)) || "unknown error") + ". Check your connection."); scheduleRender();
      throw e;
    });
  }
  function csvOf(rows) {
    var head = ["First name", "Last name", "Email", "Phone", "Province", "City", "Source", "Temperature", "Stage", "Tags"];
    var q = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [head.join(",")].concat(rows.map(function (c) { return [c.first, c.last, c.email, c.phone, c.province, c.city, c.source, c.temp, c.stage, (c.tags || []).join(" ")].map(q).join(","); })).join("\n");
  }
  /* Hands the file to the iPhone share sheet (Save to Files) when it can, otherwise a normal download. Resolves true if a file was handed over. */
  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime }), file = null;
    try { file = new File([blob], name, { type: mime }); } catch (e) {}
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    function anchor() {
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000); return true;
    }
    if (ios && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(function () { return true; }, function (e) { return e && e.name === "AbortError" ? false : anchor(); });
    }
    return Promise.resolve(anchor());
  }
  function exportCsv(rows, name) {
    if (!rows.length) { toast("Nothing to export"); return; }
    saveFile(name, csvOf(rows), "text/csv").then(function (ok) { if (ok) toast("Saved " + rows.length + " contacts"); });
  }
  function exportBackup() {
    var rows = all(); if (!rows.length) { toast("Nothing to back up yet"); return; }
    var data = { format: "closing-desk-backup", version: 1, exported: new Date().toISOString(), settings: S.settings, contacts: rows.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }) };
    saveFile("closing-desk-backup-" + today() + ".json", JSON.stringify(data), "application/json").then(function (ok) { if (ok) toast("Backup saved: " + rows.length + " contacts"); });
  }

  /* ---------- More ---------- */
  function renderMore() {
    var st = S.settings, deals = (st.deals || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var h = scorecardCard() + '<div class="card stack"><h2>Goals</h2><div class="two"><label>Listings<input class="field num" id="gList" type="number" min="0" value="' + st.listingsGoal + '"></label><label>Buyers<input class="field num" id="gBuy" type="number" min="0" value="' + st.buyersGoal + '"></label></div><div class="two"><label>Goal year<input class="field num" id="gYear" type="number" min="2026" value="' + st.goalYear + '"></label><label>Daily list size<input class="field num" id="gCap" type="number" min="1" max="100" value="' + st.dailyCap + '"></label></div><p class="note" style="margin:0">Deals count toward a goal when you mark a contact closed with a date in the goal year.</p></div>';
    h += '<div class="card stack" style="margin-top:12px"><h2>Follow-up rhythm</h2><table class="rh"><tr><th>Temperature</th><th>Next follow-up</th></tr>' + TEMPS.map(function (t) { return "<tr><td>" + pill(t) + "</td><td>" + RHYTHM_LABEL[t] + "</td></tr>"; }).join("") + '<tr><td>Closed</td><td>after 2 weeks</td></tr><tr><td>Past client</td><td>every 3 months</td></tr></table><p class="note" style="margin:0">Logging a touch sets the next date from this rhythm. No answer retries in 3 days.</p></div>';
    h += '<div class="card stack" style="margin-top:12px"><h2>Schedule</h2><p class="note" style="margin:0">Spread every follow-up date out again from today, by temperature. Use this on your first live day so Today starts clean.</p><button class="btn' + (S.confirmSpread ? " primary" : "") + '" type="button" data-act="spread">' + (S.confirmSpread ? "Tap again to reschedule " + all().filter(function (c) { return c.stage !== "Dead"; }).length + " contacts" : "Spread dates from today") + "</button></div>";
    h += '<div class="card stack" style="margin-top:12px"><h2>Closed deals</h2>' + (deals.length ? deals.map(function (d) { return '<div class="row" style="justify-content:space-between"><span>' + esc(d.name) + ' <span class="muted">' + (d.type === "listing" ? "listing" : "buyer") + ", " + esc(fdate(d.date)) + '</span></span><button class="btn small danger" type="button" data-act="deldeal" data-id="' + esc(d.id) + '">Remove</button></div>'; }).join("") : '<p class="note" style="margin:0">No deals yet. Open a contact and tap Mark closed.</p>') + "</div>";
    h += '<div class="card stack" style="margin-top:12px"><h2>Backup</h2><button class="btn primary" type="button" data-act="backup">Download backup (.json)</button><button class="btn" type="button" data-act="exportall">Export contact list (.csv)</button><p class="note" style="margin:0">The backup has everything, including your private notes, so keep that file somewhere safe. The CSV leaves notes out. Download a backup after any big session.</p></div>';
    h += '<div class="card stack" style="margin-top:12px"><h2>Restore a backup</h2>' + restoreCard() + "</div>";
    h += '<div class="card stack" style="margin-top:12px"><h2>Account</h2><div class="row" style="justify-content:space-between"><span class="muted">Signed in as</span><span style="overflow-wrap:anywhere">' + esc((S.user && S.user.email) || "") + '</span></div><div class="row" style="justify-content:space-between"><span class="muted">Connection</span><span>' + (S.offline ? "Offline, showing saved copy" : (S.live ? "Live sync on" : "Connected, sync starting")) + '</span></div><div class="row" style="justify-content:space-between"><span class="muted">Version</span><span class="num">' + APP_VERSION + '</span></div><button class="btn" type="button" data-act="refresh">Refresh from server</button><button class="btn danger" type="button" data-act="signout">Sign out</button></div>';
    $("#view").innerHTML = h;
  }
  function spread() {
    if (!S.confirmSpread) { S.confirmSpread = true; render(); setTimeout(function () { if (S.confirmSpread) { S.confirmSpread = false; scheduleRender(); } }, 6000); return; }
    S.confirmSpread = false; var td = today(), groups = {};
    all().forEach(function (c) { if (c.stage === "Dead") return; var k = c.stage === "New" ? "new" : (c.stage === "Past client" ? "past" : c.temp); (groups[k] = groups[k] || []).push(c); });
    var span = { "new": 0, past: 90, hot: 2, warm: 7, cold: 30, stale: 90 }, jobs = [];
    Object.keys(groups).forEach(function (k) { var lst = groups[k].sort(byPriority); lst.forEach(function (c, j) { jobs.push([c.id, addDays(td, Math.floor(j * (span[k] || 30) / lst.length))]); }); });
    toast("Rescheduling " + jobs.length + " contacts...");
    saveMany(jobs.map(function (j) { return [j[0], { next: j[1] }]; })).then(function () { toast("Follow-ups spread from today"); }, function () {});
  }

  /* ---------- actions ---------- */
  function touch(id, kind) {
    var c = S.contacts.get(id); if (!c) return; var t = today();
    var label = { talked: "Talked", messaged: "Sent a message", noanswer: "No answer" }[kind];
    var days = kind === "noanswer" ? 3 : rhythm(c), nx = addDays(t, days);
    var f = { lastTouch: t, next: nx, log: [{ d: t, t: label }].concat(c.log || []).slice(0, 60) };
    if (c.stage === "New" && kind !== "noanswer") f.stage = "Contacted";
    save(id, f); toast(nm(c) + ": next " + fdate(nx));
  }
  function setStage(id, stage) { var c = S.contacts.get(id); if (!c) return; var f = { stage: stage }; if (stage === "Closed") f.next = addDays(today(), 14); save(id, f); }
  function logNote(id, text, type) { var c = S.contacts.get(id); if (!c || !text.trim()) return; var t = today(); save(id, { lastTouch: t, log: [{ d: t, t: (type ? type + ": " : "") + text.trim() }].concat(c.log || []).slice(0, 60) }); }

  /* ---------- sheet ---------- */
  function chips(name, list, cur, labelFn) { return '<div class="chips" role="group" aria-label="' + esc(name) + '">' + list.map(function (v) { return '<button class="chip" type="button" data-set="' + esc(name) + '" data-v="' + esc(v) + '" aria-pressed="' + (v === cur ? "true" : "false") + '">' + esc(labelFn ? labelFn(v) : v) + "</button>"; }).join("") + "</div>"; }
  function openSheet(id) {
    var c = S.contacts.get(id); if (!c) return; S.sheetId = id;
    var cap = function (s) { return s[0].toUpperCase() + s.slice(1); };
    $("#sheetHost").innerHTML = '<div class="veil" id="veil"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(nm(c)) + '">' +
      '<div class="sheet-top"><h2 id="shName"></h2><button class="btn" type="button" data-act="closesheet">Close</button></div>' +
      '<div id="shReach" class="reach" style="padding:0"></div>' +
      '<div class="sec-lbl">WhatsApp message</div><select class="field" id="shTpl" aria-label="Message template"><option value="">Blank chat</option>' + WA_TEMPLATES.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === defaultTpl(c) ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + '</select><textarea class="field" id="shMsg" rows="8" style="margin-top:8px" placeholder="Pick a template or type your own message">' + esc(defaultMsg(c)) + '</textarea><div class="row" style="margin-top:8px"><a class="btn primary" id="shWaOpen" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="' + esc(waUrl(c, defaultMsg(c))) + '">Open in WhatsApp</a><button class="btn" type="button" data-act="copymsg">Copy message</button></div><div class="note">Opens WhatsApp with this text ready. Send it there, then tap Messaged on Today.</div>' +
      '<div class="two" style="margin-top:12px"><label>First name<input class="field" id="shFirst" value="' + esc(c.first) + '"></label><label>Last name<input class="field" id="shLast" value="' + esc(c.last) + '"></label></div>' +
      '<div class="two" style="margin-top:8px"><label>Phone<input class="field" id="shPhone" inputmode="tel" value="' + esc(c.phone) + '"></label><label>Email<input class="field" id="shEmail" inputmode="email" value="' + esc(c.email) + '"></label></div>' +
      '<div class="two" style="margin-top:8px"><label>City<input class="field" id="shCity" value="' + esc(c.city) + '"></label><label>Province<select class="field" id="shProv">' + PROVS.map(function (p) { return "<option" + (p === c.province ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="sec-lbl">Stage</div><div id="shStage"></div><div class="sec-lbl">Temperature</div><div id="shTemp"></div><div class="sec-lbl">Type</div><div id="shKind"></div>' +
      '<div class="sec-lbl">Next follow-up</div><div class="row"><input class="field" style="width:auto" id="shNext" type="date" value="' + esc(c.next) + '"><div id="shQuick" class="row"></div></div><div class="note" id="shLast2"></div>' +
      '<div class="sec-lbl">Buyer profile</div><div id="shBuy"></div>' +
      '<div class="sec-lbl">Moments</div><div class="two"><label>Birthday<input class="field" id="shBday" type="date"></label><label>Closed with me<input class="field" id="shClose" type="date"></label></div><div class="note">Birthday year does not matter. These show on Today the week they happen.</div>' +
      '<div class="sec-lbl">Tags</div><div id="shTags" class="chips"></div><div class="row" style="margin-top:8px"><input class="field" style="flex:1" id="shTagIn" placeholder="Add a tag, like type:buyer"><button class="btn small" type="button" data-act="addtag">Add</button></div>' +
      '<div class="sec-lbl">Notes (private)</div><textarea class="field" id="shNotes">' + esc(c.notes) + "</textarea>" +
      '<div class="sec-lbl">History</div><div class="row"><select class="field" style="width:auto" id="shLogType" aria-label="Type of touch"><option>Call</option><option>Text</option><option>WhatsApp</option><option>Email</option><option>Meeting</option><option>Note</option></select><input class="field" style="flex:1" id="shLogIn" placeholder="What happened?"><button class="btn small" type="button" data-act="addlog">Log</button></div><div id="shLog" style="margin-top:6px"></div>' +
      '<div class="sec-lbl">Deal</div><div id="shDeal"></div>' +
      '<div class="sec-lbl">Other</div><div id="shOther" class="note"></div><div class="row" style="margin-top:14px" id="shDanger"></div>' +
      "</div></div>";
    $("#shName").textContent = nm(c);
    refreshSheetParts(); $("#veil").addEventListener("click", function (e) { if (e.target.id === "veil") closeSheet(); });
    $(".sheet").scrollTop = 0;
  }
  function closeSheet() { S.sheetId = null; S.dealMode = false; S.confirmDelete = false; $("#sheetHost").innerHTML = ""; scheduleRender(); }
  function refreshSheetParts() {
    var c = S.contacts.get(S.sheetId); if (!c || !$("#shStage")) return;
    var cap = function (s) { return s[0].toUpperCase() + s.slice(1); };
    $("#shName").textContent = nm(c);
    $("#shReach").innerHTML = reachRow(c);
    $("#shStage").innerHTML = chips("stage", ALL_STAGES, c.stage);
    $("#shTemp").innerHTML = chips("temp", TEMPS, c.temp, cap);
    $("#shKind").innerHTML = chips("kind", KINDS, c.kind, cap);
    var nx = $("#shNext"); if (nx && nx !== document.activeElement) nx.value = c.next || "";
    refreshBuy(c);
    var bd = $("#shBday"); if (bd && bd !== document.activeElement) bd.value = mmdd(c.birthday) ? "2000-" + mmdd(c.birthday) : "";
    var cl = $("#shClose"); if (cl && cl !== document.activeElement) cl.value = c.closeDate || "";
    $("#shQuick").innerHTML = [["+2d", 2], ["+1w", 7], ["+1m", 30], ["+3m", 90]].map(function (q) { return '<button class="btn small" type="button" data-act="quick" data-n="' + q[1] + '">' + q[0] + "</button>"; }).join("");
    $("#shLast2").textContent = c.lastTouch ? "Last touch " + fdate(c.lastTouch) + ". " + (c.next ? diff(today(), c.next) + " days until next." : "") : "No touches logged yet.";
    $("#shTags").innerHTML = (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '<button type="button" data-act="rmtag" data-t="' + esc(t) + '" aria-label="Remove tag ' + esc(t) + '">&times;</button></span>'; }).join("") || '<span class="note">No tags</span>';
    $("#shLog").innerHTML = (c.log || []).map(function (l) { return '<div class="logrow"><span class="d">' + esc(fdate(l.d)) + "</span><span>" + esc(l.t) + "</span></div>"; }).join("") || '<span class="note">Nothing logged yet.</span>';
    $("#shDeal").innerHTML = S.dealMode
      ? '<div class="card stack"><div class="chips"><button class="chip" type="button" data-act="deal" data-type="listing">Sold a listing</button><button class="chip" type="button" data-act="deal" data-type="buyer">Helped a buyer</button></div><label>Closing date<input class="field" style="width:auto" id="shDealDate" type="date" value="' + today() + '"></label><p class="note" style="margin:0">Counts toward ' + S.settings.goalYear + " only if the date is in that year.</p></div>"
      : '<button class="btn" type="button" data-act="dealmode">Mark closed</button>';
    $("#shOther").innerHTML = "Source: " + esc(c.source || "none") + (c.added ? " | Added " + esc(fdate(c.added)) : "") + (c.other ? "<br>Other numbers and emails: " + esc(c.other) : "") + (c.flags ? "<br>Flags: " + esc(c.flags) : "");
    updateWa();
    $("#shDanger").innerHTML = S.confirmDelete ? '<button class="btn danger" type="button" data-act="delnow">Delete forever</button><button class="btn" type="button" data-act="delcancel">Keep</button>' : '<button class="btn" type="button" data-act="dead">Move to Dead</button><button class="btn danger" type="button" data-act="delask">Delete</button>';
  }
  function sheetChange(e) {
    var id = S.sheetId, c = S.contacts.get(id); if (!c) return; var t = e.target, f = {};
    if (t.id === "shFirst") f.first = t.value.trim();
    else if (t.id === "shLast") f.last = t.value.trim();
    else if (t.id === "shPhone") { f.phone = normPhone(t.value); t.value = f.phone; if (f.phone && !/^\+1\d{10}$/.test(f.phone)) toast("Saved, but this is not a Canadian +1 number"); }
    else if (t.id === "shEmail") f.email = t.value.trim().toLowerCase();
    else if (t.id === "shCity") f.city = t.value.trim();
    else if (t.id === "shNotes") f.notes = t.value;
    else if (t.id === "shNext") f.next = t.value;
    else if (t.id === "shBday") f.birthday = t.value ? t.value.slice(5) : "";
    else if (t.id === "shClose") f.closeDate = t.value;
    else if (/^buy(Min|Max|Areas|Beds|Time|Must)$/.test(t.id)) f.buy = readBuy(c);
    else if (t.id === "shTpl") { var tp = tplById(t.value); $("#shMsg").value = tp ? fillMsg(tp.body, c) : ""; updateWa(); }
    else if (t.id === "shProv") { f.province = t.value; var tg = (c.tags || []).filter(function (x) { return x.indexOf("prov:") !== 0; }); tg.push("prov:" + PROV_TAG[t.value]); f.tags = tg; }
    if (Object.keys(f).length) save(id, f);
  }
  function openAdd() {
    $("#sheetHost").innerHTML = '<div class="veil" id="veil"><div class="sheet" role="dialog" aria-modal="true" aria-label="New lead"><div class="sheet-top"><h2>New lead</h2><button class="btn" type="button" data-act="closesheet">Cancel</button></div><div class="stack">' +
      '<div class="two"><label>First name<input class="field" id="nFirst"></label><label>Last name<input class="field" id="nLast"></label></div><div class="two"><label>Phone<input class="field" id="nPhone" inputmode="tel" placeholder="403 555 0123"></label><label>Email<input class="field" id="nEmail" inputmode="email"></label></div>' +
      '<div class="two"><label>Source<select class="field" id="nSource">' + SOURCES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + '</select></label><label>Province<select class="field" id="nProv">' + PROVS.map(function (p) { return "<option" + (p === "Alberta" ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + '</select></label></div>' +
      '<label>Note<textarea class="field" id="nNote" placeholder="What are they looking for?"></textarea></label><p class="note" style="margin:0">New leads go to the top of Today as hot, due now.</p><button class="btn primary" type="button" data-act="createlead">Add lead</button></div></div></div>';
    $("#veil").addEventListener("click", function (e) { if (e.target.id === "veil") closeSheet(); });
    S.sheetId = "__new";
  }
  function createLead() {
    var first = $("#nFirst").value.trim(), last = $("#nLast").value.trim(), phone = normPhone($("#nPhone").value), email = $("#nEmail").value.trim().toLowerCase();
    if (!first && !last && !phone && !email) { toast("Add a name, phone or email"); return; }
    var src = $("#nSource").value, prov = $("#nProv").value, t = today(), id = "n" + Date.now().toString(36);
    var rec = { id: id, first: first, last: last, email: email, phone: phone, province: prov, city: "", source: src, rel: "Lead", tags: ["src:" + slug(src), "prov:" + PROV_TAG[prov]].concat(phone ? ["ch:phone"] : [], email ? ["ch:email"] : []), lang: "", added: t, other: "", flags: "", notes: $("#nNote").value.trim(), stage: "New", temp: "hot", kind: "", next: t, lastTouch: "", log: [{ d: t, t: "Added" }] };
    if (!S.user) return; S.contacts.set(id, rec);
    chain("c:" + id, function () { return Store.put(rec).then(function () { toast("Lead added to Today"); }); }, function () { S.contacts.delete(id); });
    closeSheet(); S.tab = "today"; location.hash = "today"; scheduleRender();
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-open],[data-act],[data-set],[data-tab]"); if (!el) return;
    if (el.dataset.tab) { setTab(el.dataset.tab); return; }
    if (el.dataset.open) { openSheet(el.dataset.open); return; }
    if (el.dataset.set) { var id = S.sheetId, k = el.dataset.set, v = el.dataset.v; if (k === "stage") setStage(id, v); else if (k === "temp") { var c = S.contacts.get(id), cap = addDays(today(), RHYTHM[v]), f = { temp: v }; if (!c.next || c.next > cap) f.next = cap; save(id, f); } else if (k === "kind") save(id, { kind: v === S.contacts.get(id).kind ? "" : v }); else if (k === "btype") { var bb = readBuy(S.contacts.get(id)), ti = bb.types.indexOf(v); if (ti >= 0) bb.types.splice(ti, 1); else bb.types.push(v); save(id, { buy: bb }); } else if (k === "bpre") { var bp = readBuy(S.contacts.get(id)); bp.pre = bp.pre === v ? "" : v; save(id, { buy: bp }); } return; }
    var a = el.dataset.act, id2 = el.dataset.id;
    if (a === "backup") exportBackup();
    else if (a === "match") openMatch();
    else if (a === "addbuy") { var abc = S.contacts.get(S.sheetId); if (abc) save(abc.id, { buy: { min: "", max: "", areas: "", types: [], beds: "", time: "", pre: "", must: "" } }); }
    else if (a === "momentdone") { var mc = S.contacts.get(id2); if (mc) { var mt = today(); save(id2, { moments: (mc.moments || []).concat([el.dataset.key]), lastTouch: mt, log: [{ d: mt, t: el.dataset.kind === "birthday" ? "Birthday wishes sent" : "Home anniversary message sent" }].concat(mc.log || []).slice(0, 60) }); toast("Logged for " + nm(mc)); } }
    else if (a === "period") { S.period = el.dataset.v; render(); }
    else if (a === "addspend") {
      var amt = Number(String($("#spAmount").value).replace(/[$,\s]/g, ""));
      if (!(amt > 0)) { toast("Enter an amount"); return; }
      saveSettings({ spend: (S.settings.spend || []).concat([{ id: "s" + Date.now().toString(36), source: $("#spSource").value, amount: Math.round(amt * 100) / 100, date: $("#spDate").value || today() }]) }); toast("Spend logged");
    }
    else if (a === "delspend") saveSettings({ spend: (S.settings.spend || []).filter(function (x) { return x.id !== id2; }) });
    else if (a === "restorego") runRestore();
    else if (a === "restorecancel") { S.pendingRestore = null; S.restoreError = ""; render(); }
    else if (a === "refresh") { toast("Refreshing..."); reload().then(function () { if (!S.offline) toast("Up to date"); }); }
    else if (a === "signout") signOutNow();
    else if (a === "copy") { var v2 = el.dataset.v; var done = function () { toast("Copied " + v2); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v2).then(done, function () { toast(v2); }); else toast(v2); }
    else if (a === "copymsg") { var mv = ($("#shMsg") || {}).value || ""; if (!mv.trim()) { toast("Nothing to copy"); return; } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mv).then(function () { toast("Message copied"); }, function () { toast("Select the text and copy it"); }); else toast("Select the text and copy it"); }
    else if (a === "talked" || a === "messaged" || a === "noanswer") touch(id2, a);
    else if (a === "later") { save(id2, { next: addDays(today(), 7) }); toast("Moved to next week"); }
    else if (a === "showall") { S.showAllDue = true; render(); }
    else if (a === "advance") { var cc = S.contacts.get(id2), i = STAGES.indexOf(cc.stage); setStage(id2, i >= 0 ? STAGES[i + 1] : "Contacted"); }
    else if (a === "pipemore") { S.pipeMore[el.dataset.stage] = (S.pipeMore[el.dataset.stage] || 25) + 25; render(); }
    else if (a === "clearf") { S.f = { q: "", prov: "", temp: "", stage: "", kind: "", source: "", tag: "", email: false, phone: false, limit: 60 }; listsShellFor = ""; render(); }
    else if (a === "selmode") { S.selecting = !S.selecting; if (!S.selecting) S.selected.clear(); $("#bulkHost").dataset.n = ""; render(); }
    else if (a === "selall") { filtered().forEach(function (c) { S.selected.add(c.id); }); $("#bulkHost").dataset.n = ""; render(); }
    else if (a === "selnone") { S.selected.clear(); $("#bulkHost").dataset.n = ""; render(); }
    else if (a === "listmore") { S.f.limit += 60; render(); }
    else if (a === "bulkgo") bulkApply();
    else if (a === "export") exportCsv(filtered(), "contacts-" + today() + ".csv");
    else if (a === "exportall") exportCsv(all(), "all-contacts-" + today() + ".csv");
    else if (a === "spread") spread();
    else if (a === "deldeal") { saveSettings({ deals: (S.settings.deals || []).filter(function (d) { return d.id !== id2; }) }); }
    else if (a === "closesheet") closeSheet();
    else if (a === "quick") { save(S.sheetId, { next: addDays(today(), Number(el.dataset.n)) }); }
    else if (a === "addtag") { var inp = $("#shTagIn"), tg = cleanTag(inp.value); var c3 = S.contacts.get(S.sheetId); if (tg && (c3.tags || []).indexOf(tg) < 0) save(S.sheetId, { tags: (c3.tags || []).concat([tg]) }); inp.value = ""; }
    else if (a === "rmtag") { var c4 = S.contacts.get(S.sheetId); save(S.sheetId, { tags: (c4.tags || []).filter(function (x) { return x !== el.dataset.t; }) }); }
    else if (a === "addlog") { var li = $("#shLogIn"); logNote(S.sheetId, li.value, $("#shLogType").value); li.value = ""; }
    else if (a === "dealmode") { S.dealMode = true; refreshSheetParts(); }
    else if (a === "deal") {
      var c5 = S.contacts.get(S.sheetId), d = ($("#shDealDate") || {}).value || today(), deals = (S.settings.deals || []).concat([{ id: "d" + Date.now().toString(36), contact: c5.id, name: nm(c5), type: el.dataset.type, date: d }]);
      saveSettings({ deals: deals }); save(c5.id, { stage: "Closed", next: addDays(today(), 14), log: [{ d: today(), t: "Closed: " + (el.dataset.type === "listing" ? "sold a listing" : "helped a buyer") }].concat(c5.log || []).slice(0, 60) });
      S.dealMode = false; toast("Marked closed"); refreshSheetParts();
    }
    else if (a === "dead") { save(S.sheetId, { stage: "Dead" }); toast("Moved to Dead"); closeSheet(); }
    else if (a === "delask") { S.confirmDelete = true; refreshSheetParts(); }
    else if (a === "delcancel") { S.confirmDelete = false; refreshSheetParts(); }
    else if (a === "delnow") { var did = S.sheetId, old = S.contacts.get(did); S.contacts.delete(did); chain("c:" + did, function () { return Store.remove(did).then(function () { toast("Deleted"); }); }, function () { if (old) S.contacts.set(did, old); }); closeSheet(); }
    else if (a === "createlead") createLead();
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "mType" || t.id === "mBeds") { renderMatchResults(); return; }
    if (t.id === "restoreFile") { var rf = t.files && t.files[0]; t.value = ""; readRestore(rf); return; }
    if (t.closest && t.closest(".sheet")) { sheetChange(e); return; }
    if (t.dataset && t.dataset.sel) { if (t.checked) S.selected.add(t.dataset.sel); else S.selected.delete(t.dataset.sel); $("#bulkHost").dataset.n = ""; renderBulk(); return; }
    var map = { fprov: "prov", ftemp: "temp", fstage: "stage", fkind: "kind", fsource: "source" };
    if (map[t.id]) { S.f[map[t.id]] = t.value; S.f.limit = 60; renderLists(); }
    else if (t.id === "femail") { S.f.email = t.checked; S.f.limit = 60; renderLists(); }
    else if (t.id === "fphone") { S.f.phone = t.checked; S.f.limit = 60; renderLists(); }
    else if (t.id === "gList") saveSettings({ listingsGoal: Math.max(0, Number(t.value) || 0) });
    else if (t.id === "gBuy") saveSettings({ buyersGoal: Math.max(0, Number(t.value) || 0) });
    else if (t.id === "gYear") saveSettings({ goalYear: Number(t.value) || 2027 });
    else if (t.id === "gCap") saveSettings({ dailyCap: Math.min(100, Math.max(1, Number(t.value) || 15)) });
  });
  var qTimer;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "fq") { S.f.q = t.value; S.f.limit = 60; clearTimeout(qTimer); qTimer = setTimeout(renderLists, 150); }
    else if (t.id === "ftag") { S.f.tag = t.value; S.f.limit = 60; clearTimeout(qTimer); qTimer = setTimeout(renderLists, 150); }
    else if (t.id === "shMsg") updateWa();
    else if (t.id === "mPrice" || t.id === "mArea") { clearTimeout(qTimer); qTimer = setTimeout(renderMatchResults, 150); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && S.sheetId) closeSheet();
    if (e.key === "Enter" && e.target.id === "shTagIn") { e.preventDefault(); $('[data-act="addtag"]').click(); }
    if (e.key === "Enter" && e.target.id === "shLogIn") { e.preventDefault(); $('[data-act="addlog"]').click(); }
  });
  $("#addBtn").addEventListener("click", openAdd);

  function setTab(t) { if (TABS.indexOf(t) < 0) t = "today"; S.tab = t; if (location.hash !== "#" + t) location.hash = t; listsShellFor = ""; S.showAllDue = false; window.scrollTo(0, 0); render(); }
  window.addEventListener("hashchange", function () { var t = location.hash.slice(1); if (TABS.indexOf(t) >= 0 && t !== S.tab) { S.tab = t; listsShellFor = ""; render(); } });

  /* ---------- sign-in ---------- */
  function showAuth(msg, setup) {
    document.body.classList.add("locked");
    var h = $("#authHost");
    if (setup) { h.innerHTML = '<div class="auth"><div class="card stack"><h1>Closing Desk</h1><p style="margin:0">This copy is not connected to a database yet.</p><p class="note" style="margin:0">Open <b>config.js</b> and fill in your Supabase project URL and anon key, then reload. The README lists the steps.</p></div></div>'; return; }
    if (!$("#loginForm")) h.innerHTML = '<div class="auth"><form class="card stack" id="loginForm" autocomplete="on"><h1>Closing Desk</h1><p class="note" style="margin:0">Private. Sign in to open your contacts.</p><label>Email<input class="field" id="lEmail" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" required></label><label>Password<input class="field" id="lPass" name="password" type="password" autocomplete="current-password" required></label><div class="late" id="lErr" role="alert"></div><button class="btn primary" type="submit" id="lBtn">Sign in</button></form></div>';
    var err = $("#lErr"); if (err) err.textContent = msg || "";
  }
  function hideAuth() { document.body.classList.remove("locked"); $("#authHost").innerHTML = ""; }
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "loginForm") return;
    e.preventDefault();
    var em = $("#lEmail").value.trim(), pw = $("#lPass").value, btn = $("#lBtn"), er = $("#lErr");
    if (!em || !pw) { er.textContent = "Enter your email and password."; return; }
    btn.disabled = true; btn.textContent = "Signing in..."; er.textContent = "";
    Store.signIn(em, pw).then(function (session) { handleSession(session); }, function (err) {
      var b = $("#lBtn"); if (b) { b.disabled = false; b.textContent = "Sign in"; }
      var e2 = $("#lErr"); if (e2) e2.textContent = (err && err.message) || "Could not sign in.";
    });
  });
  function handleSession(session) {
    if (!session || !session.user) {
      if (S.user || !$("#loginForm")) { stopData(); S.user = null; S.contacts = new Map(); S.loaded = false; S.pend = {}; S.sheetId = null; $("#sheetHost").innerHTML = ""; clearCache(); showAuth(); }
      return;
    }
    if (S.user && S.user.id === session.user.id) { S.user = session.user; return; }
    S.user = session.user; hideAuth(); startData();
  }
  function signOutNow() { Store.signOut().then(function () { handleSession(null); }); }

  /* ---------- local copy + live data ---------- */
  var CACHE_KEY = "cd.cache.v1", cacheTimer;
  function readCache() { try { var j = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (j && S.user && j.uid === S.user.id && Array.isArray(j.contacts)) return j; } catch (e) {} return null; }
  function writeCache() { clearTimeout(cacheTimer); cacheTimer = setTimeout(function () { if (!S.user) return; try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: S.user.id, t: Date.now(), settings: S.settings, contacts: all() })); } catch (e) {} }, 500); }
  function clearCache() { clearTimeout(cacheTimer); try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  function startData() {
    S.offline = false; S.live = false; S.wasDown = false; S.loadError = "";
    var c = readCache();
    if (c) { S.contacts = new Map(c.contacts.map(function (r) { return [r.id, r]; })); S.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {}); S.loaded = true; }
    else { S.contacts = new Map(); S.settings = Object.assign({}, DEFAULT_SETTINGS); S.loaded = false; }
    clearTimeout(S.noteTimer); S.noteTimer = setTimeout(function () { S.connectNote = true; scheduleRender(); }, 10000);
    render();
    Store.subscribe({
      contact: applyRemote,
      settings: function (d) { if (!S.pend.settings) { S.settings = Object.assign({}, DEFAULT_SETTINGS, d); writeCache(); scheduleRender(); } },
      status: function (st) {
        if (st === "SUBSCRIBED") { var again = S.wasDown; S.live = true; S.wasDown = false; if (again) reload(); }
        else if (st === "CLOSED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT") { S.live = false; S.wasDown = true; }
        if (S.tab === "more") scheduleRender();
      }
    });
    return reload();
  }
  function stopData() { Store.unsubscribe(); clearTimeout(S.noteTimer); }
  function reload() {
    if (!S.user) return Promise.resolve();
    var uid = S.user.id;
    return Store.loadAll().then(function (res) {
      if (!S.user || S.user.id !== uid) return;
      var m = new Map(); res.contacts.forEach(function (r) { m.set(r.id, r); });
      Object.keys(S.pend).forEach(function (k) {
        if (k.indexOf("c:") !== 0) return; var id = k.slice(2);
        if (S.contacts.has(id)) m.set(id, S.contacts.get(id)); else m.delete(id);
      });
      S.contacts = m;
      if (res.settings && !S.pend.settings) S.settings = Object.assign({}, DEFAULT_SETTINGS, res.settings);
      S.loaded = true; S.offline = false; S.loadError = ""; S.lastLoad = Date.now(); clearTimeout(S.noteTimer); S.connectNote = false;
      writeCache(); scheduleRender();
    }, function (e) {
      S.offline = true; S.loaded = true; S.loadError = (e && e.message) || ""; clearTimeout(S.noteTimer); scheduleRender();
    });
  }
  function applyRemote(type, id, data) {
    if (S.pend["c:" + id]) return;
    if (type === "refetch") {
      Store.fetchOne(id).then(function (r) { if (S.pend["c:" + id]) return; if (r) S.contacts.set(id, r); else S.contacts.delete(id); writeCache(); scheduleRender(); }, function () {});
      return;
    }
    if (type === "delete") S.contacts.delete(id); else S.contacts.set(id, data);
    writeCache(); scheduleRender();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && S.user) { scheduleRender(); if (Date.now() - S.lastLoad > 30000) reload(); }
  });
  window.addEventListener("online", function () { if (S.user) reload(); });
  window.addEventListener("offline", function () { if (S.user) { S.offline = true; scheduleRender(); } });

  /* ---------- boot ---------- */
  function boot() {
    var t0 = location.hash.slice(1); if (TABS.indexOf(t0) >= 0) S.tab = t0;
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
    if (!Store || !Store.configured()) { showAuth(null, true); return; }
    Store.onAuth(function (event, session) { setTimeout(function () { handleSession(session); }, 0); });
    Store.getSession().then(handleSession);
  }
  boot();
})();
