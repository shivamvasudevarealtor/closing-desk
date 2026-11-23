/* One list for the day. Home and Tasks > Today both draw it, so the counts always agree.
   It brings four kinds of task into one place: yours, Claude's three, today's vacation-plan day, and today's licence study day, plus your calendar events.
   Every row can open to show its subtasks. The split by source is a card at the bottom ("Task lists"), and tapping a source filters the list.
   Reads: TDAY (tasks-today.js) for your tasks and calendar, VW (vacation-core.js) for the vacation plan, the plan passed in by the page for Claude's tasks.
   Saves: your task ticks and study-step ticks through TDAY, vacation-plan ticks through VW. Nothing else is stored here except which rows are open (this tab only). */
window.TALL = (function () {
  "use strict";
  var TD = window.TDAY, VW = window.VW, PD = window.PIL_DATA || null;
  var STUDY_END = "2026-11-29";
  /* Commercial licence study plan: [date, weekday, day number, title, one line, setup to-dos]. The wording is yours; the to-dos are the actions in your Sun 22 line. */
  var STUDY = [
    ["2026-11-22", "Sun", "22", "Set up and find your gaps", "Book exam slot, order the HP 10bII+, take a prep exam cold.", ["Book exam slot", "Order the HP 10bII+", "Take a prep exam cold"]],
    ["2026-11-23", "Mon", "23", "Markets and property types", "", []],
    ["2026-11-24", "Tue", "24", "Investment analysis", "The maths day, all on the HP 10bII+.", []],
    ["2026-11-25", "Wed", "25", "Leasing principles", "", []],
    ["2026-11-26", "Thu", "26", "Rules, ethics and common errors", "", []],
    ["2026-11-27", "Fri", "27", "Fix weak spots, first practice exam", "", []],
    ["2026-11-28", "Sat", "28", "Full timed mock", "100 questions, 70% to pass. Review every miss.", []],
    ["2026-11-29", "Sun", "29", "Light review, then rest", "Confirm ID, calculator, test centre.", []]
  ];
  var LOOP = ["Learn it", "Get quizzed by Claude", "Calculator reps"];
  var SRC = {
    me: { label: "Mine", cls: "me" }, cl: { label: "Claude", cls: "cl" }, pl: { label: "Pillar habits", cls: "pl" }, st: { label: "Study", cls: "st" },
    vw: { label: "Vacation week", cls: "vw" }, cal: { label: "Calendar", cls: "cal" }
  };
  var ORDER = ["me", "cl", "pl", "st", "vw", "cal"];
  var LIST_MAX = 9;

  /* ---------- small helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k === "html") el.innerHTML = v; else el.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  var SVG = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  };
  function ic(name, cls) { var s = h("span", { class: cls || "tl-ic", "aria-hidden": "true" }); s.innerHTML = SVG[name]; return s; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  function dlabel(date, td) {
    if (!date || date === td) return "Today";
    var p = td.split("-").map(Number), t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1, 12)), tm = t.toISOString().slice(0, 10);
    return date === tm ? "Tomorrow" : TD.dateLabel(date, { weekday: "short", month: "short", day: "numeric" });
  }

  /* ---------- the model ---------- */
  function vdoc() { return VW && VW.get ? safe(VW.get, null) : null; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  var M_pil = null;
  /* today's habits per pillar. The licence habit depends on whether the course is approved. */
  function pillarsModel(td, flags, licOk) {
    if (!PD) return null;
    var groups = [], total = 0, done = 0;
    PD.pillars.forEach(function (p) {
      var list = p.id === "lic" ? (licOk ? p.habits : p.habitsWait) : p.habits, hs = (list || []).map(function (t, i) {
        var id = "pl-" + td + "-" + p.id + "-" + (i + 1); return { id: id, title: t, done: !!flags[id], kind: "pl", pillar: p.id };
      }), d = hs.filter(function (x) { return x.done; }).length;
      groups.push({ id: p.id, n: p.n, name: p.name, habits: hs, done: d, total: hs.length }); total += hs.length; done += d;
    });
    return { groups: groups, total: total, done: done };
  }
  function model(ctx) {
    ctx = ctx || {};
    var flags = TD.flags(), licOk = !PD || !!flags["pl-lic-approved"], paused = 0; /* without the pillars file there is nothing to approve on, so nothing is paused */
    /* Until the course is approved, Claude's study tasks wait (the Board still has them). */
    var plan = (ctx.plan || []).filter(function (p) { if (!licOk && (p.tag === "STUDY" || p.role === "STUDY")) { paused++; return false; } return true; });
    var B = TD.model(plan), td = B.td, nm = B.nm, items = [], doc = vdoc(), now = { date: td, min: nm };

    B.items.forEach(function (it) {
      if (it.src === "cal") {
        items.push({ key: "cal:" + it.id, src: "cal", title: it.title, full: it.title, done: false, allDay: !!it.allDay, min: it.allDay ? -1 : it.min, text: it.allDay ? "All day" : TD.range(it.start, it.end), loc: it.loc || "", now: !!it.now, past: !!it.past, subs: [] });
      } else if (it.src === "me") {
        var ms = (it.subs || []).map(function (x) { return { id: x.id, tid: it.id, title: x.title, done: !!x.done, kind: "ms" }; }), md = ms.filter(function (x) { return x.done; }).length;
        items.push({ key: "me:" + it.id, src: "me", id: it.id, title: it.title, full: it.title, note: it.note || "", done: !!it.done, late: !!it.carried, carried: it.carried || "", min: it.timed ? it.min : null, text: it.timed ? TD.fmt12(it.start) : "", past: !!it.past, subs: ms, prog: ms.length ? { done: md, total: ms.length } : null, canRemove: true, ord: it.u || 0 });
      } else {
        var p = plan[it.u] || {}, steps = (p.steps || []).map(function (x) { return { title: x.t, m: x.m, done: !!x.d, kind: "ro" }; }), sd = steps.filter(function (x) { return x.done; }).length;
        items.push({ key: "cl:" + it.id, src: "cl", title: it.title, full: p.full || it.title, desc: p.desc || "", state: it.state, mins: it.mins, done: !!it.done, subs: steps, prog: steps.length ? { done: sd, total: steps.length } : null, ord: it.u || 0 });
      }
    });

    /* vacation plan: today's parent task and its timed subtasks */
    var vwItem = null, earlier = 0;
    if (doc && VW && VW.inRange(td)) {
      var p = VW.parentOn(doc, td);
      if (p && p.family) {
        vwItem = { key: "vw:" + p.id, src: "vw", title: "Family day. Nothing scheduled.", full: p.title, done: false, family: true, subs: [], ord: 0 };
      } else if (p) {
        var nx = VW.nextUp(doc, now), st = VW.parentStats(doc, p.id);
        var subs = VW.sorted(doc, p.id).map(function (s) {
          var ended = s.s != null && !s.open && (s.e != null ? s.e <= nm : s.s < nm);
          return { id: s.id, title: s.title, time: VW.fmtRange(s), done: !!s.done, past: !s.done && ended, now: !s.done && !s.open && s.s != null && s.e != null && s.s <= nm && nm < s.e, next: !!(nx && nx.id === s.id), cat: s.cat, details: s.details || "", kind: "vw", s: s.s, e: s.e, open: !!s.open };
        });
        vwItem = { key: "vw:" + p.id, src: "vw", title: p.title, full: p.title, note: p.details || "", done: st.total > 0 && st.done === st.total, subs: subs, prog: { done: st.done, total: st.total }, nextSub: nx ? { title: nx.title, text: VW.fmtRange(nx) } : null, ord: 0 };
      }
    }
    if (doc && VW) VW.parentsList(doc).forEach(function (q) { earlier += VW.overdueCount(doc, q, now); });
    if (vwItem) items.push(vwItem);

    /* study day */
    var si = -1; STUDY.forEach(function (r, i) { if (r[0] === td) si = i; });
    var stItem = null;
    if (si >= 0 && licOk) {
      var r = STUDY[si], list = (r[5] || []).concat(LOOP), ss = list.map(function (t, i) {
        var id = "vwk-" + td + "-" + (i + 1);
        return { id: id, title: t, done: !!flags[id], kind: "st", loop: i >= (r[5] || []).length };
      }), sdn = ss.filter(function (x) { return x.done; }).length;
      stItem = { key: "st:" + td, src: "st", title: r[3], full: r[3], note: r[4], dayNo: si + 1, dayOf: STUDY.length, done: sdn === ss.length, subs: ss, prog: { done: sdn, total: ss.length }, ord: 0 };
      items.push(stItem);
    }

    /* pillar habits: one row, grouped by pillar */
    var plItem = null, pil = pillarsModel(td, flags, licOk);
    if (pil && pil.total) {
      var psubs = []; pil.groups.forEach(function (g) { psubs.push({ kind: "hd", title: g.n + " · " + g.name }); g.habits.forEach(function (x) { psubs.push(x); }); });
      plItem = { key: "pl:" + td, src: "pl", title: "Pillar habits", full: "Pillar habits", note: "One small habit under each of your five pillars. Tick them here or on the Five pillars card.", done: pil.done === pil.total, subs: psubs, prog: { done: pil.done, total: pil.total }, ord: 0 };
      items.push(plItem);
    }
    M_pil = pil;

    /* order: happening now, timed, carried over, yours, Claude, pillar habits, study, vacation, past timed, done */
    function rank(it) {
      if (it.done) return 9;
      if (it.src === "cal") return it.past ? 8 : it.now ? 0 : 1;
      if (it.min != null) return it.past ? 8 : 1;
      if (it.late) return 2;
      return { me: 3, cl: 4, pl: 4.5, st: 5, vw: 6 }[it.src] || 7;
    }
    items.forEach(function (it, i) { it.rank = rank(it); it.idx = i; });
    items.sort(function (a, b) { return a.rank - b.rank || (a.min != null && b.min != null ? a.min - b.min : 0) || (a.carried && b.carried ? (a.carried < b.carried ? -1 : 1) : 0) || (a.ord || 0) - (b.ord || 0) || a.idx - b.idx; });

    /* totals: calendar events and the family day are not tasks */
    var tasks = items.filter(function (it) { return it.src !== "cal" && !it.family; });
    var M = { td: td, nm: nm, list: items, total: tasks.length, done: tasks.filter(function (it) { return it.done; }).length, open: tasks.filter(function (it) { return !it.done; }).length, later: B.later || [], connected: B.connected, calState: B.calState, base: B, earlier: earlier };
    M.events = items.filter(function (it) { return it.src === "cal"; }).length;
    M.pil = M_pil; M.licOk = licOk; M.paused = paused;

    /* what to do next: happening now, the next timed thing, and the first thing still open */
    var nowIt = null, nextT = null, firstOpen = null;
    items.forEach(function (it) { if (!nowIt && it.src === "cal" && it.now) nowIt = { title: it.title, text: it.text, loc: it.loc, src: "cal" }; });
    function cand(c) { if (!nextT || c.min < nextT.min) nextT = c; }
    items.forEach(function (it) {
      if (it.done) return;
      if (it.src === "cal" && !it.allDay && !it.past && !it.now && it.min > nm) cand({ title: it.title, text: it.text, min: it.min, src: "cal" });
      if (it.src === "me" && it.min != null && !it.past && it.min > nm) cand({ title: it.title, text: it.text, min: it.min, src: "me", id: it.id });
    });
    if (vwItem && vwItem.subs) vwItem.subs.forEach(function (s) {
      if (s.done || s.open || s.s == null) return;
      if (!nowIt && s.now) nowIt = { title: s.title, text: s.time, src: "vw" };
      if (s.s > nm) cand({ title: s.title, text: s.time, min: s.s, src: "vw" });
    });
    for (var i = 0; i < items.length; i++) { if (items[i].rank >= 2 && items[i].rank <= 7 && !items[i].done && items[i].src !== "cal" && !items[i].family) { firstOpen = items[i]; break; } }
    M.now = nowIt; M.nextTimed = nextT; M.firstOpen = firstOpen;

    /* the split by source, for the card at the bottom */
    function agg(src, cb) { var a = items.filter(function (it) { return it.src === src && !it.family; }); return cb ? cb(a) : a; }
    function sum(a, subs) { var d = 0, t = 0; a.forEach(function (it) { if (subs && it.prog) { d += it.prog.done; t += it.prog.total; } else { t += 1; if (it.done) d += 1; } }); return { done: d, total: t }; }
    M.lists = ORDER.map(function (src) {
      var a = agg(src), r2 = src === "cal" ? { done: 0, total: M.events } : sum(a, src === "vw" || src === "st" || src === "pl"), o = { src: src, label: SRC[src].label, done: r2.done, total: r2.total, sub: "", text: "" };
      if (src === "cal") { o.text = !M.connected ? "Not connected" : r2.total ? plural(r2.total, "event", "events") : "No events"; if (!M.connected) o.sub = "Connect Apple Calendar"; }
      else if (src === "vw") { o.text = !vwItem ? "No plan today" : vwItem.family ? "Family day" : r2.done + " of " + r2.total + " subtasks done"; if (vwItem && vwItem.family) o.sub = "Nothing scheduled"; if (earlier > 0) o.sub = plural(earlier, "subtask", "subtasks") + " not ticked on earlier days"; }
      else if (src === "st") { if (!licOk) { o.text = "Paused"; o.sub = "Waiting for your course approval" + (paused ? " · " + plural(paused, "task", "tasks") + " on hold" : ""); } else { o.text = !stItem ? "No study day today" : r2.done + " of " + r2.total + " subtasks done"; if (stItem) o.sub = "Commercial licence · day " + stItem.dayNo + " of " + stItem.dayOf; } }
      else if (src === "pl") { o.text = !pil || !pil.total ? "No habits today" : r2.done + " of " + r2.total + " habits done"; o.sub = "Five pillars"; }
      else o.text = r2.total ? r2.done + " of " + r2.total + " done" : "Nothing today";
      return o;
    });
    return M;
  }

  /* the Stop test: one of three scores a day, saved as three flags (only one on) */
  var STOPS = [["short", "Short"], ["close", "Close"], ["over", "Over"]];
  function stopOn(flags, date) { for (var i = 0; i < STOPS.length; i++) if (flags["plstop-" + date + "-" + STOPS[i][0]]) return STOPS[i][0]; return ""; }
  function daysBack(td, n) { var p = td.split("-").map(Number), out = []; for (var i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(p[0], p[1] - 1, p[2] - i, 12)).toISOString().slice(0, 10)); return out; }

  var FOCUS_RE = /^(tl(Title|Date|Time|Wc)|tlSub-.+)$/, TEXT_RE = /^(tlTitle|tlWc|tlSub-.+)$/;

  /* ---------- view state ---------- */
  var subDraft = {}, wcBudget = 0, wcText = "", openMap = {}, filter = null, showAll = false, undo = null, undoTimer = null, F = { title: "", date: "", time: "" }, addTouched = false, mounts = [], raf = 0;
  try { openMap = JSON.parse(sessionStorage.getItem("cd.tl.open") || "{}") || {}; } catch (e) { openMap = {}; }
  function saveOpen() { try { sessionStorage.setItem("cd.tl.open", JSON.stringify(openMap)); } catch (e) {} }

  /* ---------- rows ---------- */
  function tag(src) { return h("span", { class: "tl-tag " + SRC[src].cls, text: SRC[src].label }); }
  function ring(p) {
    var d = p && p.total ? p.done / p.total : 0, R = 11, C = 2 * Math.PI * R, s = h("span", { class: "tl-ring" + (p && p.total && p.done === p.total ? " full" : ""), "aria-hidden": "true" });
    s.innerHTML = '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="' + R + '" class="rt"/><circle cx="14" cy="14" r="' + R + '" class="rp" stroke-dasharray="' + (C * d).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 14 14)"/></svg>';
    return s;
  }
  function metaOf(it) {
    var bits = [];
    if (it.src === "cal") { bits.push(it.text); if (it.loc) bits.push(it.loc); }
    else if (it.src === "me") { if (it.late) bits.push("From " + TD.dateLabel(it.carried, { weekday: "short", month: "short", day: "numeric" })); else if (it.text) bits.push(it.text); if (it.prog) bits.push(it.prog.done + "/" + it.prog.total + " steps"); }
    else if (it.src === "pl") { bits.push("Five pillars"); bits.push(it.prog.done + "/" + it.prog.total); }
    else if (it.src === "cl") { bits.push(it.state === "done" ? "Done" : it.state === "doing" ? "Doing now" : it.mins ? "About " + it.mins + " min" : "To do"); if (it.prog && it.prog.total > 1 && it.state !== "done") bits.push(plural(it.prog.total, "step", "steps")); }
    else if (it.src === "st") { bits.push("Commercial licence · day " + it.dayNo + " of " + it.dayOf); bits.push(it.prog.done + "/" + it.prog.total); }
    else if (it.src === "vw") {
      if (it.family) return [];
      bits.push(it.prog.done + "/" + it.prog.total);
      if (it.nextSub && !it.done) bits.push("Next " + it.nextSub.text + " · " + it.nextSub.title);
    }
    return bits.filter(Boolean);
  }
  function subRow(s, it, scope) {
    if (s.kind === "hd") return h("li", { class: "tl-s hd" }, [h("span", { class: "tl-sh", text: s.title })]);
    var li = h("li", { class: "tl-s " + s.kind + (s.done ? " done" : "") + (s.past ? " past" : "") + (s.now ? " now" : "") });
    if (s.kind === "ro") {
      li.appendChild(h("span", { class: "tl-sd" + (s.done ? " ok" : ""), "aria-hidden": "true", html: s.done ? SVG.check : "" }));
      li.appendChild(h("span", { class: "tl-sb" }, [h("span", { class: "tl-sn", text: s.title }), s.m ? h("span", { class: "tl-sm", text: s.m + " min" }) : null]));
      return li;
    }
    var id = "sk-" + (scope ? scope + "-" : "") + s.id, cb = h("input", { type: "checkbox", id: id, "data-sk": s.kind, "data-id": s.id, "data-tid": s.tid || null, "data-title": s.title, "aria-label": s.title + (s.time ? ", " + s.time : "") });
    cb.checked = !!s.done;
    li.appendChild(h("span", { class: "tl-ck sm" }, [cb, h("span", { class: "tl-box", "aria-hidden": "true", html: SVG.check })]));
    li.appendChild(h("label", { class: "tl-sb", "for": id }, [
      h("span", { class: "tl-sn" }, [s.title, s.now ? h("span", { class: "tl-pill", text: "Now" }) : s.next ? h("span", { class: "tl-pill soft", text: "Next" }) : null]),
      s.time || (s.kind === "st" && s.loop) ? h("span", { class: "tl-sm", text: s.time || "Daily loop" }) : null
    ]));
    return li;
  }
  function detail(it, o) {
    var d = h("div", { class: "tl-x", id: "tlx-" + it.key.replace(/[^a-z0-9]/gi, "-") }), kids = [];
    if (it.src === "me") {
      /* the title above is shown in full once the row is open, so the text is not repeated here */
      if (it.note) d.appendChild(h("p", { class: "tl-full", text: it.note }));
      if (it.subs.length) { var us = h("ul", { class: "tl-subs" }); it.subs.forEach(function (x) { us.appendChild(subRow(x, it)); }); d.appendChild(us); }
      var sub1 = h("input", { id: "tlSub-" + it.id, class: "tl-in sm", type: "text", maxlength: "200", autocomplete: "off", enterkeyhint: "done", placeholder: "Add a step", "aria-label": "Add a step to " + it.title });
      sub1.value = subDraft[it.id] || "";
      d.appendChild(h("form", { class: "tl-subadd", "data-tl-subform": it.id, novalidate: true }, [sub1,
        h("button", { type: "submit", class: "tl-addb sm", "aria-label": "Add step" }, [ic("plus")])
      ]));
      d.appendChild(h("div", { class: "tl-acts" }, [h("button", { type: "button", class: "tl-btn ghost", "data-tl-rm": it.id, "data-title": it.full }, [ic("x"), "Remove"])]));
      return d;
    }
    if (it.src === "cal") { d.appendChild(h("p", { class: "tl-full", text: [it.text, it.loc].filter(Boolean).join(" · ") })); return d; }
    if (it.src === "cl") {
      var txt = it.desc || (it.full && it.full !== it.title ? it.full : "");
      if (txt) d.appendChild(h("p", { class: "tl-full", text: txt }));
      if (it.subs.length) { var ol = h("ol", { class: "tl-steps" }); it.subs.forEach(function (s) { ol.appendChild(subRow(s, it)); }); d.appendChild(ol); }
      d.appendChild(h("div", { class: "tl-acts" }, [h("a", { class: "tl-btn", href: "tasks.html#board" }, ["Do it on the Board", ic("go")])]));
      return d;
    }
    if (it.note) d.appendChild(h("p", { class: "tl-full", text: it.note }));
    var ul = h("ul", { class: "tl-subs" }); it.subs.forEach(function (s) { ul.appendChild(subRow(s, it)); }); d.appendChild(ul);
    if (it.src === "pl") { d.appendChild(h("div", { class: "tl-acts" }, [h("a", { class: "tl-btn ghost", href: (o && o.pillarsHref) || "#hmPillars" }, ["Open the five pillars", ic("go")])])); return d; }
    d.appendChild(h("div", { class: "tl-acts" }, [it.src === "vw" ? h("a", { class: "tl-btn ghost", href: "vacation.html#today" }, ["Open the vacation plan", ic("go")]) : h("a", { class: "tl-btn ghost", href: (o && o.studyHref) || "#hmVwk" }, ["See the 8-day study plan", ic("go")])]));
    return d;
  }
  function row(it, o) {
    var expandable = it.src !== "cal" || !!it.loc, open = expandable && !!openMap[it.key] && !(it.src === "vw" && it.family);
    if (it.family) expandable = false;
    var li = h("li", { class: "tl-i " + SRC[it.src].cls + (open ? " open" : "") + (it.done ? " done" : "") + (it.late && !it.done ? " late" : "") + (it.past && !it.done ? " past" : "") + (it.now ? " now" : ""), "data-key": it.key });
    var r = h("div", { class: "tl-r" });
    if (it.src === "me") {
      var cb = h("input", { type: "checkbox", id: "tk-" + it.id, "data-tk": it.id, "aria-label": it.title }); cb.checked = !!it.done;
      r.appendChild(h("span", { class: "tl-ck" }, [cb, h("span", { class: "tl-box", "aria-hidden": "true", html: SVG.check })]));
    } else if (it.src === "cl") r.appendChild(h("span", { class: "tl-lead cl" + (it.done ? " ok" : ""), "aria-hidden": "true" }, [ic(it.done ? "check" : "spark")]));
    else if (it.src === "cal") r.appendChild(h("span", { class: "tl-lead cal", "aria-hidden": "true" }, [ic("cal")]));
    else if (it.family) r.appendChild(h("span", { class: "tl-lead vw", "aria-hidden": "true" }, [ic("flag")]));
    else r.appendChild(h("span", { class: "tl-lead ring" }, [ring(it.prog)]));
    var meta = h("span", { class: "tl-m" }, [tag(it.src)]);
    metaOf(it).forEach(function (m, i) { meta.appendChild(h("span", { class: "tl-mt" + (i === 0 && it.late ? " late" : ""), text: m })); });
    var inner = [h("span", { class: "tl-t", text: it.title }), meta];
    if (expandable) {
      var b = h("button", { type: "button", class: "tl-main", "data-tl-open": it.key, "aria-expanded": open ? "true" : "false", "aria-controls": "tlx-" + it.key.replace(/[^a-z0-9]/gi, "-"), "aria-label": it.title + ". " + (open ? "Hide" : "Show") + " details" }, inner);
      b.appendChild(h("span", { class: "tl-chev", html: SVG.go, "aria-hidden": "true" }));
      r.appendChild(b);
    } else r.appendChild(h("div", { class: "tl-main static" }, inner));
    li.appendChild(r);
    if (open) li.appendChild(detail(it, o));
    return li;
  }

  /* ---------- Communication practice: word check ---------- */
  function wcCount(t) { t = String(t || "").trim(); return t ? t.split(/\s+/).length : 0; }
  function wcBud() { return wcBudget || (PD && PD.budgets && PD.budgets[0] ? PD.budgets[0][1] : 40); }
  function wcMsg() {
    var n = wcCount(wcText), b = wcBud();
    if (!n) return "Paste a message you sent and you get a count against the budget.";
    return n <= b ? n + " of " + b + " words. Within budget." : n + " of " + b + " words. Over by " + (n - b) + ". Cut the last sentence first.";
  }
  function wcOut() { var o = document.getElementById("tlWcOut"); if (o) { o.textContent = wcMsg(); o.className = "tl-wco" + (wcCount(wcText) > wcBud() ? " over" : wcCount(wcText) ? " ok" : ""); } }

  /* ---------- the Today card ---------- */
  function timeText(v) { return TD.mins(v) != null ? TD.fmt12(v) : ""; }
  /* First tap on either button picks a sensible time (the next quarter hour today, 9:00 AM on another day); after that each tap moves 15 minutes. */
  function stepTime(dir, td, nm) {
    var cur = TD.mins(F.time), m;
    if (cur == null) m = F.date && F.date !== td ? 9 * 60 : Math.ceil((nm + 1) / 15) * 15;
    else m = cur + dir * 15;
    m = Math.min(23 * 60 + 45, Math.max(0, m)); F.time = ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
  }
  function composer(M) {
    var td = M.td;
    var title = h("input", { id: "tlTitle", class: "tl-in", type: "text", maxlength: "200", autocomplete: "off", enterkeyhint: "done", placeholder: "Add a task", "aria-label": "New task" }); title.value = F.title;
    var date = h("input", { id: "tlDate", class: "tl-native", type: "date", min: td, "aria-label": "Date" }); date.value = F.date || td;
    var dateChip = h("label", { class: "tl-chip date" + (F.date && F.date !== td ? " set" : ""), "for": "tlDate" }, [ic("cal"), h("span", { text: dlabel(F.date, td) }), date]);
    var tm = h("input", { id: "tlTime", class: "tl-native", type: "time", step: "300", "aria-label": "Time" }); tm.value = F.time;
    var timeChip = h("label", { class: "tl-chip time" + (F.time ? " set" : ""), "for": "tlTime" }, [h("span", { text: F.time ? timeText(F.time) : "No time" }), tm]);
    var step = h("div", { class: "tl-step", role: "group", "aria-label": "Time" }, [
      h("button", { type: "button", class: "tl-sb2", "data-tl-step": "-1", "aria-label": "15 minutes earlier" }, [ic("minus")]), timeChip,
      h("button", { type: "button", class: "tl-sb2", "data-tl-step": "1", "aria-label": "15 minutes later" }, [ic("plus")])
    ]);
    var kids = [title, h("div", { class: "tl-opts" }, [dateChip, step, F.time ? h("button", { type: "button", class: "tl-clr", "data-tl-notime": "1", "aria-label": "Clear the time" }, [ic("x")]) : null, h("button", { type: "submit", class: "tl-addb", "aria-label": "Add task" }, [ic("plus"), "Add"])])];
    return h("form", { class: "tl-add" + (addTouched || F.title || F.date || F.time ? " touched" : ""), "data-tl-form": "1", novalidate: true }, kids);
  }
  function drawToday(root, M, o) {
    root.textContent = ""; root.classList.toggle("compact", !!o.compact);
    var mx = o.max || LIST_MAX;
    var shown = M.list.filter(function (it) { return !filter || it.src === filter; });
    var head = h("div", { class: "tl-h" }, [h("h2", {}, [h("span", { class: "tl-hi", html: SVG.flag }), o.title || "Today", h("span", { class: "tl-cn tn" + (M.open ? "" : " zero"), text: String(M.open) })])]);
    if (o.link) head.appendChild(h("a", { class: "tl-more", href: o.link }, [o.linkText || "Open Tasks", ic("go")]));
    if (!o.bare) root.appendChild(head); else root.classList.add("bare");
    if (M.total && !o.bare) root.appendChild(h("div", { class: "tl-pr" }, [h("span", { class: "tl-prt tn", text: M.done + " of " + M.total + " done" }), h("span", { class: "tl-bar", "aria-hidden": "true" }, [h("i", { style: "width:" + Math.round(M.done * 100 / M.total) + "%" })])]));
    if (filter) {
      var li = M.lists.filter(function (x) { return x.src === filter; })[0];
      root.appendChild(h("div", { class: "tl-fbar" }, [h("span", { text: "Showing " + (li ? li.label : "") }), h("button", { type: "button", class: "tl-clear", "data-tl-filter": "" }, ["Show all", ic("x")])]));
    }
    if (undo) root.appendChild(h("div", { class: "tl-undo", role: "status" }, [h("span", { text: "Removed " + (undo.title.length > 40 ? undo.title.slice(0, 40) + "…" : undo.title) }), h("button", { type: "button", "data-tl-undo": undo.id, text: "Undo" })]));
    if (!shown.length) {
      var kids = [];
      if (filter) kids.push(h("p", {}, [h("b", { text: "Nothing in " + SRC[filter].label + " today." })]));
      else {
        kids.push(h("p", {}, [h("b", { text: "Nothing planned for today." }), " Add a task below" + (M.connected ? "." : " or connect your calendar.")]));
        if (!M.connected) kids.push(h("a", { class: "tl-btn", href: o.calHref || "tasks.html#today" }, ["Connect Apple Calendar", ic("go")]));
      }
      root.appendChild(h("div", { class: "tl-empty" }, kids));
    } else {
      var ul = h("ul", { class: "tl-list" }), cut = !showAll && shown.length > mx ? mx : shown.length;
      shown.slice(0, cut).forEach(function (it) { ul.appendChild(row(it, o)); });
      root.appendChild(ul);
      if (shown.length > cut) root.appendChild(h("button", { type: "button", class: "tl-foot", "data-tl-all": "1" }, [h("span", { text: "Show " + (shown.length - cut) + " more" }), ic("go")]));
      else if (showAll && shown.length > mx) root.appendChild(h("button", { type: "button", class: "tl-foot", "data-tl-all": "0" }, [h("span", { text: "Show less" }), ic("go")]));
    }
    if (!filter && M.later.length) {
      var lt = h("div", { class: "tl-later" }, [h("h3", { text: "Coming up" })]), lu = h("ul", { class: "tl-lu" });
      M.later.slice(0, 5).forEach(function (t) {
        lu.appendChild(h("li", {}, [h("span", { class: "tl-ld tn", text: dlabel(t.date, M.td) + (t.time ? " · " + TD.fmt12(t.time) : "") }), h("span", { class: "tl-ln", text: t.title }),
          h("button", { type: "button", class: "tl-lx", "data-tl-rm": t.id, "data-title": t.title, "aria-label": "Remove " + t.title }, [ic("x")])]));
      });
      lt.appendChild(lu); root.appendChild(lt);
    }
    root.appendChild(composer(M));
  }

  /* ---------- the Five pillars card ---------- */
  function pillarPanel(p, g, M, flags) {
    var d = h("div", { class: "tl-px", id: "tlp-" + p.id });
    d.appendChild(h("p", { class: "tl-full", text: p.why }));
    d.appendChild(h("h4", { class: "tl-ph", text: "This week" }));
    var wk = h("ul", { class: "tl-wk" }); p.week.forEach(function (t) { wk.appendChild(h("li", { text: t })); }); d.appendChild(wk);
    if (g.habits.length) { d.appendChild(h("h4", { class: "tl-ph", text: "Today's habits" })); var hu = h("ul", { class: "tl-subs" }); g.habits.forEach(function (x) { hu.appendChild(subRow(x, null, "p")); }); d.appendChild(hu); }
    if (p.id === "lic") {
      var ap = !!flags["pl-lic-approved"];
      d.appendChild(h("div", { class: "tl-box2" }, [
        h("p", { text: ap ? "Approved. The 8-day study plan and Claude's study tasks are back on your list." : "On hold until the course is approved. The study plan and Claude's study tasks are paused, not deleted." }),
        h("div", { class: "tl-acts" }, [h("button", { type: "button", class: "tl-btn" + (ap ? " ghost" : ""), "data-tl-lic": ap ? "0" : "1" }, [ap ? "Undo: not approved yet" : "I'm approved"])])
      ]));
    }
    if (p.id === "pro") {
      var yr = PD.year, tot = yr.deals * yr.avg;
      d.appendChild(h("div", { class: "tl-box2" }, [
        h("p", {}, [h("b", { text: "Your yearly target: " }), yr.deals + " closed deals × $" + yr.avg.toLocaleString("en-CA") + " average = $" + tot.toLocaleString("en-CA") + " commission."]),
        h("p", { class: "tl-fine", text: "To set the weekly counts I need two numbers from you: how many conversations it takes to book an appointment, and how many appointments it takes to close a deal. I won't guess them." })
      ]));
    }
    if (p.id === "com") {
      var box = h("div", { class: "tl-box2" });
      box.appendChild(h("h4", { class: "tl-ph", text: "The three rules" }));
      var rl = h("ol", { class: "tl-rules" }); PD.rules.forEach(function (r) { rl.appendChild(h("li", {}, [h("b", { text: r[0] + ". " }), r[1]])); }); box.appendChild(rl);
      box.appendChild(h("h4", { class: "tl-ph", text: "Ways to end it" }));
      var cl = h("ul", { class: "tl-closers" }); PD.closers.forEach(function (t) { cl.appendChild(h("li", { text: "\u201c" + t + "\u201d" })); }); box.appendChild(cl);
      box.appendChild(h("h4", { class: "tl-ph", text: "Stop test: did you stop in time today?" }));
      var cur = stopOn(flags, M.td), row = h("div", { class: "tl-stop", role: "group", "aria-label": "Stop test" });
      STOPS.forEach(function (x) { row.appendChild(h("button", { type: "button", class: "tl-sbtn " + x[0] + (cur === x[0] ? " on" : ""), "data-tl-stop": x[0], "aria-pressed": cur === x[0] ? "true" : "false", text: x[1] })); });
      box.appendChild(row);
      var dots = h("div", { class: "tl-dots", role: "img", "aria-label": "Stop test, last 7 days" });
      daysBack(M.td, 7).forEach(function (dt) { var v = stopOn(flags, dt); dots.appendChild(h("span", { class: "tl-dot " + (v || "none") }, [h("i"), h("span", { text: TD.dateLabel(dt, { weekday: "narrow" }) })])); });
      box.appendChild(dots);
      box.appendChild(h("p", { class: "tl-fine", text: "Short: you answered and stopped. Close: you added a bit more. Over: you kept going." }));
      box.appendChild(h("h4", { class: "tl-ph", text: "Word check" }));
      var bud = h("div", { class: "tl-bud", role: "group", "aria-label": "Word budget" });
      PD.budgets.forEach(function (b2) { bud.appendChild(h("button", { type: "button", class: "tl-chip2" + (wcBud() === b2[1] ? " on" : ""), "data-tl-wcb": String(b2[1]), "aria-pressed": wcBud() === b2[1] ? "true" : "false", text: b2[0] + " " + b2[1] })); });
      box.appendChild(bud);
      var ta = h("textarea", { id: "tlWc", class: "tl-in tl-wc", rows: "4", placeholder: "Paste a message you sent", "aria-label": "Message to count" }); ta.value = wcText; box.appendChild(ta);
      box.appendChild(h("p", { id: "tlWcOut", class: "tl-wco" + (wcCount(wcText) > wcBud() ? " over" : wcCount(wcText) ? " ok" : ""), text: wcMsg() }));
      box.appendChild(h("p", { class: "tl-fine", text: "These budgets are starting points. 75 words is about 30 seconds spoken." }));
      d.appendChild(box);
    }
    return d;
  }
  function drawPillars(root, M, o) {
    root.textContent = ""; root.classList.toggle("compact", !!o.compact);
    var P = M.pil; if (!PD || !P) return;
    var flags = TD.flags(), td = M.td;
    root.appendChild(h("div", { class: "tl-h" }, [h("h2", {}, [h("span", { class: "tl-hi", html: SVG.flag }), "Five pillars", h("span", { class: "tl-cn tn" + (P.done ? "" : " zero"), text: P.done + "/" + P.total })])]));
    root.appendChild(h("p", { class: "tl-lnote", text: "Your goals for next year. Today's habits are also in your Today list." }));
    var ul = h("ul", { class: "tl-pl" });
    PD.pillars.forEach(function (p) {
      var g = P.groups.filter(function (x) { return x.id === p.id; })[0] || { habits: [], done: 0, total: 0 }, key = "pil:" + p.id, open = !!openMap[key], wait = p.id === "lic" && !M.licOk;
      var status = wait ? "Waiting for course approval" : p.id === "lic" ? "Approved" : g.done + " of " + g.total + " habits today";
      if (p.id === "com") { var sv = stopOn(flags, td); if (sv) status += " · Stop test: " + STOPS.filter(function (x) { return x[0] === sv; })[0][1]; }
      var li = h("li", { class: "tl-pi" + (open ? " open" : "") + (wait ? " wait" : ""), "data-key": key });
      li.appendChild(h("button", { type: "button", class: "tl-pb", "data-tl-pil": p.id, "aria-expanded": open ? "true" : "false", "aria-controls": "tlp-" + p.id }, [
        h("span", { class: "tl-pn", "aria-hidden": "true", text: String(p.n) }),
        h("span", { class: "tl-pt" }, [h("span", { class: "tl-pname", text: p.name }), h("span", { class: "tl-pst", text: status })]),
        wait ? h("span", { class: "tl-pw", text: "On hold" }) : ring(g),
        h("span", { class: "tl-chev", html: SVG.go, "aria-hidden": "true" })
      ]));
      if (open) li.appendChild(pillarPanel(p, g, M, flags));
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }

  /* ---------- the Task lists card (the split by source) ---------- */
  function drawLists(root, M, o) {
    root.textContent = "";
    root.appendChild(h("div", { class: "tl-h" }, [h("h2", {}, [h("span", { class: "tl-hi", html: SVG.check }), "Task lists"])]));
    root.appendChild(h("p", { class: "tl-lnote", text: "Where today's tasks come from. Tap one to filter the Today list." }));
    var ul = h("ul", { class: "tl-ls" });
    M.lists.forEach(function (l) {
      var pct = l.total ? Math.round(l.done * 100 / l.total) : 0, on = filter === l.src;
      var b = h("button", { type: "button", class: "tl-lr " + SRC[l.src].cls + (on ? " on" : "") + (l.total || l.src === "cal" ? "" : " zero"), "data-tl-filter": l.src, "aria-pressed": on ? "true" : "false" }, [
        h("span", { class: "tl-li " + SRC[l.src].cls, "aria-hidden": "true", html: SVG[l.src === "cl" ? "spark" : l.src === "cal" ? "cal" : l.src === "me" ? "check" : l.src === "st" ? "clock" : "flag"] }),
        h("span", { class: "tl-lb" }, [h("span", { class: "tl-ll", text: l.label }), h("span", { class: "tl-lt tn", text: l.text }), l.sub ? h("span", { class: "tl-ls2", text: l.sub }) : null,
          l.src !== "cal" && l.total ? h("span", { class: "tl-bar", "aria-hidden": "true" }, [h("i", { style: "width:" + pct + "%" })]) : null]),
        h("span", { class: "tl-chev", html: SVG.go, "aria-hidden": "true" })
      ]);
      ul.appendChild(h("li", {}, [b]));
    });
    root.appendChild(ul);
  }

  /* ---------- drawing and repainting ---------- */
  function draw(el, kind, ctxFn, opts) {
    el.setAttribute("data-tlmount", kind);
    var found = false; mounts.forEach(function (m) { if (m.el === el) { m.kind = kind; m.ctxFn = ctxFn; m.opts = opts || {}; m.sig = null; found = true; } });
    if (!found) mounts.push({ el: el, kind: kind, ctxFn: ctxFn, opts: opts || {} });
    paintOne(mounts.filter(function (m) { return m.el === el; })[0]);
  }
  function paintOne(m) {
    if (!m || !m.el) return;
    var a = document.activeElement, fid = a && a.id && FOCUS_RE.test(a.id) && m.el.contains(a) ? a.id : null, ss = null, se = null;
    if (fid && TEXT_RE.test(fid)) { try { ss = a.selectionStart; se = a.selectionEnd; } catch (e) {} }
    var M = model(m.ctxFn ? m.ctxFn() : {});
    /* Nothing changed since the last paint (a save finishing, a clock tick): leave the page alone, so a tap that is in flight is not lost. */
    var sig; try { sig = JSON.stringify([M, TD.flags(), openMap, filter, showAll, F, undo && undo.id, wcBudget], function (k, v) { return k === "status" ? undefined : v; }); } catch (e) { sig = null; } /* the save status is not drawn here */
    if (sig && m.sig === sig && m.el.firstChild) return;
    m.sig = sig;
    if (m.kind === "lists") drawLists(m.el, M, m.opts); else if (m.kind === "pillars") drawPillars(m.el, M, m.opts); else drawToday(m.el, M, m.opts);
    if (fid && TEXT_RE.test(fid)) { var n = document.getElementById(fid); if (n) { n.focus(); try { n.setSelectionRange(ss, se); } catch (e) {} } }
  }
  function repaint() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; mounts = mounts.filter(function (m) { return m.el && m.el.isConnected; }); mounts.forEach(paintOne); });
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var b = t.closest("[data-tl-open],[data-tl-pil],[data-tl-stop],[data-tl-lic],[data-tl-wcb],[data-tl-rm],[data-tl-undo],[data-tl-filter],[data-tl-all],[data-tl-step],[data-tl-notime],label.tl-chip");
    if (!b) return;
    if (b.matches("label.tl-chip")) { var inp = b.querySelector("input"); if (inp && inp.showPicker && e.target === inp) { try { inp.showPicker(); } catch (x) {} } return; }
    if (!b.closest("[data-tlmount]")) return;
    if (b.hasAttribute("data-tl-open")) { var k = b.getAttribute("data-tl-open"); if (openMap[k]) delete openMap[k]; else openMap[k] = 1; saveOpen(); repaint(); return; }
    if (b.hasAttribute("data-tl-pil")) { var pk = "pil:" + b.getAttribute("data-tl-pil"); if (openMap[pk]) delete openMap[pk]; else openMap[pk] = 1; saveOpen(); repaint(); return; }
    if (b.hasAttribute("data-tl-stop")) {
      var sv = b.getAttribute("data-tl-stop"), tdy = TD.todayStr(), fl = TD.flags(), cur = stopOn(fl, tdy);
      STOPS.forEach(function (x) { var on = x[0] === sv && cur !== sv, id2 = "plstop-" + tdy + "-" + x[0]; if (on || fl[id2]) TD.flag(id2, on, "Stop test: " + x[1], "pl"); });
      repaint(); return;
    }
    if (b.hasAttribute("data-tl-lic")) { TD.flag("pl-lic-approved", b.getAttribute("data-tl-lic") === "1", "Commercial licence course approved", "pl"); repaint(); return; }
    if (b.hasAttribute("data-tl-wcb")) { wcBudget = +b.getAttribute("data-tl-wcb") || 0; repaint(); return; }
    if (b.hasAttribute("data-tl-rm")) {
      var id = b.getAttribute("data-tl-rm"), title = b.getAttribute("data-title") || "task"; TD.remove(id);
      undo = { id: id, title: title }; clearTimeout(undoTimer); undoTimer = setTimeout(function () { undo = null; repaint(); }, 8000); repaint(); return;
    }
    if (b.hasAttribute("data-tl-undo")) { TD.restore(b.getAttribute("data-tl-undo")); undo = null; clearTimeout(undoTimer); repaint(); return; }
    if (b.hasAttribute("data-tl-filter")) {
      var f = b.getAttribute("data-tl-filter") || null; filter = f && filter !== f ? f : null; repaint();
      if (filter) { var card = document.querySelector("[data-tlmount=today]"); if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    if (b.hasAttribute("data-tl-all")) { showAll = b.getAttribute("data-tl-all") === "1"; repaint(); return; }
    if (b.hasAttribute("data-tl-step")) { var M0 = model(currentCtx()); stepTime(+b.getAttribute("data-tl-step"), M0.td, M0.nm); repaint(); return; }
    if (b.hasAttribute("data-tl-notime")) { F.time = ""; repaint(); return; }
  });
  function currentCtx() { var m = mounts.filter(function (x) { return x.kind !== "lists" && x.el.isConnected; })[0] || mounts[0]; return m && m.ctxFn ? m.ctxFn() : {}; }
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.matches) return;
    if (t.matches("input[data-sk]")) {
      var kind = t.getAttribute("data-sk"), id = t.getAttribute("data-id");
      if (kind === "vw" && VW) VW.toggle(id, t.checked); else if (kind === "st") TD.flag(id, t.checked, t.getAttribute("data-title"));
      else if (kind === "pl") TD.flag(id, t.checked, t.getAttribute("data-title"), "pl"); else if (kind === "ms") TD.toggleSub(t.getAttribute("data-tid"), id, t.checked);
      repaint(); return;
    }
    if (t.id === "tlDate") { var td = TD.todayStr(); F.date = t.value && t.value > td ? t.value : ""; repaint(); return; }
    if (t.id === "tlTime") { F.time = TD.mins(t.value) != null ? t.value : ""; repaint(); }
  });
  document.addEventListener("input", function (e) { var t = e.target; if (!t) return; if (t.id === "tlTitle") F.title = t.value; else if (t.id === "tlWc") { wcText = t.value; wcOut(); } else if (t.id.indexOf("tlSub-") === 0) subDraft[t.id.slice(6)] = t.value; });
  /* On a compact card the add box starts as one line. Once you tap it the options stay open (a redraw would otherwise drop the focus and fold them away). */
  document.addEventListener("focusin", function (e) { var f = e.target && e.target.closest ? e.target.closest("form.tl-add") : null; if (f && !addTouched) { addTouched = true; f.classList.add("touched"); } });
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f || !f.hasAttribute) return;
    if (f.hasAttribute("data-tl-subform")) {
      e.preventDefault();
      var tid = f.getAttribute("data-tl-subform"), inp = document.getElementById("tlSub-" + tid), sv2 = inp ? inp.value : "";
      if (!sv2.trim()) { if (inp) inp.focus(); return; }
      TD.addSub(tid, sv2); delete subDraft[tid]; repaint(); setTimeout(function () { var n1 = document.getElementById("tlSub-" + tid); if (n1) n1.focus(); }, 30); return;
    }
    if (!f.hasAttribute("data-tl-form")) return;
    e.preventDefault();
    var v = (document.getElementById("tlTitle") || {}).value || ""; if (!v.trim()) { var n0 = document.getElementById("tlTitle"); if (n0) n0.focus(); return; }
    TD.add(v, F.time, F.date); F.title = ""; F.time = ""; F.date = ""; repaint();
    setTimeout(function () { var n = document.getElementById("tlTitle"); if (n) n.focus(); }, 30);
  });

  /* A page that wipes and rebuilds its whole view calls this first and the returned function last, so typing in the add box is not interrupted. */
  function grabFocus() {
    var a = document.activeElement, id = a && a.id && FOCUS_RE.test(a.id) ? a.id : null; if (!id) return null;
    var ss = null, se = null; try { ss = a.selectionStart; se = a.selectionEnd; } catch (e) {}
    return function () { var n = document.getElementById(id); if (n && TEXT_RE.test(id)) { n.focus(); try { n.setSelectionRange(ss, se); } catch (e) {} } };
  }

  var started = false;
  /* o.live: this page has no other live document, so the vacation plan may take the page's one live channel (Home).
     The Board page keeps that channel for its own document, so there the vacation plan is loaded once and not followed live. */
  function start(o) {
    if (started) return; started = true;
    if (TD && TD.on) TD.on(function (k) { if (k !== "status") repaint(); });
    if (VW && VW.open) { try { VW.onChange(repaint); VW.open({ quiet: !(o && o.live) }); } catch (e) {} }
    setInterval(function () { if (document.visibilityState === "visible") repaint(); }, 60000);
  }

  return { model: model, draw: draw, repaint: repaint, start: start, grabFocus: grabFocus, STUDY: STUDY, LOOP: LOOP, STUDY_END: STUDY_END, setFilter: function (f) { filter = f || null; repaint(); }, _form: F };
})();
