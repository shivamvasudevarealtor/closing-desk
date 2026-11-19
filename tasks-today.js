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
    Object.keys(d.tasks).forEach(function (k) { var t = d.tasks[k]; if ((t.del || t.done) && (t.u || 0) < cut) delete d.tasks[k]; });
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
  function addTask(title, time) {
    title = String(title || "").trim().slice(0, 200); if (!title) return null;
    load(); var id = uid();
    doc.tasks[id] = { id: id, title: title, date: todayStr(), time: mins(time) != null ? time : "", done: false, doneAt: null, del: false, u: Date.now() };
    changed(); return id;
  }
  function toggle(id, val) { load(); var t = doc.tasks[id]; if (!t) return; t.done = !!val; t.doneAt = t.done ? new Date().toISOString() : null; t.u = Date.now(); changed(); }
  function removeTask(id) { load(); var t = doc.tasks[id]; if (!t) return; t.del = true; t.u = Date.now(); changed(); }
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

  /* ---------- view ---------- */
  var opts = { plan: [], openBoard: null, vwEl: null, afterPaint: null }, root = null, formState = { title: "", time: "", url: "" }, confirmOff = false, confirmTimer = null;

  function label(text, cls) { return h("span", { class: "tdl " + (cls || ""), text: text }); }
  function evRow(ev, nm, isToday) {
    var past = isToday && !ev.allDay && ev.end ? mins(ev.end) <= nm : (isToday && !ev.allDay && ev.start ? mins(ev.start) < nm - 60 : false);
    return h("li", { class: "tdr ev" + (past ? " past" : "") }, [
      h("span", { class: "tdc dot", "aria-hidden": "true", text: "•" }),
      h("div", { class: "tdb" }, [
        h("span", { class: "tdt tn", text: ev.allDay ? "All day" : range(ev.start, ev.end) }),
        h("span", { class: "tdn", text: ev.title }),
        ev.location ? h("span", { class: "tdm", text: ev.location }) : null,
        h("span", { class: "tdtag" }, [label("Calendar", "l-cal")])
      ])
    ]);
  }
  function taskRow(t, carried) {
    var id = "tk-" + t.id;
    var cb = h("input", { type: "checkbox", id: id, "data-tk": t.id, "aria-label": t.title }); cb.checked = !!t.done;
    return h("li", { class: "tdr tk" + (t.done ? " done" : "") }, [
      h("span", { class: "tdc" }, [cb]),
      h("label", { class: "tdb", "for": id }, [
        t.time ? h("span", { class: "tdt tn", text: fmt12(t.time) }) : null,
        h("span", { class: "tdn", text: t.title }),
        h("span", { class: "tdtag" }, [label("Added by you", "l-me"), carried ? label("From " + dateLabel(t.date, { weekday: "short", month: "short", day: "numeric" }), "l-old") : null])
      ]),
      h("button", { type: "button", class: "tdx", "data-rm": t.id, "aria-label": "Remove " + t.title, text: "Remove" })
    ]);
  }
  function planRow(p) {
    var word = p.state === "done" ? "Done" : p.state === "doing" ? "Doing now" : "To do";
    return h("li", { class: "tdr pl" + (p.state === "done" ? " done" : "") }, [
      h("span", { class: "tdc dot", "aria-hidden": "true", text: p.state === "done" ? "✓" : "•" }),
      h("div", { class: "tdb" }, [
        h("span", { class: "tdn", text: p.title }),
        h("span", { class: "tdtag" }, [label("From Claude", "l-cl"), label(word, "l-st")])
      ]),
      h("button", { type: "button", class: "tdx", "data-openboard": "1", "aria-label": "Open " + p.title + " on the Board", text: "Open" })
    ]);
  }
  function group(title, items, empty) {
    var ul = h("ul", { class: "tdlist" });
    items.forEach(function (li) { ul.appendChild(li); });
    if (!items.length) ul.appendChild(h("li", { class: "tdempty", text: empty }));
    return h("section", { class: "card tdg" }, [h("h2", { class: "tdh", text: title }), ul]);
  }
  function calCard() {
    load();
    var url = doc.cal && doc.cal.url, kids = [h("h2", { class: "tdh", text: "Apple Calendar" })];
    if (!url) {
      kids.push(
        h("p", { class: "tdnote", text: "Show your calendar events here. Apple does not allow a sign-in for web apps, so you share one calendar with a link." }),
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
        h("p", { class: "tdfine", text: "Anyone who has this link can read that calendar. It is saved only in your private Closing Desk account. Use a calendar with events you are fine sharing." })
      );
      if (cal.msg) kids.push(h("p", { class: "tderr", role: "alert", text: cal.msg }));
    } else {
      var when = cal.at ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(cal.at)).replace(/\./g, "").toUpperCase() : "";
      kids.push(
        h("p", { class: "tdnote" }, [h("b", { text: "Connected. " }), cal.busy ? "Updating…" : (when ? "Updated " + when + "." : "Not updated yet.")]),
        h("div", { class: "tdrow" }, [
          h("button", { type: "button", class: "tdbtn ghost", "data-calrefresh": "1", text: "Refresh" }),
          h("button", { type: "button", class: "tdbtn ghost", "data-caloff": "1", text: confirmOff ? "Tap again to disconnect" : "Disconnect" })
        ])
      );
      if (cal.state === "err" && cal.msg) kids.push(h("p", { class: "tderr", role: "alert", text: cal.msg }));
    }
    return h("section", { class: "card tdg tdcal" }, kids);
  }
  function addForm() {
    var title = h("input", { id: "tdTitle", class: "tdin", type: "text", maxlength: "200", autocomplete: "off", placeholder: "Add a task for today", "aria-label": "Task for today" });
    title.value = formState.title;
    var time = h("input", { id: "tdTime", class: "tdin tdtime", type: "time", "aria-label": "Time (optional)" }); time.value = formState.time;
    return h("form", { class: "card tdadd", "data-addform": "1", novalidate: true }, [title, time, h("button", { type: "submit", class: "tdbtn", text: "Add" })]);
  }

  function paint() {
    if (!root || !root.isConnected) { root = document.querySelector("[data-tday]"); if (!root) return; }
    var td = todayStr(), nm = nowMin(), d = load();
    var own = Object.keys(d.tasks).map(function (k) { return d.tasks[k]; }).filter(function (t) { return t && !t.del && t.title; });
    var todays = own.filter(function (t) { return t.date === td; });
    var carried = own.filter(function (t) { return t.date < td && !t.done; });
    var events = cal.date === td ? cal.events : [];
    var timed = todays.filter(function (t) { return t.time; });
    var sched = [];
    events.forEach(function (ev) { sched.push({ k: ev.allDay ? -1 : (mins(ev.start) || 0), o: 0, el: evRow(ev, nm, true) }); });
    timed.forEach(function (t) { sched.push({ k: mins(t.time), o: 1, el: taskRow(t, false) }); });
    sched.sort(function (a, b) { return a.k - b.k || a.o - b.o; });
    var todo = [];
    carried.sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (t) { todo.push(taskRow(t, true)); });
    todays.filter(function (t) { return !t.time; }).sort(function (a, b) { return (a.u || 0) - (b.u || 0); }).forEach(function (t) { todo.push(taskRow(t, false)); });
    var plan = (opts.plan || []);
    plan.forEach(function (p) { todo.push(planRow(p)); });
    var all = todays.concat(carried), total = all.length + plan.length, done = all.filter(function (t) { return t.done; }).length + plan.filter(function (p) { return p.state === "done"; }).length;
    var connected = !!(d.cal && d.cal.url);

    var main = h("div", { class: "tdmain" }, [
      addForm(), opts.vwEl || null,
      group("Scheduled", sched.map(function (s) { return s.el; }), connected ? "Nothing scheduled today." : "Nothing scheduled. Add a time to a task, or connect your calendar."),
      group("To do", todo, "Nothing to do yet. Add a task above.")
    ]);
    var side = h("div", { class: "tdside" }, [calCard()]);
    var head = h("header", { class: "title-row tdhead" }, [
      h("div", {}, [h("h1", { text: "Today" }), h("p", { class: "sub", text: dateLabel(td, { weekday: "long", month: "long", day: "numeric" }) })]),
      h("div", { class: "tdcount", "aria-live": "polite" }, [h("b", { class: "tn", text: done + " of " + total }), h("span", { text: " done" })])
    ]);
    var focusId = document.activeElement && document.activeElement.id, selS = null, selE = null;
    if (focusId === "tdTitle") { selS = document.activeElement.selectionStart; selE = document.activeElement.selectionEnd; }
    root.textContent = "";
    root.appendChild(head);
    var body = h("div", { class: "tdbody" + (connected ? " conn" : "") }, connected ? [main, side] : [side, main]);
    root.appendChild(body);
    var st = status === "offline" ? (pending ? "Not saved to the cloud yet. Kept on this device." : "Offline. Showing the copy on this device.") : status === "saving" ? "Saving…" : "";
    if (st) root.appendChild(h("p", { class: "tdfine tdst", role: "status", text: st }));
    if (focusId === "tdTitle") { var n = document.getElementById("tdTitle"); if (n) { n.focus(); try { n.setSelectionRange(selS, selE); } catch (e) {} } }
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
    var b = e.target.closest ? e.target.closest("[data-rm],[data-openboard],[data-calrefresh],[data-caloff]") : null;
    if (!b || !b.closest("[data-tday]")) return;
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
  setInterval(function () { if (document.visibilityState === "visible" && root && root.isConnected) { paint(); if (Date.now() - calAt > 300000) refreshCal(); } }, 60000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { open(); refreshCal(); paint(); } });

  window.TDAY = {
    /* Called by tasks.js on every render. Returns the tab's container; the content is painted from saved state. */
    view: function (o) {
      opts = { plan: (o && o.plan) || [], openBoard: (o && o.openBoard) || null, vwEl: (o && o.vwEl) || null, afterPaint: (o && o.afterPaint) || null };
      root = h("section", { class: "tdy", "data-tday": "1" });
      load(); open();
      setTimeout(function () { if (root && root.isConnected) { paint(); refreshCal(); } }, 0);
      return root;
    },
    paint: paint, todayStr: todayStr,
    _state: function () { return { doc: load(), cal: cal, status: status }; }
  };
})();
