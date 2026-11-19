/* Vacation week: data, seeding, time rules and saving. Used by vacation.html and by the "Today's plan" card on the Board.
   Storage: one JSON document in the existing os_docs table, row id "vacation" (the Board uses row "main"; nothing else is touched).
   The seed only ever ADDS missing ids. It never changes a tick, a completed-at time or a note. Times are America/Edmonton. */
(function () {
  "use strict";
  var D = window.VWDATA, Store = window.CDStore;
  var DOC_ID = "vacation", LS_KEY = "vw:doc1";
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CAT_LABEL = { reset: "Reset", body: "Body", fuel: "Fuel", study: "Study", prospecting: "Prospecting", family: "Family", admin: "Admin" };

  function pad(x) { return ("0" + x).slice(-2); }

  /* ---------- Edmonton clock ---------- */
  function tzNow(d) {
    d = d || new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-CA", { timeZone: D.tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d), p = {};
      parts.forEach(function (x) { p[x.type] = x.value; });
      return { date: p.year + "-" + p.month + "-" + p.day, min: (+p.hour % 24) * 60 + (+p.minute) };
    } catch (e) {
      return { date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), min: d.getHours() * 60 + d.getMinutes() };
    }
  }
  function dateParts(s) { var p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function fmtDate(s) { var d = dateParts(s); return DAYS[d.getUTCDay()] + " " + MONS[d.getUTCMonth()] + " " + d.getUTCDate(); }
  function fmtStamp(iso) {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", { timeZone: D.tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(iso)), p = {};
      parts.forEach(function (x) { p[x.type] = x.value; });
      return p.weekday + " " + p.month + " " + p.day + ", " + p.hour + ":" + p.minute + " " + String(p.dayPeriod || "").replace(/\./g, "").toUpperCase();
    } catch (e) { return String(iso); }
  }

  /* ---------- times ---------- */
  function parseTime(str) {
    str = String(str || "").trim();
    if (!str) return { s: null, e: null, open: false };
    var open = /\s+on$/i.test(str);
    if (open) str = str.replace(/\s+on$/i, "");
    function tm(x, ap0) {
      var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(x).trim()); if (!m) return null;
      var ap = (m[3] || ap0 || "").toUpperCase(), hr = (+m[1]) % 12; if (ap === "PM") hr += 12;
      return { min: hr * 60 + (+m[2]), ap: ap };
    }
    var parts = str.split("-"), a, b;
    if (parts.length === 1) { a = tm(parts[0]); return a ? { s: a.min, e: null, open: open } : { s: null, e: null, open: false }; }
    b = tm(parts[1]); a = b ? tm(parts[0], b.ap) : null;
    return a && b ? { s: a.min, e: b.min, open: false } : { s: null, e: null, open: false };
  }
  function fmtMin(m) { var h = Math.floor(m / 60) % 24, ap = h >= 12 ? "PM" : "AM"; return (h % 12 || 12) + ":" + pad(m % 60) + " " + ap; }
  function fmtRange(s) {
    if (s.s == null) return "Anytime";
    if (s.open) return fmtMin(s.s) + " on";
    if (s.e == null) return fmtMin(s.s);
    var a = fmtMin(s.s), b = fmtMin(s.e);
    return a.slice(-2) === b.slice(-2) ? a.slice(0, -3) + "–" + b : a + "–" + b;
  }

  /* ---------- seed and merge ---------- */
  function seed(doc) {
    doc = doc && typeof doc === "object" ? doc : {};
    var added = 0;
    doc.v = 1; doc.label = D.label; doc.tz = D.tz;
    doc.parents = doc.parents || {}; doc.subs = doc.subs || {};
    D.parents.forEach(function (p, pi) {
      if (!doc.parents[p.id]) { doc.parents[p.id] = { id: p.id, date: p.date, title: p.title, details: p.details || "", family: !!p.family, order: pi }; added++; }
      p.items.forEach(function (it, i) {
        var id = p.id + "." + (i + 1);
        if (doc.subs[id]) return;
        var t = parseTime(it[0]);
        doc.subs[id] = { id: id, pid: p.id, n: i + 1, t: it[0], s: t.s, e: t.e, open: t.open, title: it[1], cat: it[2], details: it[3] || "", done: false, doneAt: null, note: "", u: 0 };
        added++;
      });
    });
    if (!doc.seededAt) doc.seededAt = new Date().toISOString();
    return { doc: doc, added: added };
  }
  function merge(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    var out = { v: 1, label: D.label, tz: D.tz, seededAt: a.seededAt || b.seededAt, parents: {}, subs: {} };
    [a, b].forEach(function (d) { Object.keys(d.parents || {}).forEach(function (k) { if (!out.parents[k]) out.parents[k] = d.parents[k]; }); });
    var ids = {}; Object.keys(a.subs || {}).concat(Object.keys(b.subs || {})).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (k) {
      var x = (a.subs || {})[k], y = (b.subs || {})[k];
      out.subs[k] = !x ? y : !y ? x : ((x.u || 0) > (y.u || 0) ? x : y);
    });
    return out;
  }
  function sameState(a, b) {
    if (!a || !b) return false;
    var ka = Object.keys(a.subs || {}), kb = Object.keys(b.subs || {});
    if (ka.length !== kb.length || Object.keys(a.parents || {}).length !== Object.keys(b.parents || {}).length) return false;
    return ka.every(function (k) { var x = a.subs[k], y = b.subs[k]; return y && (x.u || 0) === (y.u || 0) && !!x.done === !!y.done && (x.note || "") === (y.note || ""); });
  }

  /* ---------- reading the plan ---------- */
  function parentsList(doc) {
    return Object.keys(doc.parents).map(function (k) { return doc.parents[k]; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function sorted(doc, pid) {
    var l = Object.keys(doc.subs).map(function (k) { return doc.subs[k]; }).filter(function (s) { return s.pid === pid; });
    return l.sort(function (a, b) {
      var au = a.s == null, bu = b.s == null;
      if (au !== bu) return au ? -1 : 1;
      if (!au && a.s !== b.s) return a.s - b.s;
      return a.n - b.n;
    });
  }
  function parentOn(doc, date) { var l = parentsList(doc).filter(function (p) { return p.date === date; }); return l[0] || null; }
  function parentStats(doc, pid) { var t = 0, d = 0; sorted(doc, pid).forEach(function (s) { t++; if (s.done) d++; }); return { done: d, total: t }; }
  /* Family day (VW-10) is left out of progress and overdue on purpose. */
  function overall(doc) {
    var t = 0, d = 0;
    parentsList(doc).forEach(function (p) { if (p.family) return; var st = parentStats(doc, p.id); t += st.total; d += st.done; });
    return { done: d, total: t };
  }
  function isNow(s, now) { return !s.done && s.s != null && s.s <= now.min && (s.open ? true : s.e != null ? now.min < s.e : false); }
  /* Next up: the first unticked item, in time order, that has not already ended. Items with no time come first.
     An open-ended item ("6:00 PM on") that has already started is a background item: it is only Next up when nothing else is left. */
  function nextUp(doc, now) {
    var p = parentOn(doc, now.date);
    if (!p || p.family) return null;
    var l = sorted(doc, p.id), background = null;
    for (var i = 0; i < l.length; i++) {
      var s = l[i]; if (s.done) continue;
      if (s.s == null) return s;
      if (s.open) { if (s.s > now.min) return s; if (!background) background = s; continue; }
      var end = s.e != null ? s.e : s.s + 1;
      if (end > now.min) return s;
    }
    return background;
  }
  function overdueCount(doc, p, now) {
    if (p.family || p.date >= now.date) return 0;
    return sorted(doc, p.id).filter(function (s) { return !s.done; }).length;
  }
  function inRange(date) { return date >= D.start && date <= D.end; }
  /* One small answer for "what is today's plan": used by the Board card and the Dashboard card. */
  function todaySummary(doc, now) {
    var p = inRange(now.date) ? parentOn(doc, now.date) : null;
    if (!p) return { kind: "none" };
    if (p.family) return { kind: "family", title: p.title };
    var st = parentStats(doc, p.id);
    return { kind: "day", title: p.title, done: st.done, total: st.total, next: nextUp(doc, now) };
  }

  /* ---------- state and saving ---------- */
  var doc = null, listeners = [], timer = null, status = "idle", pendingPut = false, subscribed = false;
  function emit(kind) { listeners.slice().forEach(function (f) { try { f(kind); } catch (e) {} }); }
  function setStatus(s) { if (status !== s) { status = s; emit("status"); } }
  function readLocal() { try { var j = localStorage.getItem(LS_KEY); return j ? JSON.parse(j) : null; } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) {} }

  function load() {
    if (!doc) doc = seed(readLocal()).doc;
    return doc;
  }
  function changed() { writeLocal(); pendingPut = true; setStatus("saving"); clearTimeout(timer); timer = setTimeout(flush, 500); }
  function flush() {
    clearTimeout(timer);
    if (!Store || !Store.configured || !Store.configured()) { setStatus("offline"); return Promise.resolve(); }
    return Store.getOsDoc(DOC_ID).then(function (remote) {
      var merged = seed(merge(doc, remote)).doc; doc = merged; writeLocal();
      return Store.putOsDoc(DOC_ID, merged);
    }).then(function () { pendingPut = false; setStatus("saved"); emit("change"); }, function () { setStatus("offline"); });
  }
  /* Called once per page: shows the saved copy at once, then merges with Supabase and seeds if anything is missing. */
  function open() {
    load(); emit("change");
    if (!Store || !Store.configured || !Store.configured()) { setStatus("offline"); return Promise.resolve(doc); }
    return Store.getOsDoc(DOC_ID).then(function (remote) {
      var seeded = seed(merge(doc, remote)); doc = seeded.doc; writeLocal();
      var need = !remote || seeded.added > 0 || !sameState(doc, remote);
      return need ? Store.putOsDoc(DOC_ID, doc).then(function () { return seeded.added; }) : 0;
    }).then(function (added) {
      setStatus("saved"); emit("change");
      if (!subscribed) {
        subscribed = true;
        try { Store.subscribeOsDoc(DOC_ID, function (data) { doc = seed(merge(doc, data)).doc; writeLocal(); emit("change"); }, function () {}); } catch (e) {}
      }
      return doc;
    }, function () { setStatus("offline"); return doc; });
  }
  /* Read only, for the Board card. Never writes. cb is called with the saved copy, then again with the fresh one. */
  function peek(cb) {
    var local = seed(readLocal()).doc; cb(local);
    if (!Store || !Store.configured || !Store.configured()) return;
    Store.getOsDoc(DOC_ID).then(function (remote) { cb(seed(merge(local, remote)).doc); }, function () {});
  }
  /* Safe to run any time: adds anything missing and reports how many it added. Ticks and notes are never touched. */
  function rerunSeed() {
    load();
    var r = seed(doc); doc = r.doc;
    if (r.added > 0) changed();
    return r.added;
  }

  function toggle(id, val) {
    load(); var s = doc.subs[id]; if (!s) return;
    s.done = !!val; s.doneAt = s.done ? new Date().toISOString() : null; s.u = Date.now();
    changed(); emit("local");
  }
  function setNote(id, text) {
    load(); var s = doc.subs[id]; if (!s) return;
    s.note = String(text || "").slice(0, 2000); s.u = Date.now();
    changed(); emit("local");
  }

  window.VW = {
    DATA: D, DOC_ID: DOC_ID, CAT_LABEL: CAT_LABEL,
    tzNow: tzNow, fmtDate: fmtDate, fmtStamp: fmtStamp, parseTime: parseTime, fmtMin: fmtMin, fmtRange: fmtRange,
    seed: seed, merge: merge, parentsList: parentsList, sorted: sorted, parentOn: parentOn, parentStats: parentStats, overall: overall,
    nextUp: nextUp, isNow: isNow, overdueCount: overdueCount, inRange: inRange, todaySummary: todaySummary,
    get: load, open: open, peek: peek, rerunSeed: rerunSeed, flush: flush, toggle: toggle, setNote: setNote,
    onChange: function (f) { listeners.push(f); }, status: function () { return status; }, pending: function () { return pendingPut; }
  };
})();
