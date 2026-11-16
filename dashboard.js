/* Dashboard page for Closing Desk. Read-only: it never changes a contact or a post.
   Contact numbers come from CDStats (the same code Today and Win the Day use, so all three agree).
   Scheduled posts come from the Win the Day document. The licence dates come from the plan. */
(function () {
  "use strict";
  var Store = window.CDStore, Stats = window.CDStats;
  var app = document.getElementById("app");

  /* ---------- plan dates (from the Win the Day plan) ---------- */
  var VAC_START = "2026-11-21", VAC_END = "2026-11-29", OUTREACH_START = "2026-11-30", PLAN_END = "2026-12-31";
  var NO_OUTREACH = { "2026-12-25": 1, "2026-12-26": 1 };
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CACHE_KEY = "cd.dash1";

  var S = { stats: null, goals: null, content: undefined, at: null, status: "load", saved: false };
  var busy = false, cardsEl = null, updEl = null, eyeEl = null, rfBtn = null;

  /* ---------- small helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function n(x) { return Number(x).toLocaleString("en-CA"); }
  function pad(x) { return ("0" + x).slice(-2); }
  function localToday() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function edmToday() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { return localToday(); }
  }
  function parse(s) { var p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function add(s, k) { var d = parse(s); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }
  function dow(s) { return parse(s).getUTCDay(); }
  function between(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function dayName(s) { var d = parse(s); return DAYS[d.getUTCDay()] + " " + MONS[d.getUTCMonth()] + " " + d.getUTCDate(); }
  function timeText(t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); if (!m) return "";
    var hr = +m[1], ap = hr >= 12 ? "p.m." : "a.m."; hr = hr % 12 || 12; return hr + ":" + m[2] + " " + ap;
  }
  function clockText(d) {
    try { return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }); } catch (e) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  }
  function pctOf(x, total) { return total > 0 ? Math.min(100, Math.round(x * 100 / total)) : 0; }
  function fillW(x, total) { var p = pctOf(x, Math.max(total, 1)); return x > 0 && p < 2 ? 2 : p; }

  /* Mon to Sat outreach days left, from Nov 30 (or today if later) to Dec 31, without Dec 25 and 26. */
  function outreachDaysLeft(td) {
    var d = td < OUTREACH_START ? OUTREACH_START : td, k = 0;
    while (d <= PLAN_END) { if (dow(d) !== 0 && !NO_OUTREACH[d]) k++; d = add(d, 1); }
    return k;
  }
  function dealCount(deals, type, year) {
    return (deals || []).filter(function (d) { return d && d.type === type && String(d.date || "").slice(0, 4) === String(year); }).length;
  }

  /* ---------- card pieces ---------- */
  function chip(text, kind) { return h("span", { class: "chip" + (kind ? " " + kind : ""), text: text }); }
  function liveChip() { return S.saved ? chip("Saved copy", "warn") : chip("Live from Closing Desk"); }
  function card(cls, label, chipEl, kids) {
    return h("section", { class: "card" + (cls ? " " + cls : "") }, [h("div", { class: "ct" }, [h("span", { class: "lbl", text: label }), chipEl])].concat(kids));
  }
  function row(label, valueText, w, extra) {
    return h("div", { class: "row" }, [
      h("div", { class: "rl" }, [h("span", { text: label }), h("b", { text: valueText })]),
      h("div", { class: "bar", "aria-hidden": "true" }, [h("i", { style: "width:" + w + "%" })]),
      extra || null
    ]);
  }

  function paceKids(s, td) {
    if (!s.contacts) return [h("p", { class: "note", text: "Add contacts in Closing Desk and your numbers show up here." })];
    if (s.left === 0) return [h("p", { class: "note", text: "Everyone has been reached at least once. Well done." })];
    var days = outreachDaysLeft(td);
    var kids = [n(s.left) + (s.left === 1 ? " person" : " people") + " still to reach. "];
    var out = [];
    if (days) {
      var per = Math.ceil(s.left / days);
      kids.push("Reaching everyone by Dec 31 is ", h("b", { text: "about " + per + " a day" }), ". ", per > 15 ? "Your plan asks for 10 to 15." : "That fits inside your plan of 10 to 15 a day.");
    }
    out.push(h("p", { class: "note" }, kids));
    if (days) out.push(h("p", { class: "fine", text: "Counted Mon to Sat from Nov 30, without Dec 25 and 26. Study week (Nov 21 to 29) has no outreach." }));
    return out;
  }

  function heroCard(s, td) {
    var w = s.reached > 0 ? Math.max(2, s.pct) : 0;
    return card("hero", "Reached at least once", liveChip(), [
      h("div", { class: "big" }, [h("b", { text: n(s.reached) }), h("span", { text: "of " + n(s.contacts) + " · " + s.pct + "%" })]),
      h("div", { class: "track", role: "progressbar", "aria-valuenow": String(s.reached), "aria-valuemin": "0", "aria-valuemax": String(s.contacts), "aria-label": "Contacts reached" }, [h("i", { style: "width:" + w + "%" })])
    ].concat(paceKids(s, td)));
  }
  function todayCard(s) {
    function tile(v, l) { return h("div", { class: "tile" }, [h("b", { text: n(v) }), h("span", { text: l })]); }
    return card("", "Today", liveChip(), [h("div", { class: "tiles" }, [tile(s.touchesToday, "calls and messages"), tile(s.emailsToday, "emails sent"), tile(s.dueToday, "follow-ups due")])]);
  }
  function reachCard(s) {
    return card("", "Who you can reach", liveChip(), [
      row("Have a phone number", n(s.withPhone) + " of " + n(s.contacts), fillW(s.withPhone, s.contacts)),
      row("Have an email", n(s.withEmail) + " of " + n(s.contacts), fillW(s.withEmail, s.contacts)),
      row("Consent recorded", n(s.consented) + " of " + n(s.contacts), fillW(s.consented, s.contacts), h("p", { class: "fine", text: "Mass email only goes to people with consent recorded." }))
    ]);
  }
  function goalsCard(g) {
    return card("", g.year + " goals", liveChip(), [
      row("Listings", g.listings + " of " + g.listingsGoal, fillW(g.listings, g.listingsGoal)),
      row("Buyers", g.buyers + " of " + g.buyersGoal, fillW(g.buyers, g.buyersGoal))
    ]);
  }
  function contentCard() {
    var kids = [], list = S.content;
    if (list === undefined) kids.push(h("div", { class: "skel", style: "width:70%" }));
    else if (list === null) kids.push(h("p", { class: "note", text: "Could not load your scheduled posts right now. Pull the refresh button to try again." }));
    else {
      var td = edmToday();
      var up = list.filter(function (p) { return p && p.date && p.date >= td; }).sort(function (a, b) { return (a.date + (a.time || "99")) < (b.date + (b.time || "99")) ? -1 : 1; });
      if (!up.length) kids.push(h("p", { class: "note", text: "Nothing scheduled yet. Log a post in Win the Day and it shows up here." }));
      up.slice(0, 4).forEach(function (p) {
        var when = [dayName(p.date), timeText(p.time), p.kind].filter(Boolean).join(" · ");
        kids.push(h("div", { class: "post" }, [h("span", { class: "pw", text: when }), h("span", { class: "pt", text: p.title || p.kind || "Post" })]));
      });
      if (up.length > 4) kids.push(h("p", { class: "fine", text: (up.length - 4) + " more scheduled." }));
    }
    return card("", "Content scheduled", chip("From Win the Day", "plan"), kids);
  }
  function licenceCard(td) {
    var t, p;
    if (td < VAC_START) {
      var d = between(td, VAC_START);
      t = "Study starts " + dayName(VAC_START);
      p = (d === 1 ? "Tomorrow. " : "In " + d + " days. ") + "9 study days, Nov 21 to 29. Exam planned for December.";
    } else if (td <= VAC_END) {
      t = "Study day " + (between(VAC_START, td) + 1) + " of 9";
      p = "Nov 21 to 29. Exam planned for December.";
    } else {
      t = "Study block finished";
      p = "Exam planned for December. The exam date is not tracked here yet.";
    }
    return card("", "Commercial licence", chip("From your plan", "plan"), [h("div", { class: "big2", text: t }), h("p", { class: "note", text: p })]);
  }
  function repliesCard() {
    return card("todo", "Replies", chip("Not tracked yet", "warn"), [
      h("div", { class: "big" }, [h("b", { text: "–" }), h("span", { text: "people who replied" })]),
      h("p", { class: "fine", text: "Closing Desk has no one-tap Replied button yet. Adding one would let this card count replies." })
    ]);
  }

  /* ---------- page ---------- */
  function render() {
    var td = localToday();
    eyeEl.textContent = dayName(edmToday()) + " · your real numbers";
    if (S.status === "load" && !S.stats) updEl.textContent = "Loading your numbers…";
    else if (S.status === "err") updEl.textContent = S.stats ? "Saved copy from " + clockText(new Date(S.at)) + " · can't reach Closing Desk right now" : "Can't reach Closing Desk right now.";
    else if (S.saved) updEl.textContent = "Saved copy from " + clockText(new Date(S.at)) + " · updating…";
    else if (S.at) updEl.textContent = "Updated " + clockText(new Date(S.at)) + " · refreshes every minute";
    cardsEl.textContent = "";
    if (!S.stats) {
      cardsEl.appendChild(S.status === "err"
        ? card("", "Dashboard", chip("Offline", "err"), [h("p", { class: "note", text: "Your numbers could not load. Check your connection, then try again." }), h("button", { class: "btn", type: "button", id: "retry", text: "Try again" })])
        : card("", "Dashboard", chip("Loading", "plan"), [h("div", { class: "skel", style: "width:60%" }), h("div", { class: "skel", style: "width:85%" }), h("div", { class: "skel", style: "width:45%" })]));
      return;
    }
    var s = S.stats;
    [heroCard(s, td), todayCard(s), reachCard(s), goalsCard(S.goals), contentCard(), licenceCard(edmToday()), repliesCard(),
      h("div", { class: "links" }, [h("a", { class: "lnk", href: "./#today", text: "Open Today list" }), h("a", { class: "lnk ghost", href: "tasks.html", text: "Open Win the Day" })])
    ].forEach(function (el) { cardsEl.appendChild(el); });
  }

  function spin(on) { if (rfBtn) rfBtn.classList.toggle("spin", !!on); }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ stats: S.stats, goals: S.goals, at: S.at, td: localToday() })); } catch (e) {}
  }
  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && c.stats && c.goals && c.td === localToday()) { S.stats = c.stats; S.goals = c.goals; S.at = c.at; S.saved = true; }
    } catch (e) {}
  }

  function load() {
    if (busy || !Store) return;
    busy = true; spin(true);
    Promise.all([
      Store.loadAll(),
      Store.getOsDoc("main").then(function (d) { return { ok: true, d: d }; }, function () { return { ok: false }; })
    ]).then(function (r) {
      var res = r[0], st = res.settings || {}, td = localToday();
      S.stats = Stats.compute(res.contacts || [], td);
      var year = Number(st.goalYear) || 2027;
      S.goals = {
        year: year,
        listingsGoal: st.listingsGoal == null ? 20 : Math.max(0, Number(st.listingsGoal) || 0),
        buyersGoal: st.buyersGoal == null ? 30 : Math.max(0, Number(st.buyersGoal) || 0),
        listings: dealCount(st.deals, "listing", year),
        buyers: dealCount(st.deals, "buyer", year)
      };
      S.content = r[1].ok ? (r[1].d && Array.isArray(r[1].d.content) ? r[1].d.content : []) : null;
      S.at = new Date().toISOString(); S.status = "ok"; S.saved = false;
      busy = false; spin(false); saveCache(); render();
    }, function () {
      busy = false; spin(false); S.status = "err"; render();
    });
  }

  /* ---------- chrome: strip, theme button, header ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("cd.theme", t); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#F3F6FB" : "#0B1220");
    var b = document.getElementById("themeBtn"); if (b) b.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
  }
  function buildChrome() {
    var strip = h("div", { class: "strip" }, [
      h("span", { class: "logo", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/><path d="M9 15l2.2 2.2L15 12.8"/></svg>' }),
      h("div", { class: "seg2", role: "group", "aria-label": "Switch app" }, [
        h("a", { class: "s", href: "tasks.html", "aria-label": "Win the Day", text: "Win" }),
        h("a", { class: "s", href: "./", text: "Clients" }),
        h("span", { class: "s on", "aria-current": "page", "aria-label": "Dashboard", text: "Dash" })
      ]),
      h("span", { class: "sp" }),
      h("button", { class: "ib", id: "themeBtn", type: "button", "aria-label": "Switch to light mode", html: '<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' })
    ]);
    app.parentNode.insertBefore(strip, app);
    eyeEl = h("p", { class: "eyebrow" });
    updEl = h("p", { class: "upd", "aria-live": "polite" });
    rfBtn = h("button", { class: "ib", id: "rfBtn", type: "button", "aria-label": "Refresh numbers", html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>' });
    cardsEl = h("div", { id: "cards", style: "display:flex;flex-direction:column;gap:12px" });
    app.appendChild(h("div", { class: "wrap" }, [
      h("div", { class: "head", style: "flex-direction:row;align-items:flex-start;justify-content:space-between;gap:12px" }, [
        h("div", { style: "display:flex;flex-direction:column;gap:4px;min-width:0" }, [eyeEl, h("h1", { text: "Dashboard" }), updEl]),
        rfBtn
      ]),
      cardsEl
    ]));
    document.getElementById("themeBtn").addEventListener("click", function () { setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"); });
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    rfBtn.addEventListener("click", load);
    cardsEl.addEventListener("click", function (e) { if (e.target && e.target.id === "retry") load(); });
  }

  /* ---------- start ---------- */
  function toLogin() { try { window.location.replace("./"); } catch (e) {} }
  buildChrome();
  readCache();
  render();
  if (!Store || !Store.configured()) { toLogin(); return; }
  Store.getSession().then(function (sess) {
    if (!sess) { toLogin(); return; }
    load();
    setInterval(function () { if (document.visibilityState === "visible") load(); }, 60000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(); });
    window.addEventListener("online", load);
  }, function () {});
  Store.onAuth(function (ev, sess) { if (ev === "SIGNED_OUT" || (!sess && ev !== "INITIAL_SESSION")) setTimeout(toLogin, 0); });
})();
