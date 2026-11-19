/* Home: what is next, who to reach, what must get done.
   Reads your contacts, your calendar, your tasks and Claude's tasks. The only things it saves are the ones you tap:
   a call outcome (Talked / Messaged / No answer / Later), a task tick, or a task you add. */
(function () {
  "use strict";
  var Store = window.CDStore, CRM = window.CRM, TD = window.TDAY, Stats = window.CDStats, DAY = window.CDDay;
  var OWNER = "Shivam", TZ = "America/Edmonton", CACHE = "cd.home1", SHOW_REACH = 5, SHOW_DAY = 6, SHOW_MUST = 5;
  var app = document.getElementById("app");

  /* ---------- helpers ---------- */
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
  var IC = {
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.6-.3 4.4 1.2 5 4.3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.4 4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 4 1.4v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7 2 2 0 0 1 6.6 3.5z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4.2A8 8 0 1 1 8.4 19z"/><path d="M9.2 9.2c.3 2.4 2.6 4.6 5 5l1.2-1.2-1.8-.9-.9.7a4 4 0 0 1-1.7-1.7l.7-.9-.9-1.8z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5 12 13l8.5-5.5"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h11V10"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
    sun: '<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    logo: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/><path d="M9 15l2.2 2.2L15 12.8"/></svg>'
  };
  function ico(name, cls) { var s = h("span", { class: cls || "", "aria-hidden": "true" }); s.innerHTML = IC[name]; return s; }
  function n(x) { return Number(x).toLocaleString("en-CA"); }
  function pad(x) { return ("0" + x).slice(-2); }
  function edmParts() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date()).reduce(function (a, p) { a[p.type] = p.value; return a; }, {});
    } catch (e) { var d = new Date(); return { year: d.getFullYear(), month: pad(d.getMonth() + 1), day: pad(d.getDate()), hour: pad(d.getHours()), minute: pad(d.getMinutes()) }; }
  }
  function edmToday() { var p = edmParts(); return p.year + "-" + p.month + "-" + p.day; }
  function greeting() { var hr = (+edmParts().hour) % 24; return (hr >= 4 && hr < 12 ? "Good morning" : hr >= 12 && hr < 17 ? "Good afternoon" : "Good evening") + ", " + OWNER; }
  function clock(ms) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms)).replace(/\./g, "").toUpperCase(); } catch (e) { return ""; } }
  function fdate(s) { var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }); }
  function pct(x, total) { return total > 0 ? Math.min(100, Math.round(x * 100 / total)) : 0; }
  function fill(x, total) { var p = pct(x, Math.max(total, 1)); return x > 0 && p < 2 ? 2 : p; }

  /* ---------- state ---------- */
  var S = { contacts: null, rows: [], dueN: 0, deals: null, stats: null, goals: null, posts: [], main: null, plan: [], vw: null,
    live: false, status: "load", at: null, openId: null, busy: false, undo: null, saved: false, loadedAt: 0 };
  var els = {}, toastTimer = null, raf = 0;

  function derive() {
    var td = CRM.today();
    var due = CRM.dueList(S.contacts, td);
    S.rows = due; S.dueN = due.length;
    S.stats = Stats.compute(S.contacts, td);
    S.deals = CRM.deals(S.contacts);
    var st = S.settings || {}, year = Number(st.goalYear) || 2027;
    function deals(type) { return (st.deals || []).filter(function (d) { return d && d.type === type && String(d.date || "").slice(0, 4) === String(year); }).length; }
    S.goals = { year: year, lg: st.listingsGoal == null ? 20 : Math.max(0, Number(st.listingsGoal) || 0), bg: st.buyersGoal == null ? 30 : Math.max(0, Number(st.buyersGoal) || 0), l: deals("listing"), b: deals("buyer") };
  }
  function derivePlan() {
    S.plan = DAY.plan(S.main, edmToday());
    var list = S.main && Array.isArray(S.main.content) ? S.main.content : [];
    var td = edmToday();
    S.posts = list.filter(function (p) { return p && p.date && p.date >= td; }).sort(function (a, b) { return (a.date + (a.time || "99")) < (b.date + (b.time || "99")) ? -1 : 1; }).slice(0, 3)
      .map(function (p) { return { date: p.date, time: p.time || "", kind: p.kind || "", title: p.title || p.kind || "Post" }; });
  }

  /* ---------- saved copy, so Home opens instantly and still reads offline ---------- */
  function light(c) { return { id: c.id, first: c.first, last: c.last, phone: c.phone, email: c.email, temp: c.temp, stage: c.stage, next: c.next, kind: c.kind }; }
  function saveCache() {
    try {
      localStorage.setItem(CACHE, JSON.stringify({ td: CRM.today(), at: S.at, rows: S.rows.slice(0, 12).map(light), dueN: S.dueN, deals: S.deals, stats: S.stats, goals: S.goals, posts: S.posts, plan: S.plan, planTd: edmToday() }));
    } catch (e) {}
  }
  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE) || "null");
      if (!c || c.td !== CRM.today()) return;
      S.rows = c.rows || []; S.dueN = c.dueN || 0; S.deals = c.deals; S.stats = c.stats; S.goals = c.goals; S.posts = c.posts || []; S.at = c.at; S.saved = true;
      if (c.planTd === edmToday()) S.plan = c.plan || [];
    } catch (e) {}
  }

  /* ---------- the next thing ---------- */
  function who(c) { return CRM.nm(c); }
  function pickNext(M) {
    var it = null, i;
    for (i = 0; i < M.items.length; i++) if (M.items[i].now) { it = M.items[i]; break; }
    if (it) return { mode: "now", eye: "Happening now", title: it.title, meta: [TD.range(it.start, it.end), it.loc].filter(Boolean).join(" · "), cta: "tasks" };
    if (M.next) {
      it = M.next; var d = it.min - M.nm;
      var when = d <= 0 ? "Starting now" : d < 60 ? "Next up · in " + d + " min" : "Next up · " + TD.fmt12(it.start);
      return { mode: "next", eye: when, title: it.title, meta: it.src === "cal" ? [TD.range(it.start, it.end), it.loc].filter(Boolean).join(" · ") : "Your task · " + TD.fmt12(it.start), cta: it.src === "me" ? "done" : "tasks", id: it.id };
    }
    var open = M.todo.filter(function (x) { return !x.done; })[0];
    if (open) {
      var eye = open.carried ? "Still open from " + fdate(open.carried) : open.src === "cl" ? (open.state === "doing" ? "You are on this" : "Do this next") : "On your list";
      return { mode: "task", eye: eye, title: open.title, meta: open.src === "cl" ? "From Claude" + (open.mins ? " · about " + open.mins + " min" : "") : "Your task", cta: open.src === "cl" ? (S.rows.length && /warmest|call or whatsapp/i.test(open.title) ? "list" : "board") : "done", id: open.id };
    }
    if (S.rows.length) {
      var c = S.rows[0];
      return { mode: "reach", eye: "Reach out", title: who(c), meta: [c.temp ? c.temp.charAt(0).toUpperCase() + c.temp.slice(1) : "", CRM.dueText(c, CRM.today())].filter(Boolean).join(" · "), cta: "call", c: c };
    }
    return { mode: "clear", eye: "All clear", title: "You are caught up for today", meta: "Nothing due, nothing scheduled.", cta: "tasks" };
  }

  /* ---------- sections ---------- */
  function renderTop() {
    els.top.textContent = "";
    els.top.appendChild(h("span", { class: "hm-logo logo", "aria-hidden": "true", html: IC.logo }));
    els.top.appendChild(h("span", { class: "hm-brand", text: "Realtor OS" }));
    var tools = h("div", { class: "hm-tools" });
    var rf = h("button", { class: "hm-ib", id: "hmRefresh", type: "button", "aria-label": "Refresh" }); rf.innerHTML = IC.refresh; if (S.busy) rf.classList.add("spin");
    var th = h("button", { class: "hm-ib", id: "hmTheme", type: "button", "aria-label": document.documentElement.getAttribute("data-theme") === "light" ? "Switch to dark mode" : "Switch to light mode" }); th.innerHTML = IC.sun;
    var st = h("a", { class: "hm-ib more-gear", href: "index.html#more", "aria-label": "Settings" }); st.innerHTML = IC.gear;
    [rf, th, st].forEach(function (b) { tools.appendChild(b); });
    els.top.appendChild(tools);
  }
  function renderHello(M) {
    els.hello.textContent = "";
    els.hello.appendChild(h("p", { class: "hm-date", text: TD.dateLabel(M.td, { weekday: "long", month: "long", day: "numeric" }) }));
    els.hello.appendChild(h("h1", { text: greeting() }));
    var upd = S.status === "err" ? (S.at ? "Saved copy from " + clock(S.at) + ". Can't reach Realtor OS right now." : "Can't reach Realtor OS right now.")
      : S.saved ? (S.at ? "Saved copy from " + clock(S.at) + " · updating…" : "Updating…") : S.at ? "Updated " + clock(S.at) : "Loading…";
    els.hello.appendChild(h("p", { class: "hm-upd", text: upd }));
  }
  function renderWarn() {
    els.alert.textContent = "";
    if (S.status === "err") {
      var w = h("div", { class: "hm-warn", role: "alert" }, [h("span", { text: S.at ? "Offline. You are looking at your last saved copy." : "Can't reach your data right now." }), h("button", { type: "button", id: "hmRetry", text: "Try again" })]);
      els.alert.appendChild(w);
    }
  }
  function renderGlance(M) {
    els.glance.textContent = "";
    var calEmpty = !M.connected, evN = M.counts.cal;
    var t1 = h("a", { class: "hm-g cal" + (calEmpty ? " empty" : ""), href: "tasks.html#today" }, [
      h("span", { class: "hm-gi", html: IC.cal }), h("span", { class: "hm-gn tn", text: calEmpty ? "–" : String(evN) }), h("span", { class: "hm-gl", text: calEmpty ? "Connect calendar" : (evN === 1 ? "event today" : "events today") })
    ]);
    var t2 = h("a", { class: "hm-g todo", href: "tasks.html#today" }, [
      h("span", { class: "hm-gi", html: IC.check }), h("span", { class: "hm-gn tn" }, [String(M.done), h("small", { text: "/" + M.total })]), h("span", { class: "hm-gl", text: M.total ? "tasks done" : "no tasks yet" })
    ]);
    var t3 = h("a", { class: "hm-g reach", href: "#hmReach" }, [
      h("span", { class: "hm-gi", html: IC.people }), h("span", { class: "hm-gn tn", text: n(S.dueN) }), h("span", { class: "hm-gl", text: S.dueN === 1 ? "person to reach" : "people to reach" })
    ]);
    [t1, t2, t3].forEach(function (t) { els.glance.appendChild(t); });
  }
  function renderNext(M) {
    var x = pickNext(M);
    els.next.className = "hm-next " + x.mode;
    els.next.textContent = "";
    els.next.appendChild(h("span", { class: "hm-eye" }, [h("i"), x.eye]));
    els.next.appendChild(h("p", { class: "hm-nt", text: x.title }));
    if (x.meta) els.next.appendChild(h("p", { class: "hm-nm", text: x.meta }));
    var cta = h("div", { class: "hm-cta" });
    if (x.cta === "call") {
      if (x.c.phone) cta.appendChild(h("a", { class: "hm-btn pri", href: CRM.telUrl(x.c), "data-act": "call", "data-id": x.c.id }, [ico("phone"), "Call"]));
      if (x.c.phone) cta.appendChild(h("a", { class: "hm-btn", href: CRM.waUrl(x.c), target: "_blank", rel: "noopener", "data-act": "wa", "data-id": x.c.id }, [ico("wa"), "WhatsApp"]));
      if (!x.c.phone) cta.appendChild(h("a", { class: "hm-btn pri", href: "#hmReach" }, ["See who is due"]));
    } else if (x.cta === "done") {
      cta.appendChild(h("button", { class: "hm-btn pri", type: "button", "data-done": x.id }, [ico("check"), "Mark done"]));
      cta.appendChild(h("a", { class: "hm-btn ghost", href: "tasks.html#today" }, ["Open Tasks"]));
    } else if (x.cta === "list") {
      cta.appendChild(h("a", { class: "hm-btn pri", href: "#hmReach" }, ["See who to call", ico("go")]));
    } else if (x.cta === "board") {
      cta.appendChild(h("a", { class: "hm-btn pri", href: "tasks.html#board" }, ["Open on the Board", ico("go")]));
    } else {
      cta.appendChild(h("a", { class: "hm-btn " + (x.mode === "clear" ? "ghost" : "pri"), href: "tasks.html#today" }, [x.mode === "clear" ? "Plan something" : "Open today", ico("go")]));
    }
    els.next.appendChild(cta);
  }
  function renderVac() {
    els.vac.textContent = "";
    if (!window.VW || !S.vw) { els.vac.hidden = true; return; }
    var V = window.VW, sm;
    try { sm = V.todaySummary(S.vw, V.tzNow()); } catch (e) { els.vac.hidden = true; return; }
    if (!sm || sm.kind === "none") { els.vac.hidden = true; return; }
    els.vac.hidden = false; els.vac.href = "vacation.html#today";
    els.vac.appendChild(h("span", { class: "hm-vk", text: "Vacation week · today" }));
    if (sm.kind === "family") { els.vac.appendChild(h("span", { class: "hm-vt", text: "Family day, nothing scheduled" })); return; }
    els.vac.appendChild(h("span", { class: "hm-vt", text: sm.title }));
    els.vac.appendChild(h("span", { class: "hm-vn tn", text: sm.done + " of " + sm.total }));
    els.vac.appendChild(h("span", { class: "hm-vb", "aria-hidden": "true" }, [h("i", { style: "width:" + fill(sm.done, sm.total) + "%" })]));
    if (sm.next) els.vac.appendChild(h("p", { class: "hm-vx" }, [h("b", { text: "Next · " }), V.fmtRange(sm.next) + " · " + sm.next.title]));
  }

  function cardHead(cls, icon, title, count, hot, href, linkText) {
    var head = h("div", { class: "hm-ch" }, [h("h2", {}, [h("span", { class: "hm-ci " + cls, html: IC[icon] }), title])]);
    if (count != null) head.firstChild.appendChild(h("span", { class: "hm-cn tn" + (hot ? " hot" : ""), text: String(count) }));
    if (href) { var a = h("a", { class: "hm-more", href: href }, [linkText || "See all"]); a.appendChild(ico("go")); a.lastChild.innerHTML = IC.go; head.appendChild(a); }
    return head;
  }

  function personRow(c) {
    var td = CRM.today(), open = S.openId === c.id;
    var li = h("li", { class: "hm-p" + (open ? " open" : ""), "data-id": c.id });
    li.appendChild(h("span", { class: "hm-av t" + CRM.tone(c), "aria-hidden": "true", text: CRM.initials(c) }));
    var late = c.next && c.next < td;
    var meta = h("span", { class: "hm-pm" }, [
      c.temp ? h("i", { class: "hm-td " + c.temp, "aria-hidden": "true" }) : null,
      c.temp ? h("span", { text: c.temp.charAt(0).toUpperCase() + c.temp.slice(1) }) : null,
      c.temp ? h("span", { class: "sep", "aria-hidden": "true", text: "·" }) : null,
      h("span", { class: late ? "late" : "due", text: CRM.dueText(c, td) })
    ]);
    li.appendChild(h("button", { class: "hm-pt", type: "button", "data-toggle": c.id, "aria-expanded": open ? "true" : "false", "aria-label": "Log what happened with " + who(c) }, [h("span", { class: "hm-pn", text: who(c) }), meta]));
    var acts = h("div", { class: "hm-pa" });
    if (c.phone) {
      acts.appendChild(h("a", { class: "hm-ab call", href: CRM.telUrl(c), "aria-label": "Call " + who(c), "data-act": "call", "data-id": c.id, html: IC.phone }));
      acts.appendChild(h("a", { class: "hm-ab wa", href: CRM.waUrl(c), target: "_blank", rel: "noopener", "aria-label": "WhatsApp " + who(c), "data-act": "wa", "data-id": c.id, html: IC.wa }));
    } else if (c.email) {
      acts.appendChild(h("a", { class: "hm-ab sms", href: "mailto:" + c.email, "aria-label": "Email " + who(c), "data-act": "mail", "data-id": c.id, html: IC.mail }));
    }
    li.appendChild(acts);
    if (open) {
      var full = S.live && S.contacts ? S.contacts.filter(function (x) { return x.id === c.id; })[0] : null;
      var out = h("div", { class: "hm-out", role: "group", "aria-label": "What happened with " + who(c) });
      [["talked", "Talked", true], ["messaged", "Messaged"], ["noanswer", "No answer"], ["later", "Later"]].forEach(function (b) {
        out.appendChild(h("button", { class: "hm-ob" + (b[2] ? " main" : ""), type: "button", "data-out": b[0], "data-id": c.id, disabled: !full, text: b[1] }));
      });
      li.appendChild(out);
      if (full) {
        var t = CRM.touchFields(full, "talked", td).next, na = CRM.touchFields(full, "noanswer", td).next;
        li.appendChild(h("p", { class: "hm-outn", text: "Talked → next " + fdate(t) + " · No answer → " + fdate(na) + " · Later → " + fdate(CRM.laterFields(td).next) }));
      } else li.appendChild(h("p", { class: "hm-outn", text: "Updating your list. Buttons turn on in a moment." }));
    }
    return li;
  }
  function renderReach() {
    var el = els.reach; el.textContent = "";
    var rows = S.rows.slice(0, SHOW_REACH);
    el.appendChild(cardHead("reach", "people", "Reach out", S.dueN || null, false, "index.html#today", S.dueN > SHOW_REACH ? "See all " + n(S.dueN) : "Open Clients"));
    if (S.status === "load" && !rows.length) { el.appendChild(h("div", { class: "hm-sk" }, [h("i", { style: "width:70%" }), h("i", { style: "width:90%" }), h("i", { style: "width:55%" })])); return; }
    if (!rows.length) {
      el.appendChild(h("div", { class: "hm-empty" }, [h("p", {}, [h("b", { text: "Everyone is up to date." }), " No follow-ups are due today."]), h("a", { class: "hm-btn", href: "index.html#today" }, ["Open Clients"])]));
      return;
    }
    var ul = h("ul", { class: "hm-list" });
    rows.forEach(function (c) { ul.appendChild(personRow(c)); });
    el.appendChild(ul);
    if (S.dueN > rows.length) {
      var f = h("a", { class: "hm-foot", href: "index.html#today" }, [h("span", { text: n(S.dueN - rows.length) + " more due today" })]); f.appendChild(ico("go")); f.lastChild.innerHTML = IC.go; el.appendChild(f);
    }
  }

  function dayRow(it) {
    var parts = TD.fmt12(it.start).split(" ");
    var cls = "hm-t " + it.src + (it.now ? " now" : "") + (it.past ? " past" : "") + (it.done ? " done" : "");
    var li = h("li", { class: cls });
    li.appendChild(h("div", { class: "hm-tt tn" }, [h("b", { text: parts[0] }), h("span", { text: parts[1] || "" })]));
    var body = h("div", { class: "hm-tb" }, [h("span", { class: "hm-tn" }, [it.title, it.now ? h("span", { class: "hm-pill", text: "Now" }) : null]), (it.src === "cal" && (it.end || it.loc)) ? h("span", { class: "hm-tm", text: [it.end ? "until " + TD.fmt12(it.end) : "", it.loc].filter(Boolean).join(" · ") }) : (it.src === "me" ? h("span", { class: "hm-tm", text: "Your task" }) : null)]);
    li.appendChild(body);
    if (it.src === "me") {
      var id = "dk-" + it.id, cb = h("input", { type: "checkbox", id: id, "data-tk": it.id, "aria-label": it.title }); cb.checked = !!it.done;
      li.style.gridTemplateColumns = "58px minmax(0,1fr) 40px";
      li.appendChild(h("span", { class: "hm-mc" }, [cb, h("span", { class: "hm-box", html: IC.check })]));
    }
    return li;
  }
  function renderDay(M) {
    var el = els.day; el.textContent = "";
    var timed = M.sched.filter(function (it) { return !it.allDay; }), allday = M.sched.filter(function (it) { return it.allDay; });
    el.appendChild(cardHead("day", "cal", "My day", timed.length + allday.length || null, false, "tasks.html#today", "Open Tasks"));
    if (allday.length) el.appendChild(h("div", { class: "hm-allday" }, allday.map(function (a) { return h("span", { class: "hm-chip", text: a.title + " · all day" }); })));
    if (!timed.length) {
      var kids = [];
      if (!M.connected) kids.push(h("p", {}, [h("b", { text: "Bring in your calendar." }), " Events from Apple Calendar show here, next to your tasks."]), h("a", { class: "hm-btn pri", href: "tasks.html#today" }, ["Connect Apple Calendar", ico("go")]));
      else kids.push(h("p", {}, [h("b", { text: "Nothing scheduled today." }), M.calState === "err" ? " Could not refresh your calendar just now." : ""]));
      el.appendChild(h("div", { class: "hm-empty" }, kids));
      return;
    }
    var ul = h("ul", { class: "hm-list" });
    timed.slice(0, SHOW_DAY).forEach(function (it) { ul.appendChild(dayRow(it)); });
    el.appendChild(ul);
    if (timed.length > SHOW_DAY) { var f = h("a", { class: "hm-foot", href: "tasks.html#today" }, [h("span", { text: (timed.length - SHOW_DAY) + " more today" })]); f.appendChild(ico("go")); f.lastChild.innerHTML = IC.go; el.appendChild(f); }
  }

  function mustRow(it) {
    if (it.src === "cl") {
      var a = h("a", { class: "hm-m ai" + (it.done ? " done" : ""), href: "tasks.html#board" });
      a.appendChild(h("span", { class: "hm-mc " + (it.done ? "ok" : "ai"), html: it.done ? IC.check : IC.spark }));
      a.appendChild(h("span", { class: "hm-mb" }, [h("span", { class: "hm-mt", text: it.title }), h("span", { class: "hm-mm" }, [h("span", { class: "hm-tag ai", text: "Claude" }), it.done ? "Done" : it.state === "doing" ? "Doing now" : (it.mins ? "About " + it.mins + " min" : "To do")])]));
      a.appendChild(h("span", { class: "hm-go", html: IC.go }));
      return h("li", {}, [a]);
    }
    var id = "mk-" + it.id, cb = h("input", { type: "checkbox", id: id, "data-tk": it.id, "aria-label": it.title }); cb.checked = !!it.done;
    var li = h("li", { class: "hm-m me" + (it.done ? " done" : "") });
    li.appendChild(h("span", { class: "hm-mc" }, [cb, h("span", { class: "hm-box", html: IC.check })]));
    li.appendChild(h("label", { class: "hm-mb", "for": id }, [h("span", { class: "hm-mt", text: it.title }), h("span", { class: "hm-mm" }, [it.carried ? h("span", { class: "hm-tag late", text: "From " + fdate(it.carried) }) : h("span", { class: "hm-tag me", text: "Mine" })])]));
    return li;
  }
  function renderMust(M) {
    var el = els.mustList; el.textContent = "";
    var open = M.todo.filter(function (x) { return !x.done; }), done = M.todo.filter(function (x) { return x.done; });
    var list = open.concat(done);
    els.mustHead.textContent = "";
    els.mustHead.appendChild(cardHead("must", "flag", "Must work on", open.length || null, M.todo.some(function (x) { return x.carried && !x.done; }), "tasks.html#today", "Open Tasks"));
    if (!list.length) {
      el.appendChild(h("div", { class: "hm-empty" }, [h("p", {}, [h("b", { text: "Nothing on your list." }), " Add what must happen today, below."])]));
      return;
    }
    var ul = h("ul", { class: "hm-list" });
    list.slice(0, SHOW_MUST).forEach(function (it) { ul.appendChild(mustRow(it)); });
    el.appendChild(ul);
    if (list.length > SHOW_MUST) { var f = h("a", { class: "hm-foot", href: "tasks.html#today" }, [h("span", { text: (list.length - SHOW_MUST) + " more in Tasks" })]); f.appendChild(ico("go")); f.lastChild.innerHTML = IC.go; el.appendChild(f); }
  }
  function renderDeals() {
    var el = els.deals; el.textContent = "";
    el.appendChild(cardHead("deal", "home", "Deals in motion", null, false, "index.html#pipeline", "Open Pipeline"));
    var d = S.deals;
    if (!d) { el.appendChild(h("div", { class: "hm-sk" }, [h("i", { style: "width:60%" })])); return; }
    var g = h("div", { class: "hm-deals" });
    [["under", "Under contract"], ["listed", "Listed"], ["consult", "Listing consults"], ["searching", "Buyers searching"]].forEach(function (x) {
      g.appendChild(h("a", { class: "hm-d" + (d[x[0]] ? "" : " zero"), href: "index.html#pipeline" }, [h("span", { class: "hm-dn tn", text: String(d[x[0]]) }), h("span", { class: "hm-dl", text: x[1] })]));
    });
    el.appendChild(g);
  }
  function bar(label, text, x, total) { return h("div", { class: "hm-bar" }, [h("div", { class: "hm-bl" }, [h("span", { text: label }), h("b", { class: "tn", text: text })]), h("div", { class: "hm-tr", "aria-hidden": "true" }, [h("i", { style: "width:" + fill(x, total) + "%" })])]); }
  function renderProg() {
    var el = els.prog; if (!S.stats || !S.goals) { el.hidden = true; return; }
    el.hidden = false;
    var s = S.stats, g = S.goals, td = edmToday(), body = h("div", { class: "hm-pbody" });
    body.appendChild(bar("Contacts reached at least once", n(s.reached) + " of " + n(s.contacts), s.reached, s.contacts));
    body.appendChild(bar(g.year + " listings goal", g.l + " of " + g.lg, g.l, g.lg));
    body.appendChild(bar(g.year + " buyers goal", g.b + " of " + g.bg, g.b, g.bg));
    if (S.posts.length) body.appendChild(h("p", { class: "hm-fine" }, [h("b", { text: "Posts scheduled: " }), S.posts.map(function (p) { return fdate(p.date) + (p.time ? " " + TD.fmt12(p.time) : "") + " " + p.title; }).join(" · ")]));
    var sum = h("summary", {}, ["Progress", h("span", { class: "hint tn", text: n(s.reached) + " of " + n(s.contacts) + " reached" })]);
    var chev = h("span", { html: IC.go }); sum.appendChild(chev.firstChild);
    var wasOpen = el.open; el.textContent = ""; el.appendChild(sum); el.appendChild(body); if (wasOpen) el.open = true;
  }

  function renderAll() {
    raf = 0;
    var M = TD.model(S.plan);
    renderTop(); renderHello(M); renderWarn(); renderGlance(M); renderNext(M); renderVac();
    renderReach(); renderDay(M); renderMust(M); renderDeals(); renderProg();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(renderAll); }

  /* ---------- toast with undo ---------- */
  function toast(msg, undo) {
    clearTimeout(toastTimer);
    els.toast.textContent = ""; els.toast.hidden = false;
    els.toast.appendChild(h("span", { text: msg }));
    if (undo) { var b = h("button", { type: "button", text: "Undo" }); b.addEventListener("click", function () { hideToast(); undo(); }); els.toast.appendChild(b); }
    toastTimer = setTimeout(hideToast, undo ? 7000 : 3500);
  }
  function hideToast() { els.toast.hidden = true; els.toast.textContent = ""; }

  /* ---------- actions ---------- */
  function findContact(id) { return (S.contacts || []).filter(function (c) { return c.id === id; })[0]; }
  function replaceContact(id, fields) {
    var i = (S.contacts || []).findIndex(function (c) { return c.id === id; });
    if (i >= 0) S.contacts[i] = Object.assign({}, S.contacts[i], fields);
    derive(); saveCache(); schedule();
  }
  function logOutcome(id, kind) {
    var c = findContact(id); if (!c || !S.live) return;
    var td = CRM.today(), f = kind === "later" ? CRM.laterFields(td) : CRM.touchFields(c, kind, td); if (!f) return;
    var prev = CRM.undoFields(c, f), name = who(c);
    S.openId = null; replaceContact(id, f);
    var label = { talked: "Talked", messaged: "Messaged", noanswer: "No answer", later: "Moved to next week" }[kind];
    function revert() { replaceContact(id, prev); Store.patch(id, prev).then(function () {}, function () { toast("Could not undo. Check your connection.", null); }); }
    toast(name + ": " + label + ". Next " + fdate(f.next) + ".", revert);
    Store.patch(id, f).then(function () {}, function () { replaceContact(id, prev); toast("Could not save that. Nothing was changed.", null); });
  }

  /* ---------- data ---------- */
  function spin(on) { S.busy = on; var b = document.getElementById("hmRefresh"); if (b) b.classList.toggle("spin", on); }
  function vwLoad() { if (!window.VW || !window.VW.peek) return; try { window.VW.peek(function (doc) { S.vw = doc; schedule(); }); } catch (e) {} }
  function load() {
    if (S.busy || !Store) return;
    spin(true);
    Promise.all([
      Store.loadAll(),
      Store.getOsDoc("main").then(function (d) { return { ok: true, d: d }; }, function () { return { ok: false }; })
    ]).then(function (r) {
      var res = r[0]; S.contacts = res.contacts || []; S.settings = res.settings || {};
      if (r[1].ok) S.main = r[1].d || null;
      S.live = true; S.status = "ok"; S.saved = false; S.at = Date.now(); S.loadedAt = Date.now();
      derive(); derivePlan(); saveCache(); spin(false); renderAll(); vwLoad();
    }, function () { S.status = "err"; spin(false); renderAll(); });
  }

  /* ---------- page ---------- */
  function build() {
    ["top:header", "hello:section", "alert:div", "glance:section", "next:section", "vac:a", "cols:div"].forEach(function (d) { var p = d.split(":"); els[p[0]] = h(p[1], { class: "hm-" + p[0] }); });
    els.top.className = "hm-top"; els.glance.className = "hm-glance"; els.glance.setAttribute("aria-label", "Your day at a glance");
    els.next.setAttribute("aria-label", "Next up"); els.vac.className = "hm-vac"; els.vac.hidden = true;
    els.reach = h("section", { class: "hm-card", id: "hmReach", "aria-label": "Reach out" });
    els.day = h("section", { class: "hm-card", id: "hmDay", "aria-label": "My day" });
    els.mustHead = h("div"); els.mustList = h("div");
    els.addForm = h("form", { class: "hm-add", novalidate: true }, [
      h("label", { class: "sr", "for": "hmAdd", text: "Add a task for today" }),
      h("input", { id: "hmAdd", type: "text", maxlength: "200", autocomplete: "off", placeholder: "Add a task for today" }),
      h("button", { class: "hm-btn pri", type: "submit", "aria-label": "Add task" }, [ico("plus"), "Add"])
    ]);
    els.must = h("section", { class: "hm-card", id: "hmMust", "aria-label": "Must work on" }, [els.mustHead, els.mustList, els.addForm]);
    els.deals = h("section", { class: "hm-card", "aria-label": "Deals in motion" });
    els.prog = h("details", { class: "hm-prog" });
    els.toast = h("div", { class: "hm-toast", role: "status", hidden: true });
    var left = h("div", { class: "hm-col" }, [els.reach]), right = h("div", { class: "hm-col" }, [els.day, els.must]);
    els.cols.className = "hm-cols"; els.cols.appendChild(left); els.cols.appendChild(right);
    [els.top, els.hello, els.alert, els.glance, els.next, els.vac, els.cols, els.deals, els.prog].forEach(function (e) { app.appendChild(e); });
    document.body.appendChild(els.toast);
  }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("cd.theme", t); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#F5F3EE" : "#0A0D14");
    var b = document.getElementById("hmTheme"); if (b) b.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
  }

  document.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var b;
    if ((b = t.closest("#hmRefresh"))) { load(); TD.refresh(true); return; }
    if ((b = t.closest("#hmRetry"))) { load(); return; }
    if ((b = t.closest("#hmTheme"))) { setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"); return; }
    if ((b = t.closest("[data-out]"))) { logOutcome(b.getAttribute("data-id"), b.getAttribute("data-out")); return; }
    if ((b = t.closest("[data-done]"))) { TD.toggle(b.getAttribute("data-done"), true); return; }
    if ((b = t.closest("[data-act]"))) { var id = b.getAttribute("data-id"); if (S.openId !== id) { S.openId = id; setTimeout(schedule, 0); } return; }
    if ((b = t.closest("a.hm-g.reach, a[href=\"#hmReach\"]"))) { e.preventDefault(); var r = document.getElementById("hmReach"); if (r && r.scrollIntoView) r.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    var row = t.closest(".hm-p");
    if (row && !t.closest(".hm-pa") && !t.closest(".hm-out")) { var id2 = row.getAttribute("data-id"); S.openId = S.openId === id2 ? null : id2; renderReach(); return; }
  });
  /* Task ticks (input[data-tk]) are handled by tasks-today.js for the whole document, so Home does not listen for them. */
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f || f !== els.addForm) return;
    e.preventDefault();
    var inp = document.getElementById("hmAdd"), v = inp.value.trim(); if (!v) { inp.focus(); return; }
    inp.value = ""; TD.add(v, ""); inp.focus();
  });

  /* ---------- start ---------- */
  function toLogin() { try { window.location.replace("index.html"); } catch (e) {} }
  build();
  readCache();
  var theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; setTheme(theme);
  renderAll();
  if (!Store || !Store.configured()) { toLogin(); return; }
  Store.getSession().then(function (sess) {
    if (!sess) { toLogin(); return; }
    TD.on(schedule); TD.start();
    load();
    setInterval(function () { if (document.visibilityState === "visible") { if (Date.now() - S.loadedAt > 60000) load(); else schedule(); } }, 60000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { if (Date.now() - S.loadedAt > 30000) load(); schedule(); } });
    window.addEventListener("online", load);
  }, function () {});
  Store.onAuth(function (ev, sess) { if (ev === "SIGNED_OUT" || (!sess && ev !== "INITIAL_SESSION")) setTimeout(toLogin, 0); });
})();
