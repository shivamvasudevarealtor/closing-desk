/* Today tab (tasks.html): one list for today.
   Sources: your Apple Calendar (iCloud share link, read by the calendar-feed function), tasks you add here, and today's plan tasks from the Board.
   Saved in one os_docs row, id "today". Calendar events are never saved, only fetched. Times are America/Edmonton, 12-hour. */
(function () {
  "use strict";
  var Store = window.CDStore, DOC_ID = "today", LS_KEY = "cd.day1", LS_CAL = "cd.day1.cal", TZ = "America/Edmonton";
  var ICLOUD = /^(webcals?|https):\/\/([a-z0-9-]+\.)*icloud\.com\/\S+$/i;

  /* ---------- time helpers ---------- */
  function pad(n) { return ("0" + n).slice(-2); }
  function parts(d, opt) { return new Intl.DateTimeFormat("en-CA", Object.assign({ timeZone: TZ, hourCycle: "h23" }, opt)).formatToParts(d || new Date()).reduce(function (a, p) { a[p.type] = p.value; return a; }, {}); }
  function todayStr() { var p = parts(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" }); return p.year + "-" + p.month + "-" + p.day; }
  function nowMin() { var p = parts(new Date(), { hour: "2-digit", minute: "2-digit" }); return (+p.hour % 24) * 60 + (+p.minute); }
  function dateLabel(s, o) { var p = s.split("-").map(Number); return new Intl.DateTimeFormat("en-CA", Object.assign({ timeZone: "UTC" }, o)).format(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12))); }
  function mins(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fmt12(hhmm, noSuffix) {
    var m = mins(hhmm); if (m == null) return "";
    var h = Math.floor(m / 60) % 24, ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
    return h12 + ":" + pad(m % 60) + (noSuffix ? "" : " " + ap);
  }
  function range(s, e) {
    if (!s) return "";
    if (!e) return fmt12(s);
    var ap = function (x) { return (Math.floor(mins(x) / 60) % 24) >= 12 ? "PM" : "AM"; };
    return ap(s) === ap(e) ? fmt12(s, true) + "–" + fmt12(e) : fmt12(s) + "–" + fmt12(e);
  }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v;
      else if (v === false || v == null) return; else el.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }

  /* ---------- saved state: tasks you added, and the calendar link ---------- */
  var doc = null, status = "idle", timer = null, pending = false, opened = false, openAt = 0, listeners = [];
  function blank() { return { v: 1, tasks: {}, cal: { url: "", u: 0 } }; }
  function readJSON(k) { try { var j = localStorage.getItem(k); return j ? JSON.parse(j) : null; } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) {} }
  function norm(d) { d = d && typeof d === "object" ? d : blank(); d.v = 1; d.tasks = d.tasks && typeof d.tasks === "object" ? d.tasks : {}; d.cal = d.cal && typeof d.cal === "object" ? d.cal : { url: "", u: 0 }; return d; }
  function load() { if (!doc) doc = norm(readJSON(LS_KEY)); return doc; }
  /* Newest edit wins, per task and for the calendar link. A removed task stays as a small tombstone so it stays removed on every device. */
  function merge(a, b) {
    a = norm(a); b = norm(b);
    var out = blank(), ids = {};
    Object.keys(a.tasks).concat(Object.keys(b.tasks)).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (k) { var x = a.tasks[k], y = b.tasks[k]; out.tasks[k] = !x ? y : !y ? x : ((x.u || 0) >= (y.u || 0) ? x : y); });
    out.cal = (a.cal.u || 0) >= (b.cal.u || 0) ? a.cal : b.cal;
    return out;
  }
  function same(a, b) { return JSON.stringify(norm(a)) === JSON.stringify(norm(b)); }
  function prune(d) { /* tombstones and finished tasks older than 45 days */
    var cut = Date.now() - 45 * 86400000;
    Object.keys(d.tasks).forEach(function (k) { var t = d.tasks[k]; if ((t.del || t.done) && (t.u || 0) < cut && k !== "pl-lic-approved") delete d.tasks[k]; /* the licence flag must outlive the 45 days */ });
    return d;
  }
  function setStatus(s) { if (status !== s) { status = s; emit("status"); } }
  function emit(kind) { listeners.slice().forEach(function (f) { try { f(kind); } catch (e) {} }); }
  function changed() { writeLocal(); pending = true; setStatus("saving"); clearTimeout(timer); timer = setTimeout(flush, 600); emit("local"); }
  function configured() { return !!(Store && Store.configured && Store.configured()); }
  function flush() {
    clearTimeout(timer);
    if (!configured()) { setStatus("offline"); return Promise.resolve(); }
    return Store.getOsDoc(DOC_ID).then(function (remote) {
      doc = prune(merge(doc, remote)); writeLocal();
      return Store.putOsDoc(DOC_ID, doc);
    }).then(function () { pending = false; setStatus("saved"); emit("change"); }, function () { setStatus("offline"); });
  }
  /* Called on every render until it works once: shows the saved copy, then merges with Supabase. Writes only if there is something to write. */
  function open() {
    load();
    if (opened || !configured() || Date.now() - openAt < 20000) return;
    openAt = Date.now();
    Store.getOsDoc(DOC_ID).then(function (remote) {
      var merged = prune(merge(doc, remote)); doc = merged; writeLocal();
      var has = Object.keys(doc.tasks).length > 0 || !!doc.cal.url;
      var need = remote ? !same(doc, remote) : has;
      opened = true;
      return need ? Store.putOsDoc(DOC_ID, doc) : null;
    }).then(function () { setStatus(pending ? "saving" : "saved"); emit("change"); refreshCal(); }, function () { setStatus("offline"); });
  }

  function uid() { return "T" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  /* date is optional (YYYY-MM-DD, today by default). A task dated later shows under "Coming up" until its day. */
  function addTask(title, time, date) {
    title = String(title || "").trim().slice(0, 200); if (!title) return null;
    load(); var id = uid(), td = todayStr();
    date = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && date >= td ? date : td;
    doc.tasks[id] = { id: id, title: title, date: date, time: mins(time) != null ? time : "", done: false, doneAt: null, del: false, u: Date.now() };
    changed(); return id;
  }
  /* Ticks for the subtasks that have no home of their own (the study-day steps). Kept in the same document, marked k:"st", never shown as a task of yours. */
  function flag(id, val, title, kind) {
    load(); var t = doc.tasks[id];
    if (!t) t = doc.tasks[id] = { id: id, title: String(title || id).slice(0, 200), date: todayStr(), time: "", done: false, doneAt: null, del: false, u: 0, k: kind || "st" };
    t.done = !!val; t.doneAt = t.done ? new Date().toISOString() : null; t.u = Date.now(); changed();
  }
  function flags() { var d = load(), out = {}; Object.keys(d.tasks).forEach(function (k) { var t = d.tasks[k]; if (t && t.k && !t.del) out[k] = !!t.done; }); return out; }
  /* Steps under one of your own tasks. They live on the task itself, so they merge and sync with it. */
  function sid() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function addSub(id, title) {
    title = String(title || "").trim().slice(0, 200); if (!title) return null;
    load(); var t = doc.tasks[id]; if (!t || t.del || t.k) return null;
    t.subs = Array.isArray(t.subs) ? t.subs : []; if (t.subs.length >= 40) return null;
    var s = { id: sid(), title: title, done: false }; t.subs.push(s); t.u = Date.now(); changed(); return s.id;
  }
  function toggleSub(id, sub, val) {
    load(); var t = doc.tasks[id]; if (!t || !Array.isArray(t.subs)) return;
    t.subs.forEach(function (s) { if (s.id === sub) s.done = !!val; }); t.u = Date.now(); changed();
  }
  function removeSub(id, sub) {
    load(); var t = doc.tasks[id]; if (!t || !Array.isArray(t.subs)) return;
    t.subs = t.subs.filter(function (s) { return s.id !== sub; }); t.u = Date.now(); changed();
  }
  function toggle(id, val) { load(); var t = doc.tasks[id]; if (!t) return; t.done = !!val; t.doneAt = t.done ? new Date().toISOString() : null; t.u = Date.now(); changed(); }
  function removeTask(id) { load(); var t = doc.tasks[id]; if (!t) return; t.del = true; t.u = Date.now(); changed(); }
  function restoreTask(id) { load(); var t = doc.tasks[id]; if (!t) return; t.del = false; t.u = Date.now(); changed(); }
  function setUrl(u) { load(); doc.cal = { url: u, u: Date.now() }; changed(); }

  /* ---------- calendar ---------- */
  var cal = { date: null, events: [], at: null, state: "none", msg: "" }, calBusy = false, calAt = 0;
  (function () { var c = readJSON(LS_CAL); if (c && c.date === todayStr() && Array.isArray(c.events)) { cal.date = c.date; cal.events = c.events; cal.at = c.at; } })();
  var CAL_MSG = {
    bad_url: "That does not look like an iCloud calendar link. It should start with webcal:// and contain icloud.com.",
    fetch_failed: "Could not reach that calendar. Check that it is still shared as a Public Calendar.",
    not_calendar: "That link did not return a calendar. Copy the Share Link again.",
    too_big: "That calendar is too large to read.",
    parse_failed: "Could not read that calendar."
  };
  function refreshCal(force) {
    load();
    var url = doc.cal && doc.cal.url;
    if (!url) { cal.state = "none"; emit("cal"); return; }
    if (calBusy || !configured()) return;
    if (!force && Date.now() - calAt < 60000) return;
    calBusy = true; calAt = Date.now(); cal.state = cal.events.length || cal.at ? "ok" : "load"; cal.busy = true; emit("cal");
    var d = todayStr();
    Store.invoke("calendar-feed", { url: url, date: d }).then(function (r) {
      cal.date = d; cal.events = (r && r.events) || []; cal.at = (r && r.fetchedAt) || new Date().toISOString(); cal.state = "ok"; cal.msg = "";
      try { localStorage.setItem(LS_CAL, JSON.stringify({ date: d, events: cal.events, at: cal.at })); } catch (e) {}
    }, function (e) {
      cal.state = "err";
      if (e && e.code && CAL_MSG[e.code]) cal.msg = CAL_MSG[e.code];
      else if (e && (e.status === 401 || e.status === 403)) cal.msg = "Please sign in again, then tap Refresh.";
      else cal.msg = "Could not reach the server. " + (cal.events.length ? "Showing the last copy." : "Try again in a moment.");
    }).then(function () { calBusy = false; cal.busy = false; emit("cal"); });
  }

  /* ---------- the day as one list (this tab and Home both read it) ---------- */
  var LBL = { cal: "Calendar", me: "Mine", cl: "Claude" };
  function model(plan) {
    var td = todayStr(), nm = nowMin(), d = load();
    var own = Object.keys(d.tasks).map(function (k) { return d.tasks[k]; }).filter(function (t) { return t && !t.del && t.title && !t.k; });
    var todays = own.filter(function (t) { return t.date === td; });
    function doneDay(t) { if (!t.done || !t.doneAt) return ""; var dt = new Date(t.doneAt); if (isNaN(dt.getTime())) return ""; var q = parts(dt, { year: "numeric", month: "2-digit", day: "2-digit" }); return q.year + "-" + q.month + "-" + q.day; }
    var carried = own.filter(function (t) { return t.date < td && (!t.done || doneDay(t) === td); });
    var later = own.filter(function (t) { return t.date > td && !t.done; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || "99") < (b.time || "99") ? -1 : 1; })
      .map(function (t) { return { id: t.id, title: t.title, date: t.date, time: t.time || "" }; });
    var events = cal.date === td ? cal.events : [];
    var items = [];
    events.forEach(function (ev) {
      var s = ev.allDay ? -1 : (mins(ev.start) || 0), e = ev.end ? mins(ev.end) : null;
      items.push({ src: "cal", id: String(ev.id || ev.title + s), title: ev.title, allDay: !!ev.allDay, start: ev.start || "", end: ev.end || "", loc: ev.location || "", min: s, endMin: e, done: false });
    });
    todays.forEach(function (t) { items.push({ src: "me", id: t.id, title: t.title, start: t.time || "", end: "", min: t.time ? mins(t.time) : null, endMin: null, done: !!t.done, carried: "", u: t.u || 0, subs: t.subs || [], note: t.note || "" }); });
    carried.forEach(function (t) { items.push({ src: "me", id: t.id, title: t.title, min: null, done: !!t.done, carried: t.date, u: t.u || 0, subs: t.subs || [], note: t.note || "" }); });
    (plan || []).forEach(function (p, i) { items.push({ src: "cl", id: "pl" + i, title: p.title, min: null, done: p.state === "done", state: p.state, mins: p.mins || null, u: i }); });
    var next = null;
    items.forEach(function (it) {
      it.timed = it.min != null;
      if (it.timed && !it.allDay) {
        var end = it.endMin != null ? it.endMin : it.min + 60;
        it.past = it.endMin != null ? it.endMin <= nm : it.min < nm - 60;
        it.now = it.min <= nm && nm < end && it.src === "cal";
      } else { it.past = false; it.now = false; }
    });
    var sched = items.filter(function (it) { return it.timed; }).sort(function (a, b) { return a.min - b.min || (a.src === "cal" ? 0 : 1) - (b.src === "cal" ? 0 : 1); });
    for (var i = 0; i < sched.length; i++) { var it = sched[i]; if (!it.allDay && !it.past && !it.done) { next = it; break; } }
    var todo = items.filter(function (it) { return !it.timed; }).sort(function (a, b) {
      var ra = a.carried ? 0 : a.src === "cl" ? 1 : 2, rb = b.carried ? 0 : b.src === "cl" ? 1 : 2;
      return ra - rb || (a.carried && b.carried ? (a.carried < b.carried ? -1 : 1) : 0) || (a.u - b.u);
    });
    var c = { all: items.length, cal: 0, me: 0, cl: 0 };
    items.forEach(function (it) { c[it.src]++; });
    var tasks = items.filter(function (it) { return it.src !== "cal"; });
    return { td: td, nm: nm, items: items, sched: sched, todo: todo, next: next, counts: c, later: later, total: tasks.length, done: tasks.filter(function (it) { return it.done; }).length,
      connected: !!(d.cal && d.cal.url), calState: cal.state, calMsg: cal.msg, calAt: cal.at, status: status };
  }

  /* ---------- view ---------- */
  var opts = { plan: [], openBoard: null, vwEl: null, afterPaint: null }, root = null, formState = { title: "", time: "", url: "" }, confirmOff = false, confirmTimer = null, flt = "all";
  var SVG = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  function icon(name, cls) { var s = h("span", { class: cls || "tdic", "aria-hidden": "true" }); s.innerHTML = SVG[name]; return s; }
  function chip(src) { return h("span", { class: "tdl l-" + src, text: LBL[src] }); }

  function ctxText(it) {
    if (it.src === "cal") return (it.now ? "Now · " : "") + (it.allDay ? "All day" : range(it.start, it.end));
    if (it.timed) return fmt12(it.start);
    if (it.carried) return "From " + dateLabel(it.carried, { weekday: "short", month: "short", day: "numeric" });
    if (it.src === "cl") return it.state === "done" ? "Done" : it.state === "doing" ? "Doing now" : "To do" + (it.mins ? " · " + it.mins + " min" : "");
    return "";
  }
  function row(it) {
    var cls = "tdr " + it.src + (it.done ? " done" : "") + (it.past ? " past" : "") + (it.now ? " now" : "") + (it.carried ? " late" : "");
    var left, right = null;
    if (it.src === "me") {
      var id = "tk-" + it.id, cb = h("input", { type: "checkbox", id: id, "data-tk": it.id, "aria-label": it.title }); cb.checked = !!it.done;
      left = h("span", { class: "tdc" }, [cb, h("span", { class: "tdbox", "aria-hidden": "true" }, [icon("check", "tdck")])]);
      right = h("button", { type: "button", class: "tdx", "data-rm": it.id, "aria-label": "Remove " + it.title }, [icon("x")]);
    } else if (it.src === "cl") {
      left = h("span", { class: "tdc dot" + (it.done ? " ok" : ""), "aria-hidden": "true" }, [icon(it.done ? "check" : "spark")]);
      right = h("button", { type: "button", class: "tdx go", "data-openboard": "1", "aria-label": "Open " + it.title + " on the Board" }, [icon("go")]);
    } else {
      left = h("span", { class: "tdc dot", "aria-hidden": "true" }, [icon("cal")]);
    }
    var top = h("span", { class: "tdtop" }, [h("span", { class: "tdt tn", text: ctxText(it) }), chip(it.src)]);
    var bodyKids = [top, h("span", { class: "tdn", text: it.title }), it.loc ? h("span", { class: "tdm", text: it.loc }) : null];
    var body = it.src === "me" ? h("label", { class: "tdb", "for": "tk-" + it.id }, bodyKids) : h("div", { class: "tdb" }, bodyKids);
    return h("li", { class: cls, "data-src": it.src }, [left, body, right]);
  }
  function group(title, count, items, empty) {
    var ul = h("ul", { class: "tdlist" });
    items.forEach(function (it) { ul.appendChild(row(it)); });
    if (!items.length) ul.appendChild(h("li", { class: "tdempty", text: empty }));
    return h("section", { class: "tdg" }, [h("h2", { class: "tdh" }, [title, h("span", { class: "tdhn tn", text: String(count) })]), ul]);
  }
  function calCard(M) {
    var kids = [];
    if (!M.connected) {
      kids.push(
        h("h2", { class: "tdh" }, [icon("cal", "tdic big"), "Bring in your calendar"]),
        h("p", { class: "tdnote", text: "Show your Apple Calendar events here. Apple does not allow a sign-in for web apps, so you share one calendar with a link." }),
        h("ol", { class: "tdsteps" }, [
          h("li", { text: "On your iPhone, open Calendar and tap Calendars at the bottom." }),
          h("li", { text: "Tap the (i) next to the calendar you want. Turn on Public Calendar." }),
          h("li", { text: "Tap Share Link, copy it, and paste it below." })
        ]),
        h("form", { class: "tdcf", "data-calform": "1", novalidate: true }, [
          h("label", { class: "sr", "for": "tdUrl", text: "iCloud calendar link" }),
          h("input", { id: "tdUrl", class: "tdin", type: "url", inputmode: "url", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "webcal://p12-caldav.icloud.com/…", value: formState.url }),
          h("button", { type: "submit", class: "tdbtn", text: "Connect" })
        ]),
        h("p", { class: "tdfine", text: "Anyone who has this link can read that calendar. It is saved only in your private Realtor OS account. Use a calendar with events you are fine sharing." })
      );
      if (M.calMsg) kids.push(h("p", { class: "tderr", role: "alert", text: M.calMsg }));
    } else {
      var when = M.calAt ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(M.calAt)).replace(/\./g, "").toUpperCase() : "";
      kids.push(
        h("h2", { class: "tdh" }, [icon("cal", "tdic big"), "Apple Calendar"]),
        h("p", { class: "tdnote" }, [h("b", { class: M.calState === "err" ? "" : "okt", text: "Connected. " }), cal.busy ? "Updating…" : (when ? "Updated " + when + "." : "Not updated yet.")]),
        h("div", { class: "tdrow" }, [
          h("button", { type: "button", class: "tdbtn ghost", "data-calrefresh": "1", text: "Refresh" }),
          h("button", { type: "button", class: "tdbtn ghost", "data-caloff": "1", text: confirmOff ? "Tap again to disconnect" : "Disconnect" })
        ])
      );
      if (M.calState === "err" && M.calMsg) kids.push(h("p", { class: "tderr", role: "alert", text: M.calMsg }));
    }
    return h("section", { class: "tdcard tdcal" + (M.connected ? " on" : "") }, kids);
  }
  function addForm() {
    var title = h("input", { id: "tdTitle", class: "tdin", type: "text", maxlength: "200", autocomplete: "off", placeholder: "Add a task for today", "aria-label": "Task for today" });
    title.value = formState.title;
    var time = h("input", { id: "tdTime", class: "tdin tdtime", type: "time", "aria-label": "Time (optional)" }); time.value = formState.time;
    return h("form", { class: "tdadd", "data-addform": "1", novalidate: true }, [title, time, h("button", { type: "submit", class: "tdbtn", "aria-label": "Add task" }, [icon("plus"), h("span", { text: "Add" })])]);
  }
  function ring(done, total) {
    var R = 21, C = 2 * Math.PI * R, p = total ? Math.min(1, done / total) : 0;
    var s = h("div", { class: "tdring" + (total && done >= total ? " full" : ""), role: "img", "aria-label": done + " of " + total + " done" });
    s.innerHTML = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="' + R + '" class="rt"/><circle cx="26" cy="26" r="' + R + '" class="rp" stroke-dasharray="' + (C * p).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 26 26)"/></svg>';
    s.appendChild(h("span", { class: "tn", text: done + "/" + total }));
    return s;
  }
  function seg(M) {
    var defs = [["all", "All"], ["cal", "Calendar"], ["me", "Mine"], ["cl", "Claude"]];
    return h("div", { class: "tdseg", role: "group", "aria-label": "Show" }, defs.map(function (d) {
      return h("button", { type: "button", class: "tdsb" + (flt === d[0] ? " on" : ""), "data-flt": d[0], "aria-pressed": flt === d[0] ? "true" : "false" }, [h("span", { text: d[1] }), h("b", { class: "tn", text: String(M.counts[d[0]]) })]);
    }));
  }

  function paint() {
    if (!root || !root.isConnected) { root = document.querySelector("[data-tday]"); if (!root) return; }
    var M = model(opts.plan || []), T = window.TALL;
    var restore = T && T.grabFocus ? T.grabFocus() : null;
    var focusId = document.activeElement && document.activeElement.id, selS = null, selE = null;
    if (!T && focusId === "tdTitle") { selS = document.activeElement.selectionStart; selE = document.activeElement.selectionEnd; }
    var U = T ? T.model({ plan: opts.plan || [] }) : null, kids = [];
    if (T) {
      /* One list for the day (tasks-all.js): the same card as on Home. The split by source is the card under it. */
      var ctxFn = function () { return { plan: opts.plan || [] }; }, todayEl = h("section", { class: "tl-card", id: "tlToday" }), listsEl = h("section", { class: "tl-card", id: "tlLists" });
      T.draw(todayEl, "today", ctxFn, { bare: true, title: "Today", studyHref: "home.html#hmVwk", pillarsHref: "home.html#hmPillars", calHref: "#tdCal" });
      T.draw(listsEl, "lists", ctxFn, {});
      kids.push(todayEl, listsEl);
    } else {
      var sched = M.sched.filter(function (it) { return flt === "all" || it.src === flt; });
      var todo = M.todo.filter(function (it) { return flt === "all" || it.src === flt; });
      kids.push(group("Scheduled", sched.length, sched, "Nothing scheduled today."), group("To do", todo.length, todo, "Nothing to do yet."));
    }
    var main = h("div", { class: "tdmain" }, kids);
    var side = h("div", { class: "tdside", id: "tdCal" }, [calCard(M)]);
    var head = h("header", { class: "tdhead" }, [
      h("div", { class: "tdht" }, [h("h1", { text: "Today" }), h("p", { class: "sub", text: dateLabel(M.td, { weekday: "long", month: "long", day: "numeric" }) })]),
      ring(U ? U.done : M.done, U ? U.total : M.total)
    ]);
    root.textContent = "";
    root.appendChild(head);
    if (!T) { root.appendChild(seg(M)); root.appendChild(addForm()); }
    root.appendChild(h("div", { class: "tdbody" + (M.connected ? " conn" : "") }, [main, side]));
    var st = M.status === "offline" ? (pending ? "Not saved to the cloud yet. Kept on this device." : "Offline. Showing the copy on this device.") : M.status === "saving" ? "Saving…" : "";
    if (st) root.appendChild(h("p", { class: "tdfine tdst", role: "status", text: st }));
    if (!T && focusId === "tdTitle") { var n = document.getElementById("tdTitle"); if (n) { n.focus(); try { n.setSelectionRange(selS, selE); } catch (e) {} } }
    if (restore) restore();
    if (opts.afterPaint) opts.afterPaint();
  }

  /* ---------- events ---------- */
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f || !f.closest || !f.closest("[data-tday]")) return;
    e.preventDefault();
    if (f.hasAttribute("data-addform")) {
      var t = document.getElementById("tdTitle").value, tm = document.getElementById("tdTime").value;
      if (!t.trim()) { document.getElementById("tdTitle").focus(); return; }
      formState.title = ""; formState.time = "";
      addTask(t, tm);
      var n = document.getElementById("tdTitle"); if (n) n.focus();
    } else if (f.hasAttribute("data-calform")) {
      var u = document.getElementById("tdUrl").value.trim();
      if (!ICLOUD.test(u)) { cal.msg = CAL_MSG.bad_url; cal.state = "err"; paint(); return; }
      cal.msg = ""; cal.events = []; cal.at = null; setUrl(u); refreshCal(true);
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (t && t.id === "tdTitle") formState.title = t.value; else if (t && t.id === "tdTime") formState.time = t.value; else if (t && t.id === "tdUrl") formState.url = t.value;
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (t && t.matches && t.matches("input[data-tk]")) toggle(t.getAttribute("data-tk"), t.checked);
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-rm],[data-openboard],[data-calrefresh],[data-caloff],[data-flt]") : null;
    if (!b || !b.closest("[data-tday]")) return;
    if (b.hasAttribute("data-flt")) { flt = b.getAttribute("data-flt"); paint(); return; }
    if (b.hasAttribute("data-rm")) removeTask(b.getAttribute("data-rm"));
    else if (b.hasAttribute("data-openboard")) { if (opts.openBoard) opts.openBoard(); }
    else if (b.hasAttribute("data-calrefresh")) refreshCal(true);
    else if (b.hasAttribute("data-caloff")) {
      if (!confirmOff) { confirmOff = true; clearTimeout(confirmTimer); confirmTimer = setTimeout(function () { confirmOff = false; paint(); }, 4000); paint(); return; }
      confirmOff = false; clearTimeout(confirmTimer);
      cal = { date: null, events: [], at: null, state: "none", msg: "" }; try { localStorage.removeItem(LS_CAL); } catch (x) {}
      setUrl(""); paint();
    }
  });
  listeners.push(function () { paint(); });
  if (window.VW && window.VW.onChange) window.VW.onChange(function () { if (root && root.isConnected) paint(); });
  setInterval(function () { if (document.visibilityState === "visible" && root && root.isConnected) { paint(); if (Date.now() - calAt > 300000) refreshCal(); } }, 60000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { open(); refreshCal(); paint(); } });

  window.TDAY = {
    /* Called by tasks.js on every render. Returns the tab's container; the content is painted from saved state. */
    view: function (o) {
      opts = { plan: (o && o.plan) || [], openBoard: (o && o.openBoard) || null, vwEl: (o && o.vwEl) || null, afterPaint: (o && o.afterPaint) || null };
      root = h("section", { class: "tdy", "data-tday": "1" });
      load(); open(); if (window.TALL && window.TALL.start) window.TALL.start();
      setTimeout(function () { if (root && root.isConnected) { paint(); refreshCal(); } }, 0);
      return root;
    },
    /* For Home: no screen here, just the data. start() loads and syncs, model(plan) is today's list, on(fn) hears every change. */
    start: function () { load(); open(); refreshCal(); },
    model: function (plan) { return model(plan || []); },
    on: function (fn) { listeners.push(fn); },
    toggle: toggle, add: addTask, addSub: addSub, toggleSub: toggleSub, removeSub: removeSub, remove: removeTask, restore: restoreTask, flag: flag, flags: flags, refresh: refreshCal, fmt12: fmt12, range: range, dateLabel: dateLabel, mins: mins,
    paint: paint, todayStr: todayStr, nowMin: nowMin, connected: function () { load(); return !!(doc.cal && doc.cal.url); }, calState: function () { return { state: cal.state, msg: cal.msg, at: cal.at, busy: !!cal.busy }; },
    _state: function () { return { doc: load(), cal: cal, status: status }; }
  };
})();
