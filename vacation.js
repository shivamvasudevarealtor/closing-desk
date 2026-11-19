/* Vacation week page: Today, Board and List views over the plan in vacation-core.js. */
(function () {
  "use strict";
  var VW = window.VW, Store = window.CDStore, D = VW.DATA;
  var app = document.getElementById("app");
  var CATS = D.cats;
  var view = "today", filters = { cats: {}, status: "all", q: "" }, openMap = {};
  var headEl, updEl, bodyEl, filtEl, segEl, themeBtn;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (attrs[k] === false || attrs[k] == null) return;
      else el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pct(d, t) { return t > 0 ? Math.round(d * 100 / t) : 0; }
  function isWide() { return window.matchMedia && window.matchMedia("(min-width: 900px)").matches; }

  /* ---------- filters ---------- */
  function anyFilter() { return filters.q !== "" || filters.status !== "all" || CATS.some(function (c) { return filters.cats[c]; }); }
  function matches(s) {
    var on = CATS.filter(function (c) { return filters.cats[c]; });
    if (on.length && on.indexOf(s.cat) < 0) return false;
    if (filters.status === "done" && !s.done) return false;
    if (filters.status === "todo" && s.done) return false;
    if (filters.q) {
      var hay = (s.title + " " + s.details + " " + (s.note || "") + " " + VW.CAT_LABEL[s.cat]).toLowerCase();
      if (hay.indexOf(filters.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  /* ---------- pieces ---------- */
  function catLabel(c) { return h("span", { class: "cat c-" + c, text: VW.CAT_LABEL[c] || c }); }
  function bar(d, t, label) {
    return h("div", { class: "pbar", role: "progressbar", "aria-label": label || "Progress", "aria-valuemin": "0", "aria-valuemax": String(t), "aria-valuenow": String(d) }, [h("i", { style: "width:" + pct(d, t) + "%" })]);
  }

  /* One subtask row. Used by Today and by the Board. */
  function subRow(s) {
    var id = s.id;
    var cb = h("input", { type: "checkbox", id: "ck-" + id, "data-ck": id });
    cb.checked = !!s.done;
    var label = h("label", { class: "st-l", "for": "ck-" + id }, [
      h("span", { class: "tm num", text: VW.fmtRange(s) }),
      h("span", { class: "ti", text: s.title })
    ]);
    var meta = h("div", { class: "st-m" }, [
      catLabel(s.cat),
      h("span", { class: "pill pill-next", "data-pill": "next", hidden: true, text: "Next up" }),
      h("span", { class: "pill pill-now", "data-pill": "now", hidden: true, text: "Happening now" }),
      h("span", { class: "sdone", hidden: true })
    ]);
    var btn = h("button", { class: "ex", type: "button", "data-ex": id, "aria-expanded": "false", "aria-controls": "dt-" + id }, [
      h("span", { text: "Details" }), h("span", { class: "dot", "data-notedot": "1", hidden: true, "aria-label": "has a note", text: "•" })
    ]);
    var note = h("textarea", { class: "note-in", id: "nt-" + id, rows: "2", "data-note": id, maxlength: "2000", placeholder: "Add a note (optional)" });
    note.value = s.note || "";
    var dt = h("div", { class: "dt", id: "dt-" + id, hidden: true }, [
      s.details ? h("p", { class: "dtx", text: s.details }) : h("p", { class: "dtx muted", text: "No extra details for this one." }),
      h("label", { class: "nl", "for": "nt-" + id, text: "Note" }),
      note
    ]);
    return h("li", { class: "st" + (s.done ? " done" : ""), "data-id": id }, [h("span", { class: "ck" }, [cb]), h("div", { class: "st-b" }, [label, meta]), btn, dt]);
  }

  function dayHeadChips(p, now) {
    var kids = [];
    if (p.date === now.date) kids.push(h("span", { class: "chip", text: "Today" }));
    else if (p.date < now.date && !p.family) kids.push(h("span", { class: "chip plan", text: "Past" }));
    return kids;
  }

  /* progress block for one parent: updated in place by update() */
  function progBlock(p) {
    if (p.family) return h("p", { class: "fam-l", text: "Family day, nothing scheduled" });
    var st = VW.parentStats(VW.get(), p.id);
    return h("div", { class: "prog", "data-prog": p.id }, [
      h("div", { class: "prog-t" }, [h("b", { class: "num", "data-pt": "1", text: st.done + " of " + st.total }), h("span", { "data-po": "1", class: "od", hidden: true })]),
      bar(st.done, st.total, "Progress for " + p.title)
    ]);
  }

  /* ---------- Today ---------- */
  function renderToday() {
    var doc = VW.get(), now = VW.tzNow(), p = VW.parentOn(doc, now.date);
    bodyEl.textContent = "";
    if (!p || !VW.inRange(now.date)) {
      bodyEl.appendChild(h("div", { class: "card empty", "data-empty": "1" }, [
        h("h2", { text: "No plan for today" }),
        h("p", { class: "note", text: "Your vacation week runs " + VW.fmtDate(D.start) + " to " + VW.fmtDate(D.end).replace(/^\w+ /, "") + ". Today is " + VW.fmtDate(now.date) + ", so there is nothing planned." }),
        h("a", { class: "lnk", href: "#board", text: "Open the board" })
      ]));
      return;
    }
    var list = VW.sorted(doc, p.id), ul = h("ul", { class: "sts" });
    list.forEach(function (s) { ul.appendChild(subRow(s)); });
    bodyEl.appendChild(h("section", { class: "vwp today" + (p.family ? " family" : ""), "data-pid": p.id }, [
      h("div", { class: "vwp-top" }, [h("p", { class: "eyebrow", text: "Today · " + VW.fmtDate(p.date) }), h("span", { class: "idc", text: p.id })]),
      h("h2", { class: "vwp-t", text: p.title }),
      p.details ? h("p", { class: "note", text: p.details }) : null,
      progBlock(p),
      ul
    ]));
  }

  /* ---------- Board ---------- */
  function renderBoard() {
    var doc = VW.get(), now = VW.tzNow(), old = document.getElementById("vwb"), oldL = old ? old.scrollLeft : 0, oldT = old ? old.scrollTop : 0;
    var board = h("div", { class: "vwb", id: "vwb", tabindex: "0", role: "region", "aria-label": "Vacation week board, one column per day" });
    bodyEl.textContent = "";
    VW.parentsList(doc).forEach(function (p) {
      var all = VW.sorted(doc, p.id), shown = all.filter(matches), ul = h("ul", { class: "sts" });
      shown.forEach(function (s) { ul.appendChild(subRow(s)); });
      var head = h("div", { class: "vwc-h" }, [
        h("span", { class: "vwc-d", text: VW.fmtDate(p.date) })
      ].concat(dayHeadChips(p, now)));
      var cardKids = [
        h("div", { class: "vwp-top" }, [h("span", { class: "vwp-date num", text: VW.fmtDate(p.date) }), h("span", { class: "idc", text: p.id })]),
        h("h3", { class: "vwp-t", text: p.title }),
        p.details ? h("p", { class: "note", text: p.details }) : null,
        progBlock(p),
        ul,
        shown.length === 0 && anyFilter() ? h("p", { class: "muted none", text: "Nothing here matches the filters." }) : null
      ];
      board.appendChild(h("div", { class: "vwc", "data-date": p.date }, [head, h("section", { class: "vwp" + (p.family ? " family" : ""), "data-pid": p.id }, cardKids)]));
    });
    bodyEl.appendChild(board);
    if (old) { board.scrollLeft = oldL; board.scrollTop = oldT; }
    else {
      var tc = board.querySelector('.vwc[data-date="' + now.date + '"]');
      if (tc) board.scrollLeft = Math.max(0, tc.offsetLeft - board.offsetLeft - 4);
    }
  }

  /* ---------- List ---------- */
  function renderList() {
    var doc = VW.get(), rows = [], total = 0;
    VW.parentsList(doc).forEach(function (p) {
      VW.sorted(doc, p.id).forEach(function (s) { total++; if (matches(s)) rows.push({ p: p, s: s }); });
    });
    bodyEl.textContent = "";
    var tbody = h("tbody");
    rows.forEach(function (r) {
      var s = r.s, p = r.p;
      var cb = h("input", { type: "checkbox", id: "ck-" + s.id, "data-ck": s.id, "aria-label": "Done: " + s.title + ", " + VW.fmtDate(p.date) });
      cb.checked = !!s.done;
      var det = [s.details ? h("span", { text: s.details }) : null, s.note ? h("span", { class: "tnote", text: "Note: " + s.note }) : null];
      tbody.appendChild(h("tr", { class: "st-r" + (s.done ? " done" : "") + (p.family ? " family" : ""), "data-id": s.id }, [
        h("td", { class: "c-date num", text: VW.fmtDate(p.date) }),
        h("td", { class: "c-time num", text: VW.fmtRange(s) }),
        h("td", { class: "c-task" }, [h("span", { class: "ti", text: s.title }), p.family ? h("span", { class: "fam-s", text: " Family day, nothing scheduled" }) : null]),
        h("td", { class: "c-cat" }, [catLabel(s.cat)]),
        h("td", { class: "c-status" }, [h("label", { class: "stl", "for": "ck-" + s.id }, [cb, h("span", { class: "stt", "data-stt": "1", text: s.done ? "Done" : "To do" })])]),
        h("td", { class: "c-det" }, det)
      ]));
    });
    var table = h("table", { class: "vwt" }, [
      h("caption", { class: "sr", text: "Every subtask in the vacation week" }),
      h("thead", {}, [h("tr", {}, ["Date", "Time", "Task", "Category", "Status", "Details"].map(function (t) { return h("th", { scope: "col", text: t }); }))]),
      tbody
    ]);
    bodyEl.appendChild(h("p", { class: "count", "aria-live": "polite", text: "Showing " + rows.length + " of " + total + " subtasks" }));
    bodyEl.appendChild(h("div", { class: "vwtw", tabindex: "0", role: "region", "aria-label": "Subtask table, scrolls sideways on small screens" }, [table]));
    if (!rows.length) bodyEl.appendChild(h("p", { class: "muted none", text: "Nothing matches the filters." }));
  }

  /* ---------- header, filters, switch ---------- */
  function renderFilters() {
    filtEl.textContent = "";
    if (view === "today") { filtEl.hidden = true; return; }
    filtEl.hidden = false;
    var chips = h("div", { class: "fchips", role: "group", "aria-label": "Filter by category" });
    CATS.forEach(function (c) {
      chips.appendChild(h("button", { type: "button", class: "fchip c-" + c, "data-cat": c, "aria-pressed": filters.cats[c] ? "true" : "false" }, [h("span", { text: VW.CAT_LABEL[c] })]));
    });
    var sel = h("select", { id: "fStatus", class: "fsel", "aria-label": "Filter by status" }, [["all", "All statuses"], ["todo", "To do"], ["done", "Done"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    sel.value = filters.status;
    var q = h("input", { type: "search", id: "fQ", class: "fq", placeholder: "Search tasks, details, notes", "aria-label": "Search tasks", autocomplete: "off" });
    q.value = filters.q;
    filtEl.appendChild(chips);
    filtEl.appendChild(h("div", { class: "frow" }, [q, sel, h("button", { type: "button", class: "btn", "data-clear": "1", text: "Clear" })]));
  }
  function renderSeg() {
    $$("button", segEl).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === view ? "true" : "false"); });
  }
  function renderStatus() {
    var st = VW.status(), t = "";
    if (st === "saving") t = "Saving…";
    else if (st === "saved") t = "Saved";
    else if (st === "offline") t = VW.pending() ? "Not saved to the cloud yet. It is kept on this device." : "Offline. Showing the copy on this device.";
    updEl.textContent = t;
  }

  function render() {
    renderSeg(); renderFilters();
    if (view === "board") renderBoard(); else if (view === "list") renderList(); else renderToday();
    update(); renderStatus();
  }

  /* ---------- in-place updates (keeps focus and scroll while you tick) ---------- */
  function update() {
    var doc = VW.get(), now = VW.tzNow(), nx = view === "today" ? VW.nextUp(doc, now) : null;
    $$(".st").forEach(function (li) {
      var s = doc.subs[li.getAttribute("data-id")]; if (!s) return;
      li.classList.toggle("done", !!s.done);
      var cb = li.querySelector("input[type=checkbox]"); if (cb.checked !== !!s.done) cb.checked = !!s.done;
      var isNext = !!nx && nx.id === s.id;
      li.classList.toggle("next", isNext);
      li.querySelector('[data-pill="next"]').hidden = !isNext;
      var nowOn = view === "today" && VW.isNow(s, now) && !isNext;
      li.querySelector('[data-pill="now"]').hidden = !nowOn;
      var dn = li.querySelector(".sdone");
      dn.hidden = !(s.done && s.doneAt); dn.textContent = s.done && s.doneAt ? "Done " + VW.fmtStamp(s.doneAt) : "";
      li.querySelector("[data-notedot]").hidden = !(s.note && s.note.trim());
      var open = openMap[s.id] === true;
      li.querySelector(".dt").hidden = !open;
      li.querySelector(".ex").setAttribute("aria-expanded", open ? "true" : "false");
      var nt = li.querySelector("textarea"); if (nt !== document.activeElement && nt.value !== (s.note || "")) nt.value = s.note || "";
    });
    $$("tr.st-r").forEach(function (tr) {
      var s = doc.subs[tr.getAttribute("data-id")]; if (!s) return;
      tr.classList.toggle("done", !!s.done);
      var cb = tr.querySelector("input"); if (cb.checked !== !!s.done) cb.checked = !!s.done;
      tr.querySelector("[data-stt]").textContent = s.done ? "Done" : "To do";
    });
    $$("[data-prog]").forEach(function (el) {
      var pid = el.getAttribute("data-prog"), st = VW.parentStats(doc, pid), p = doc.parents[pid];
      el.querySelector("[data-pt]").textContent = st.done + " of " + st.total;
      var b = el.querySelector(".pbar"); b.setAttribute("aria-valuenow", String(st.done)); b.setAttribute("aria-valuemax", String(st.total)); b.firstChild.style.width = pct(st.done, st.total) + "%";
      var od = VW.overdueCount(doc, p, now), odEl = el.querySelector("[data-po]");
      odEl.hidden = od === 0; odEl.textContent = od ? od + " not done" : "";
    });
    var o = VW.overall(doc);
    var ov = headEl.querySelector("[data-ov]"); if (ov) ov.textContent = o.done + " of " + o.total + " done";
    var ob = headEl.querySelector(".pbar"); if (ob) { ob.setAttribute("aria-valuenow", String(o.done)); ob.setAttribute("aria-valuemax", String(o.total)); ob.firstChild.style.width = pct(o.done, o.total) + "%"; }
  }

  /* ---------- events ---------- */
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches && t.matches("input[data-ck]")) { VW.toggle(t.getAttribute("data-ck"), t.checked); return; }
    if (t.id === "fStatus") { filters.status = t.value; render(); }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches && t.matches("textarea[data-note]")) { VW.setNote(t.getAttribute("data-note"), t.value); var li = t.closest(".st"); if (li) li.querySelector("[data-notedot]").hidden = !t.value.trim(); return; }
    if (t.id === "fQ") { filters.q = t.value.trim(); var pos = t.selectionStart; render(); var n = document.getElementById("fQ"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-ex],[data-cat],[data-clear],[data-v],[data-seed]") : null;
    if (!t) return;
    if (t.hasAttribute("data-ex")) {
      var id = t.getAttribute("data-ex"), cur = t.getAttribute("aria-expanded") === "true";
      openMap[id] = !cur; update();
    } else if (t.hasAttribute("data-cat")) {
      var c = t.getAttribute("data-cat"); filters.cats[c] = !filters.cats[c]; render();
      var again = document.querySelector('[data-cat="' + c + '"]'); if (again) again.focus();
    } else if (t.hasAttribute("data-clear")) {
      filters = { cats: {}, status: "all", q: "" }; render();
    } else if (t.hasAttribute("data-v")) {
      go(t.getAttribute("data-v"));
    } else if (t.hasAttribute("data-seed")) {
      var added = VW.rerunSeed(), msg = document.getElementById("seedMsg");
      var n = Object.keys(VW.get().subs).length;
      if (msg) msg.textContent = added === 0 ? "Nothing to add. All " + n + " subtasks are already here, and your ticks and notes are untouched." : "Added " + added + " missing items. Your ticks and notes are untouched.";
      render();
    }
  });
  function go(v) {
    if (v !== "today" && v !== "board" && v !== "list") v = "today";
    if (location.hash !== "#" + v) { try { history.replaceState(null, "", "#" + v); } catch (x) { location.hash = v; } }
    view = v; render();
  }
  window.addEventListener("hashchange", function () { var v = location.hash.replace("#", ""); if (v !== view && (v === "today" || v === "board" || v === "list")) { view = v; render(); } });
  setInterval(function () { if (document.visibilityState === "visible") update(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") update(); });
  VW.onChange(function (kind) {
    if (kind === "status") { renderStatus(); return; }
    update();
  });

  /* ---------- chrome ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("cd.theme", t); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#F3F6FB" : "#0B1220");
    if (themeBtn) themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
  }
  function build() {
    var strip = h("div", { class: "strip" }, [
      h("span", { class: "logo", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/><path d="M9 15l2.2 2.2L15 12.8"/></svg>' }),
      h("span", { class: "brand", text: "Closing Desk" }),
      h("span", { class: "sp" }),
      h("button", { class: "ib", id: "themeBtn", type: "button", "aria-label": "Switch to light mode", html: '<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' })
    ]);
    app.parentNode.insertBefore(strip, app);
    themeBtn = document.getElementById("themeBtn");
    themeBtn.addEventListener("click", function () { setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"); });
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

    updEl = h("p", { class: "upd", "aria-live": "polite" });
    segEl = h("div", { class: "vw-seg", role: "group", "aria-label": "View" }, [["today", "Today"], ["board", "Board"], ["list", "List"]].map(function (v) {
      return h("button", { type: "button", "data-v": v[0], "aria-pressed": "false", text: v[1] });
    }));
    headEl = h("header", { class: "vw-head" }, [
      h("div", { class: "vw-ht" }, [
        h("p", { class: "eyebrow", text: "Nov 18 to 29, 2026 · " + D.label }),
        h("h1", { text: "Vacation week" }),
        h("div", { class: "ov" }, [h("b", { class: "num", "data-ov": "1" }), h("span", { class: "muted", text: "Family day not counted" })]),
        bar(0, 1, "Whole week progress"),
        updEl
      ]),
      segEl
    ]);
    filtEl = h("section", { class: "vw-filters", "aria-label": "Filters" });
    bodyEl = h("div", { id: "vwBody" });
    var foot = h("footer", { class: "vw-foot" }, [
      h("p", { class: "fine", text: "Times are Edmonton time (America/Edmonton). Plan entered by Shivam. Your ticks and notes are saved to your Closing Desk account." }),
      h("p", { class: "fine" }, [h("button", { type: "button", class: "lk", "data-seed": "1", text: "Check the plan data" }), h("span", { id: "seedMsg", "aria-live": "polite" })])
    ]);
    app.appendChild(h("div", { class: "wrap" }, [headEl, filtEl, bodyEl, foot]));
  }

  /* ---------- start ---------- */
  function toLogin() { try { window.location.replace("./"); } catch (e) {} }
  build();
  var hv = location.hash.replace("#", "");
  view = hv === "today" || hv === "board" || hv === "list" ? hv : (isWide() ? "board" : "today");
  VW.get(); render();
  if (!Store || !Store.configured()) { toLogin(); return; }
  Store.getSession().then(function (sess) {
    if (!sess) { toLogin(); return; }
    VW.open().then(function () { render(); });
  }, function () {});
  Store.onAuth(function (ev, sess) { if (ev === "SIGNED_OUT" || (!sess && ev !== "INITIAL_SESSION")) setTimeout(toLogin, 0); });
})();
