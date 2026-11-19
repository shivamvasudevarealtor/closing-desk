/* Builders: page start, top bar, tabs, Overview, Directory, the monthly send sheet.
   Deals, Replies and Settings are in builders-views.js. Data and Gmail work is in builders-data.js. */
(function () {
  "use strict";
  var B = window.BLD, BA = window.BLDAPP, U = window.BLU, Store = window.CDStore, h = U.h, S = BA.S;
  var TABS = ["overview", "directory", "deals", "replies", "settings"], LABEL = { overview: "Overview", directory: "Directory", deals: "Deals", replies: "Replies", settings: "Settings" };
  var QUADS = B.QUADS, CITIES = ["Calgary", "Airdrie", "Chestermere", "Cochrane"];
  var app = document.getElementById("app"), els = {}, raf = 0;
  U.st = { tab: "overview", dir: { q: "", city: "", quad: "", comm: "", health: "", view: "builder" }, deals: { q: "", state: "open", type: "", city: "", quadrant: "", community: "", builder: "", homeType: "", minPrice: "", maxPrice: "", beds: "", possession: "", endingDays: "", missing: false, sort: "new", more: false, sel: {}, open: null }, replies: { f: "review", open: null } };
  U.go = function (tab, patch) { if (patch) { var k = tab === "directory" ? "dir" : tab; Object.assign(U.st[k], patch); } location.hash = tab; if (U.st.tab === tab) mountTab(); };

  /* ---------- helpers on the data ---------- */
  U.byId = function (list, id) { return list.filter(function (x) { return x.id === id; })[0]; };
  U.builderName = function (id) { var b = U.byId(S.dir.builders, id); return b ? b.name : "Unknown builder"; };
  U.contactsOf = function (bid) { return S.dir.contacts.filter(function (c) { return c.builderId === bid; }); };
  U.runItems = function (mk) { var r = S.dir.runs[mk || BA.mk()]; return (r && r.items) || {}; };
  U.areaPlaces = function (bid) { return B.areasOf(S.dir, bid).map(function (n) { return B.placeOf(S.dir, n); }); };
  U.areaText = function (bid) {
    var by = {}, order = [];
    U.areaPlaces(bid).forEach(function (p) { var k = p.city === "Calgary" ? (p.quadrant ? p.quadrant + " Calgary" : "Calgary") : (p.city || "Other"); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(p.community); });
    order.sort(function (a, b) { return (a === "Other") - (b === "Other") || a.localeCompare(b); });
    return order.map(function (k) { var l = by[k].sort(); return k + ": " + l.slice(0, 5).join(", ") + (l.length > 5 ? " +" + (l.length - 5) : ""); });
  };
  U.noEmail = function () { var has = {}; S.dir.contacts.forEach(function (c) { if (c.monthly && B.recipientEligibility(c, { status: "active" }, null).ok) has[c.builderId] = 1; }); return S.dir.builders.filter(function (b) { return b.status === "active" && !has[b.id]; }); };
  U.unconfirmed = function () { return S.dir.contacts.filter(function (c) { return B.health(c).key === "unverified"; }); };
  U.problems = function () { return S.dir.contacts.filter(function (c) { return B.health(c).level === "bad"; }); };
  U.counts = function () {
    var t = B.todayIso(), dd = S.deals.deals, open = dd.filter(function (d) { return d.state === "new" && B.dealStatus(d, t) === "new"; }).length;
    return { newDeals: open, replies: S.deals.replies.filter(function (r) { return r.state === "new" && (r.kind === "reply" || r.kind === "paste"); }).length };
  };

  /* ---------- frame ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("cd.theme", t); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#F5F3EE" : "#0A0D14");
  }
  function renderTop() {
    els.top.textContent = "";
    els.top.appendChild(h("span", { class: "bl-logo logo", "aria-hidden": "true", html: U.IC.logo }));
    els.top.appendChild(h("span", { class: "bl-brand", text: "Builders" }));
    var tools = h("div", { class: "bl-tools" });
    var sv = S.save === "saved" ? null : h(S.save === "failed" ? "button" : "span", { class: "bl-save " + S.save, type: S.save === "failed" ? "button" : false, id: "blSave", text: S.save === "failed" ? "Not saved. Tap to retry" : S.save === "saving" ? "Saving…" : "Saving soon…" });
    if (sv && S.save === "failed") sv.addEventListener("click", function () { BA.flush(); });
    if (sv) tools.appendChild(sv);
    var rf = h("button", { class: "bl-ib" + (S.status === "loading" || S.status === "refresh" ? " spin" : ""), type: "button", id: "blRefresh", "aria-label": "Refresh", html: U.IC.refresh }); rf.addEventListener("click", function () { BA.load(); });
    var th = h("button", { class: "bl-ib", type: "button", id: "blTheme", "aria-label": document.documentElement.getAttribute("data-theme") === "light" ? "Switch to dark mode" : "Switch to light mode", html: U.IC.sun });
    th.addEventListener("click", function () { var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; setTheme(t); th.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode"); });
    var st = h("a", { class: "bl-ib more-gear", href: "index.html#more", "aria-label": "App settings", html: U.IC.gear });
    [rf, th, st].forEach(function (x) { tools.appendChild(x); }); els.top.appendChild(tools);
  }
  function renderSeg() {
    els.seg.textContent = ""; var c = S.dir ? U.counts() : { newDeals: 0, replies: 0 };
    TABS.forEach(function (t) {
      var n = t === "deals" ? c.newDeals : t === "replies" ? c.replies : 0;
      var b = h("button", { type: "button", role: "tab", "aria-selected": U.st.tab === t ? "true" : "false", "data-tab": t }, [LABEL[t], n ? h("span", { class: "n", text: String(n) }) : null]);
      b.addEventListener("click", function () { U.go(t); }); els.seg.appendChild(b);
    });
  }
  function renderBanner() {
    els.banner.textContent = "";
    if (S.status === "error") els.banner.appendChild(h("div", { class: "bl-warn bad", role: "alert" }, [h("span", { text: "Can't reach your data right now." }), U.btn("Try again", "sm", function () { BA.load(); })]));
    else if (S.wrongAccount) els.banner.appendChild(h("div", { class: "bl-warn bad", role: "alert" }, [h("span", { text: "Gmail is connected as " + (window.CDMail.email() || "another account") + ", not " + S.dir.settings.account + ". Sending is blocked until you connect the right account." }), U.btn("Disconnect", "sm", function () { BA.disconnect(); })]));
  }
  function build() {
    ["top:header", "hello:section", "banner:div", "seg:div", "body:div"].forEach(function (d) { var p = d.split(":"); els[p[0]] = h(p[1], { class: "bl-" + p[0] }); app.appendChild(els[p[0]]); });
    els.seg.setAttribute("role", "tablist"); els.seg.setAttribute("aria-label", "Builders sections"); els.body.className = "bl-body bl-list"; els.body.style.gap = "16px";
    els.hello.className = "bl-hello";
  }
  function renderHello() {
    els.hello.textContent = "";
    els.hello.appendChild(h("h1", { text: "Builder deals" }));
    var d = S.dir; var n = d ? d.builders.length : 0, e = d ? d.contacts.filter(function (c) { return c.monthly; }).length : 0;
    els.hello.appendChild(h("p", { text: d ? U.plural(n, "builder") + " · " + U.plural(e, "email") + " on the monthly list" + (S.loadedAt ? " · updated " + new Date(S.loadedAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "") : "Specs, quick possessions and incentives, asked once a month." }));
  }
  function mountTab() {
    els.body.textContent = "";
    if (S.status === "loading" && !S.dir) { els.body.appendChild(h("div", { class: "bl-skel" })); els.body.appendChild(h("div", { class: "bl-skel" })); els.body.appendChild(h("div", { class: "bl-skel" })); return; }
    if (!S.dir) {
      if (S.status === "empty") els.body.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "No builder list yet" }), h("span", { text: "Start empty and add builders, or import a CSV (builder, email, name, role, website, source)." }), h("div", { class: "bl-row" }, [U.btn("Start with an empty list", "pri", function () { BA.startEmpty(); }), U.btn("Try loading again", "", function () { BA.load(); })])]));
      return;
    }
    var v = U.views[U.st.tab]; if (v) v.mount(els.body);
  }
  function refresh() {
    renderTop(); renderBanner(); renderHello();
    if (S.dir) renderSeg(); else els.seg.textContent = "";
    var v = U.views[U.st.tab];
    if (v && S.dir && v.refresh && !U.typing()) v.refresh(); else if (!S.dir) mountTab();
    if (U.sheet.isOpen("send")) U.sheet.redraw();
    if (U.sheet.isOpen("pdf") && S.sending == null) { /* nothing */ }
  }
  /* Do not rebuild a list while a text box inside the page body has focus (it would lose the cursor). */
  U.typing = function () { var a = document.activeElement; return !!a && els.body.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox"; };
  U.refresh = function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); };
  U.rerender = function () { cancelAnimationFrame(raf); mountTab(); renderSeg(); };

  /* ================= Overview ================= */
  U.views.overview = {
    mount: function (el) { U.views.overview.el = el; U.views.overview.refresh(); },
    refresh: function () {
      var el = U.views.overview.el; if (!el) return; el.textContent = "";
      var ask = BA.status(), mk = ask.month, items = U.runItems(mk), r = ask.run, replied = 0;
      Object.keys(items).forEach(function (k) { if (items[k].repliedAt) replied++; });
      var sent = r.sent + r.uncertain, total = Math.max(r.total, ask.ready + sent), pct = total ? Math.round(sent * 100 / total) : 0;
      var cfg = {
        empty: ["Monthly ask", "No one to email yet", "Add builder emails in the Directory, then this fills in.", "Open Directory", function () { U.go("directory"); }],
        upcoming: ["Next ask · day " + ask.sendDay, ask.label + " ask is not due yet", ask.ready + " builder" + (ask.ready === 1 ? " is" : "s are") + " ready" + (ask.weak ? ", " + ask.weak + " to confirm" : "") + ". You can send early if you like.", "Review and send", function () { openSend(); }],
        due: ["Due now", ask.label + " ask is due", ask.ready + " builder" + (ask.ready === 1 ? " is" : "s are") + " ready" + (ask.weak ? ", " + ask.weak + " need you to confirm the email source first" : "") + (ask.daysLate > 0 ? " · " + U.plural(ask.daysLate, "day") + " past day " + ask.sendDay : "") + ". Check the list, then tap send.", "Review and send", function () { openSend(); }],
        inprogress: ["In progress", sent + " of " + total + " sent", (ask.run.queued ? ask.run.queued + " still waiting. " : "") + (ask.ready ? ask.ready + " more ready to send." : "Open the list to continue."), "Continue", function () { openSend(); }],
        done: ["Done for " + ask.label, sent + " sent", replied ? replied + " replied so far." : "No replies yet. Check for replies in a day or two.", "Check replies", function () { doCheck(); }]
      }[ask.state];
      var hero = h("section", { class: "bl-hero", "aria-label": "Monthly ask" }, [
        h("span", { class: "bl-eye" }, [h("i"), cfg[0]]), h("h2", { text: cfg[1] }), h("p", { text: cfg[2] }),
        ask.state === "done" || ask.state === "inprogress" ? h("div", { class: "bl-bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Sent" }, [h("i", { style: "width:" + Math.max(pct, sent ? 3 : 0) + "%" })]) : null,
        h("div", { class: "bl-stats" }, [["Ready", ask.ready], ["Sent", sent], ["Replied", replied], ["Need a look", r.uncertain + r.fail + (U.problems().length)]].map(function (x) { return h("div", { class: "bl-st" }, [h("b", { class: "tn", text: String(x[1]) }), h("span", { text: x[0] })]); })),
        h("div", { class: "bl-row" }, [U.btn(cfg[3], "pri", cfg[4], ask.state === "done" ? "mail" : "send"), ask.state !== "done" && ask.state !== "empty" ? U.btn("Check replies", "", function () { doCheck(); }) : U.btn("Review the list", "", function () { openSend(); })])
      ]);
      el.appendChild(hero);
      /* tiles */
      var c = U.counts(), t = B.todayIso(), ending = S.deals.deals.filter(function (d) { return d.validUntil && d.validUntil >= t && B.daysBetween(t, d.validUntil) <= 14 && ["new", "reviewed", "active"].indexOf(d.state) >= 0; }).length, stale = BA.staleDeals().length;
      var tiles = [
        ["New deals", c.newDeals, c.newDeals ? "gold" : "", function () { U.go("deals", { state: "new" }); }],
        ["Replies to review", c.replies, c.replies ? "gold" : "", function () { U.go("replies", { f: "review" }); }],
        ["Offers ending in 14 days", ending, ending ? "warm" : "", function () { U.go("deals", { state: "open", endingDays: "14" }); }],
        ["Builders with no email", U.noEmail().length, U.noEmail().length ? "warm" : "ok", function () { U.go("directory", { health: "noemail" }); }],
        ["Emails to confirm", U.unconfirmed().length, U.unconfirmed().length ? "warm" : "ok", function () { U.go("directory", { health: "warn" }); }],
        ["Addresses that will not work", U.problems().length, U.problems().length ? "hot" : "ok", function () { U.go("directory", { health: "bad" }); }]
      ];
      var g = h("div", { class: "bl-grid" }); g.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
      tiles.forEach(function (x) { var b = h("button", { type: "button", class: "bl-tile " + x[2] }, [h("b", { class: "tn", text: String(x[1]) }), h("span", { text: x[0] })]); b.addEventListener("click", x[3]); g.appendChild(b); });
      el.appendChild(g);
      if (stale) el.appendChild(h("div", { class: "bl-warn info" }, [h("span", { text: U.plural(stale, "deal") + " not mentioned by the builder for 45+ days. Ask if still available at the next monthly email." }), U.btn("See them", "sm", function () { U.go("deals", { state: "open", sort: "new" }); })]));
      /* Gmail */
      var Mail = window.CDMail, conn = Mail.token(), can = Mail.canRead();
      var gm = h("section", { class: "bl-card" }, [h("h3", { text: "Gmail" }),
        h("p", { class: "bl-sub", text: conn ? "Connected as " + Mail.email() + (can ? " · can read replies" : " · send only") + ". It stays connected until you close this page." : "Not connected. Connect once per visit to send the monthly ask or check replies." + (S.mail.clientId ? "" : " Add your Google client ID in Settings, Email first.") }),
        h("div", { class: "bl-row" }, [conn ? U.btn("Check replies", "pri", function () { doCheck(); }, "refresh") : U.btn("Connect Gmail", "pri", function () { doConnect(); }, "mail"), U.btn("Paste a reply", "", function () { U.pasteSheet(); }, "plus"), conn ? U.btn("Disconnect", "sm", function () { BA.disconnect(); }) : null])]);
      el.appendChild(gm);
      /* ending soon */
      var soon = S.deals.deals.filter(function (d) { return d.validUntil && d.validUntil >= t && B.daysBetween(t, d.validUntil) <= 21 && ["new", "reviewed", "active"].indexOf(d.state) >= 0; }).sort(function (a, b) { return a.validUntil.localeCompare(b.validUntil); }).slice(0, 4);
      if (soon.length) {
        var sc = h("section", { class: "bl-card" }, [h("h3", { text: "Ending soon" })]);
        soon.forEach(function (d) { sc.appendChild(h("div", { class: "bl-line" }, [U.chip("Ends " + B.fmtDate(d.validUntil), "warn"), h("span", { class: "bl-em", text: U.builderName(d.builderId) + (d.community ? " · " + d.community : "") }), h("span", { class: "mut", text: d.description ? d.description.slice(0, 90) : "" })])); });
        el.appendChild(sc);
      }
      /* how it works, for first-time use */
      if (!S.deals.replies.length && !Object.keys(S.dir.runs).length) el.appendChild(h("section", { class: "bl-card" }, [h("h3", { text: "How it works" }), h("ol", { class: "bl-sub", style: "margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px" }, [
        h("li", { text: "Once a month the ask shows as due. Review the list and tap Send." }), h("li", { text: "Builders reply to your Gmail like normal. Tap Check replies." }), h("li", { text: "Each reply becomes separate fields (community, price, possession and more). Review, then filter in Deals." }), h("li", { text: "Pick a deal and make a one-page PDF to send to a client." })])]));
    }
  };
  function toastCheck(c) { U.toast(c.note || ("Checked " + U.plural(c.threads, "conversation") + ": " + U.plural(c.newReplies, "new reply", "new replies") + ", " + U.plural(c.newDeals, "deal") + (c.bounces ? ", " + U.plural(c.bounces, "bounce") : "") + (c.stops ? ", " + U.plural(c.stops, "opt-out") : "") + ".")); }
  function doConnect() {
    return BA.connect().then(function () { U.toast("Gmail connected."); U.refresh(); U.sheet.redraw(); }, function (e) { U.toast(e.message || "Could not connect Gmail.", null, null, 7000); });
  }
  function doCheck() {
    var go = function () { U.toast("Checking Gmail…"); return BA.checkReplies().then(function (c) { toastCheck(c); U.refresh(); }, function (e) { U.toast(e.message || "Could not check replies.", null, null, 7000); }); };
    if (!window.CDMail.canRead()) return doConnect().then(function () { if (window.CDMail.canRead()) return go(); });
    return go();
  }
  U.doCheck = doCheck; U.doConnect = doConnect;

  /* ================= Directory ================= */
  function dirMatch(b, f) {
    var q = f.q.trim().toLowerCase(), cs = U.contactsOf(b.id), pl = U.areaPlaces(b.id);
    if (f.city || f.quad || f.comm) { if (!pl.some(function (p) { return (!f.city || p.city === f.city) && (!f.quad || p.quadrant === f.quad) && (!f.comm || p.community === f.comm); })) return false; }
    if (f.health) {
      var hs = cs.map(B.health);
      if (f.health === "noemail") { if (cs.length) return false; }
      else if (!hs.some(function (x) { return f.health === "ok" ? x.level === "ok" : f.health === "warn" ? x.level === "warn" : f.health === "bad" ? x.level === "bad" : x.level === "unknown"; })) return false;
    }
    if (q) { var hay = [b.name, b.website, cs.map(function (c) { return c.email + " " + c.name; }).join(" "), pl.map(function (p) { return p.community; }).join(" ")].join(" ").toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  }
  function contactRow(c, b) {
    var hh = B.health(c), weak = hh.key === "unverified", run = U.runItems()[c.id];
    var row = h("div", { class: "bl-contact" + (weak ? " weak" : "") }, [
      h("div", { class: "bl-line" }, [h("span", { class: "bl-em", text: c.email }), U.chip(hh.text, U.healthCls(hh)), c.role ? U.chip(c.role) : null, !c.monthly ? U.chip("Not monthly", "") : null, run && run.st ? U.chip(run.st === "sent" ? "Sent " + U.ago(run.at) : run.st, run.st === "sent" ? "ok" : "warn") : null, run && run.repliedAt ? U.chip("Replied", "ok") : null]),
      c.name ? h("div", { class: "mut", style: "font-size:13px", text: c.name }) : null,
      h("div", { class: "bl-line" }, [c.src && c.src.url ? h("a", { href: c.src.url, target: "_blank", rel: "noopener noreferrer", class: "mut", style: "font-size:13px", text: "Source: " + (c.src.type || "page") }) : h("span", { class: "fnt", style: "font-size:13px", text: "Source: " + ((c.src && c.src.type) || "none") }), h("span", { style: "flex:1" }),
        weak ? U.btn("Confirm", "sm", function () { BA.patchContact(c.id, null, { confirmed: BA.nowIso() }); U.refresh(); }) : null, U.btn("Edit", "sm", function () { openContact(c.id); })])
    ]);
    if (run && (run.st === "uncertain" || run.st === "fail")) {
      row.appendChild(h("div", { class: "bl-warn" }, [h("span", { text: (run.st === "uncertain" ? "Could not confirm this one went out. Open Gmail Sent and look. " : "This one failed. ") + (run.err || "") }),
        h("div", { class: "bl-row" }, [run.st === "uncertain" ? U.btn("It was sent", "sm", function () { BA.markSent(BA.mk(), c.id); U.refresh(); }) : null, U.btn("Send again", "sm", function () { BA.requeue(BA.mk(), c.id); U.refresh(); U.toast("Back on the list for this month."); })])]));
    }
    return row;
  }
  function builderCard(b) {
    var cs = U.contactsOf(b.id), card = h("article", { class: "bl-item" + (b.status !== "active" ? " paused" : "") }, [
      h("div", { class: "bl-line" }, [h("h4", { text: b.name }), b.status !== "active" ? U.chip("Paused", "warn") : null, h("span", { style: "flex:1" }), b.website ? h("a", { href: b.website, target: "_blank", rel: "noopener noreferrer", class: "mut", style: "font-size:13px", text: "Website" }) : null, U.btn("Edit", "sm", function () { openBuilder(b.id); })])]);
    var ar = U.areaText(b.id); card.appendChild(h("div", { class: "bl-areas", text: ar.length ? ar.join(" · ") : "No communities chosen yet" }));
    if (!cs.length) card.appendChild(h("div", { class: "bl-warn" }, [h("span", { text: "No public email found. Most builders only publish a web form." }), h("div", { class: "bl-row" }, [b.contactPage ? h("a", { class: "bl-btn sm", href: b.contactPage, target: "_blank", rel: "noopener noreferrer", text: "Open contact page" }) : null, U.btn("Add an email", "sm pri", function () { openContact(null, b.id); })])]));
    else { cs.forEach(function (c) { card.appendChild(contactRow(c, b)); }); card.appendChild(h("div", { class: "bl-row" }, [U.btn("Add another email", "sm", function () { openContact(null, b.id); }, "plus")])); }
    return card;
  }
  function areaView(list) {
    var f = U.st.dir, out = h("div", { class: "bl-list" }), cities = {};
    var ids = {}; list.forEach(function (b) { ids[b.id] = 1; });
    var bycomm = {}; S.dir.areas.forEach(function (a) { if (ids[a.builderId]) (bycomm[a.community] = bycomm[a.community] || []).push(a.builderId); });
    Object.keys(S.dir.communities).forEach(function (n) {
      var c = S.dir.communities[n], ch = (bycomm[n] || []).length; if (!ch && (f.q || f.health || f.city || f.quad || f.comm)) return; if (f.city && c.city !== f.city) return; if (f.quad && c.quadrant !== f.quad) return; if (f.comm && n !== f.comm) return;
      var ck = c.city === "Calgary" ? "Calgary|" + (c.quadrant || "?") : c.city; (cities[ck] = cities[ck] || []).push(n);
    });
    var order = ["Calgary|NW", "Calgary|NE", "Calgary|SW", "Calgary|SE", "Calgary|?", "Airdrie", "Chestermere", "Cochrane"], keys = Object.keys(cities).sort(function (a, b) { var i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });
    if (!keys.length) return h("div", { class: "bl-empty" }, [h("b", { text: "Nothing matches" }), h("span", { text: "Try clearing a filter." })]);
    keys.forEach(function (k) {
      var parts = k.split("|"), title = parts[1] ? (parts[1] === "?" ? "Calgary · quadrant not chosen" : parts[1] + " Calgary") : parts[0];
      var sec = h("section", { class: "bl-city" }, [h("h3", { text: title + " · " + U.plural(cities[k].length, "community", "communities") })]);
      cities[k].sort().forEach(function (n) {
        var c = S.dir.communities[n], bs = (bycomm[n] || []).map(function (id) { return U.byId(S.dir.builders, id); }).filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name); });
        var card = h("div", { class: "bl-comm" }, [h("div", { class: "t" }, [h("b", { text: n }), c.city === "Calgary" ? (c.quadrant ? U.chip(c.quadrant, "gold") : U.chip("Quadrant?", "warn")) : U.chip(c.city, "cal"), c.review ? U.chip("Please confirm", "warn") : null,
          B.needsQuadrant(c) ? (function () { var s = h("select", { class: "bl-sel", "aria-label": "Quadrant for " + n }, [h("option", { value: "", text: "Choose quadrant" })].concat(QUADS.map(function (q) { return h("option", { value: q, text: q }); }))); s.addEventListener("change", function () { if (s.value) { BA.setCommunity(n, { quadrant: s.value, review: false }); U.refresh(); } }); return s; })() : (c.review ? U.btn("Looks right", "sm", function () { BA.setCommunity(n, { review: false }); U.refresh(); }) : null)])]);
        if (!bs.length) card.appendChild(h("span", { class: "fnt", style: "font-size:13px", text: "No builders listed here yet" }));
        bs.forEach(function (b) {
          var cs = U.contactsOf(b.id);
          card.appendChild(h("div", { class: "bl-bm" }, [h("b", { text: b.name }), cs.length ? h("span", { class: "mut" }, [cs.map(function (c) { var hh = B.health(c); return c.email + (hh.level === "ok" ? " ✓" : hh.level === "bad" ? " ✕" : hh.level === "warn" ? " ?" : ""); }).join(" · ")]) : h("span", { class: "fnt", text: "no email yet" })]));
        });
        sec.appendChild(card);
      });
      out.appendChild(sec);
    });
    return out;
  }
  U.views.directory = {
    mount: function (el) {
      var v = U.views.directory, f = U.st.dir; v.el = el;
      var q = h("input", { type: "search", id: "dirQ", placeholder: "Search builder, email or community", "aria-label": "Search builders", autocomplete: "off", value: f.q }); q.addEventListener("input", function () { f.q = q.value; v.refresh(true); });
      v.bar = h("div", { class: "bl-fbar" }, [h("div", { class: "bl-search", html: U.IC.search }, [q]), (v.chips = h("div", { class: "bl-fbars", style: "display:flex;flex-direction:column;gap:10px" }))]);
      v.list = h("div", { class: "bl-list" }); el.appendChild(v.bar); el.appendChild(v.list); v.refresh();
    },
    refresh: function (listOnly) {
      var v = U.views.directory, f = U.st.dir; if (!v.list || !S.dir) return;
      var all = S.dir.builders.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }), list = all.filter(function (b) { return dirMatch(b, f); });
      if (!listOnly) {
        v.chips.textContent = "";
        function pillRow(label, items, key, extra) {
          var row = h("div", { class: "bl-chips", role: "group", "aria-label": label }, [h("span", { class: "lb", text: label })]);
          items.forEach(function (it) { var b = h("button", { type: "button", class: "bl-pill", "aria-pressed": String(f[key] === it[0]) }, [it[1], it[2] != null ? " " : null, it[2] != null ? h("span", { class: "c", text: String(it[2]) }) : null]); b.addEventListener("click", function () { f[key] = f[key] === it[0] && it[0] !== "" ? "" : it[0]; if (key === "city" && f.city && f.city !== "Calgary") f.quad = ""; if (key === "city" || key === "quad") f.comm = ""; v.refresh(); }); row.appendChild(b); });
          return row;
        }
        var cityCount = function (c) { return all.filter(function (b) { return dirMatch(b, Object.assign({}, f, { city: c })); }).length; };
        v.chips.appendChild(pillRow("City", [["", "All"]].concat(CITIES.map(function (c) { return [c, c, cityCount(c)]; })), "city"));
        if (!f.city || f.city === "Calgary") v.chips.appendChild(pillRow("Quadrant", [["", "All"]].concat(QUADS.map(function (q) { return [q, q]; })), "quad"));
        var comms = Object.keys(S.dir.communities).filter(function (n) { var c = S.dir.communities[n]; return (!f.city || c.city === f.city) && (!f.quad || c.quadrant === f.quad); }).sort();
        var sel = h("select", { class: "bl-sel", "aria-label": "Community" }, [h("option", { value: "", text: "All communities" })].concat(comms.map(function (n) { return h("option", { value: n, text: n }); }))); sel.value = f.comm; sel.addEventListener("change", function () { f.comm = sel.value; v.refresh(true); });
        var hs = h("select", { class: "bl-sel", "aria-label": "Email status" }, [["", "Any email status"], ["ok", "Checked and fine"], ["warn", "Needs my confirmation"], ["unknown", "Not checked yet"], ["bad", "Will not work"], ["noemail", "No email found"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); })); hs.value = f.health; hs.addEventListener("change", function () { f.health = hs.value; v.refresh(true); });
        var vw = h("div", { class: "bl-chips" }, [sel, hs, h("span", { style: "flex:1" }), pillRow("View", [["builder", "By builder"], ["area", "By area"]], "view")]);
        v.chips.appendChild(vw);
        v.chips.appendChild(h("div", { class: "bl-row" }, [U.btn("Add builder", "sm pri", function () { openBuilder(null); }, "plus"), U.btn("Check all emails", "sm", function () { checkAll(); }), U.btn("Export CSV", "sm", function () { U.csvDownload("builders-" + B.todayIso() + ".csv", B.toCsv(B.EXPORT_COLS, B.exportRows(S.dir))); }, "down"), U.btn("Import CSV", "sm", function () { importSheet(); }, "up"), h("span", { class: "fnt tn", id: "dirCount" })]));
      }
      var cnt = document.getElementById("dirCount"); if (cnt) cnt.textContent = U.plural(list.length, "builder") + " shown";
      v.list.textContent = "";
      if (!all.length) { v.list.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "No builders yet" }), U.btn("Add builder", "pri", function () { openBuilder(null); })])); return; }
      if (f.view === "area") { v.list.appendChild(areaView(list)); return; }
      if (!list.length) { v.list.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "Nothing matches" }), h("span", { text: "Try clearing a filter." })])); return; }
      var wrap = h("div", { class: "bl-grid" }); wrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(100%, 420px), 1fr))";
      list.forEach(function (b) { wrap.appendChild(builderCard(b)); }); v.list.appendChild(wrap);
    }
  };
  function checkAll() {
    U.toast("Checking mail servers…");
    BA.checkEmails().then(function (st) { U.toast("Checked " + U.plural(st.done, "domain") + (st.bad ? ", " + st.bad + " cannot receive mail" : "") + (st.unknown ? ", " + st.unknown + " could not be checked (try again)" : "") + "."); U.refresh(); });
  }

  /* ---------- contact sheet ---------- */
  var ROLES = ["sales", "general", "marketing", "person", "service", "careers"], SRC = [["official", "Builder's own website"], ["builder-stated", "Builder told us"], ["directory", "Directory or listing site"], ["conflict", "Sources disagree"], ["manual", "I added it"]];
  function openContact(id, builderId) {
    var c = id ? U.byId(S.dir.contacts, id) : null, bid = c ? c.builderId : builderId;
    U.sheet.open({ title: c ? "Edit email" : "Add email", type: "contact", render: function (body) {
      var hh = c ? B.health(c) : null;
      var em = U.field("Email", { value: c ? c.email : "", kind: "email", inputmode: "email", wide: true, hint: c ? "" : "Format is checked as you save. Then use Check this address." }), nm = U.field("Contact name (optional)", { value: c ? c.name : "" }), rl = U.field("Role", { kind: "select", options: ROLES, value: c ? c.role : "general" });
      var st = U.field("Where this address came from", { kind: "select", options: SRC, value: c && c.src ? c.src.type : "manual" }), su = U.field("Source page link", { value: c && c.src ? c.src.url || "" : "", kind: "url", wide: true, ph: "https://" }), mo = U.check("Include in the monthly ask", c ? c.monthly : true);
      var form = h("div", { class: "bl-f" }, [em, nm, rl, st, su]);
      if (hh) body.appendChild(h("div", { class: "bl-line" }, [U.chip(hh.text, U.healthCls(hh)), c.h && c.h.mxAt ? h("span", { class: "fnt", style: "font-size:13px", text: "Mail server checked " + U.ago(c.h.mxAt) }) : null]));
      body.appendChild(form); body.appendChild(mo);
      var msg = h("div", { role: "alert" }); body.appendChild(msg);
      var acts = h("div", { class: "bl-row" });
      acts.appendChild(U.btn("Save", "pri", function () {
        msg.textContent = ""; var s = B.emailSyntax(em.input.value);
        if (!s.ok) { msg.className = "bl-warn bad"; msg.textContent = "That email isn't valid: " + s.reason + "."; return; }
        var src = { type: st.input.value, url: su.input.value.trim() };
        if (c) { var dup = S.dir.contacts.filter(function (x) { return x.id !== c.id && B.normEmail(x.email) === s.email; })[0]; if (dup) { msg.className = "bl-warn bad"; msg.textContent = "That address is already saved for " + U.builderName(dup.builderId) + "."; return; }
          BA.patchContact(c.id, { email: s.email, name: nm.input.value.trim(), role: rl.input.value, monthly: mo.input.checked && B.roleOk(rl.input.value), src: Object.assign({}, c.src, src) }, s.email !== c.email ? { mx: null, mxAt: null, bounced: null, confirmed: BA.nowIso() } : null); }
        else { var r = BA.addContact(bid, s.email, nm.input.value.trim(), rl.input.value, src); if (!r.ok) { msg.className = "bl-warn bad"; msg.textContent = r.why + "."; return; } if (!mo.input.checked) BA.patchContact(r.id, { monthly: false }); }
        U.sheet.close(); U.refresh(); U.toast("Saved.");
      }));
      if (c) {
        acts.appendChild(U.btn("Check this address", "", function () { BA.checkEmails([c.id]).then(function (r) { var cc = U.byId(S.dir.contacts, c.id), x = B.health(cc); U.toast(x.text + "."); U.sheet.redraw(); U.refresh(); }); }));
        if (hh.key === "unverified") acts.appendChild(U.btn("Source is right", "", function () { BA.patchContact(c.id, null, { confirmed: BA.nowIso() }); U.sheet.close(); U.refresh(); }));
        if (c.h && (c.h.optOut || c.h.bounced)) acts.appendChild(U.btn("Clear " + (c.h.optOut ? "opt-out" : "bounce") + " flag", "", function () { BA.patchContact(c.id, null, { optOut: null, bounced: null }); U.sheet.close(); U.refresh(); }));
        acts.appendChild(U.btn("Remove", "dng", function () { var snap = B.clone(c); BA.removeContact(c.id); U.sheet.close(); U.refresh(); U.toast("Email removed.", "Undo", function () { BA.mutate("dir", function (d) { if (!d.contacts.some(function (x) { return x.id === snap.id; })) d.contacts.push(B.clone(snap)); }); U.refresh(); }); }));
      }
      body.appendChild(acts);
    } });
  }
  U.openContact = openContact;

  /* ---------- builder sheet ---------- */
  function openBuilder(id) {
    var b = id ? U.byId(S.dir.builders, id) : null, chosen = {}; if (b) B.areasOf(S.dir, b.id).forEach(function (n) { chosen[n] = 1; });
    U.sheet.open({ title: b ? b.name : "Add builder", type: "builder", render: function (body) {
      var nm = U.field("Builder name", { value: b ? b.name : "", wide: true }), ws = U.field("Website", { value: b ? b.website : "", kind: "url", ph: "https://" }), cp = U.field("Contact page (where an email or form is)", { value: b ? b.contactPage : "", kind: "url", ph: "https://" });
      var stt = U.field("Status", { kind: "select", options: [["active", "Active"], ["paused", "Paused (not emailed)"]], value: b ? b.status : "active" }), nt = U.field("Notes", { kind: "textarea", value: b ? b.notes : "", wide: true, rows: 2 });
      body.appendChild(h("div", { class: "bl-f" }, [nm, ws, cp, stt, nt]));
      body.appendChild(h("h3", { class: "mut", text: "Communities this builder works in" }));
      var q = h("input", { type: "search", class: "bl-sel", placeholder: "Filter communities", "aria-label": "Filter communities", style: "width:100%" }), box = h("div", { class: "bl-list", style: "gap:4px;max-height:260px;overflow:auto;padding:4px" });
      function drawBox() {
        box.textContent = ""; var t = q.value.trim().toLowerCase(), names = Object.keys(S.dir.communities).filter(function (n) { return !t || n.toLowerCase().indexOf(t) >= 0; });
        var groups = {}; names.forEach(function (n) { var c = S.dir.communities[n], k = c.city === "Calgary" ? (c.quadrant ? c.quadrant + " Calgary" : "Calgary") : c.city; (groups[k] = groups[k] || []).push(n); });
        Object.keys(groups).sort().forEach(function (k) {
          box.appendChild(h("div", { class: "bl-quad", text: k.toUpperCase() }));
          groups[k].sort().forEach(function (n) { var cb = U.check(n, chosen[n]); cb.input.addEventListener("change", function () { if (cb.input.checked) chosen[n] = 1; else delete chosen[n]; }); box.appendChild(cb); });
        });
        if (!names.length) box.appendChild(h("span", { class: "fnt", text: "No match. Add it below." }));
      }
      q.addEventListener("input", drawBox); drawBox(); body.appendChild(q); body.appendChild(box);
      var an = U.field("New community", { ph: "Name" }), ac = U.field("City", { kind: "select", options: ["Calgary", "Airdrie", "Chestermere", "Cochrane", "Okotoks", "Other"], value: "Calgary" }), aq = U.field("Quadrant (Calgary only)", { kind: "select", options: [["", "Not sure"]].concat(QUADS) });
      body.appendChild(h("details", { class: "bl-det" }, [h("summary", { text: "Community not in the list? Add it" }), h("div", { class: "bl-f" }, [an, ac, aq, h("div", { class: "bl-row wide" }, [U.btn("Add community", "sm", function () { var n = an.input.value.trim(); if (!n) return; BA.setCommunity(n, { city: ac.input.value, quadrant: ac.input.value === "Calgary" ? aq.input.value : "", review: ac.input.value === "Calgary" && !aq.input.value }); chosen[n] = 1; an.input.value = ""; drawBox(); U.toast(n + " added."); })])])]));
      var msg = h("div", { role: "alert" }); body.appendChild(msg);
      body.appendChild(h("div", { class: "bl-row" }, [U.btn("Save", "pri", function () {
        var name = nm.input.value.trim(); if (!name) { msg.className = "bl-warn bad"; msg.textContent = "Add the builder's name."; return; }
        var bid = b ? b.id : BA.addBuilder(name, ws.input.value.trim());
        BA.patchBuilder(bid, { name: name, website: ws.input.value.trim(), contactPage: cp.input.value.trim(), status: stt.input.value, notes: nt.input.value.trim() }); BA.setAreas(bid, Object.keys(chosen));
        U.sheet.close(); U.refresh(); U.toast("Saved."); if (!b) U.openContact(null, bid);
      })]));
    } });
  }
  U.openBuilder = openBuilder;

  /* ---------- CSV import ---------- */
  function importSheet() {
    U.sheet.open({ title: "Import builders and emails", type: "import", render: function (body) {
      body.appendChild(h("p", { class: "bl-sub", text: "A CSV with columns: builder, email, contactName, role, website, source. Existing emails are only updated (name and role), never duplicated." }));
      var file = h("input", { type: "file", accept: ".csv,text/csv", "aria-label": "Choose a CSV file" }), out = h("div");
      file.addEventListener("change", function () {
        var f = file.files && file.files[0]; if (!f) return;
        if (f.size > 2000000) { out.className = "bl-warn bad"; out.textContent = "That file is too large for a builders list."; return; }
        f.text().then(function (t) { var rows = B.parseCsv(t), res = BA.importRows(rows); out.className = "bl-warn ok"; out.textContent = ""; out.appendChild(h("span", { text: res.added + " added, " + res.updated + " updated" + (res.skipped.length ? ", " + res.skipped.length + " skipped." : ".") })); if (res.skipped.length) out.appendChild(h("ul", {}, res.skipped.slice(0, 8).map(function (s) { return h("li", { text: s }); }))); U.refresh(); });
      });
      body.appendChild(file); body.appendChild(out);
    } });
  }

  /* ================= Send the monthly ask ================= */
  function openSend() {
    var sel = null, preview = {}, anyTime = false;
    U.sheet.open({ title: BA.status().label + " ask", type: "send", sticky: false, render: function (body, ctx) {
      var Mail = window.CDMail, snd = S.sending, pre = B.preflight(S.mail, S.dir), batch = BA.batch(), st = BA.status();
      if (snd) { ctx.opts.sticky = snd.active; }
      /* progress */
      if (snd && (snd.active || snd.log.length || snd.reason)) {
        var pct = snd.total ? Math.round((snd.done + snd.failed) * 100 / snd.total) : 0;
        body.appendChild(h("div", { class: "bl-card" }, [h("h3", { text: snd.active ? "Sending" : "Finished" }),
          h("div", { class: "bl-bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Send progress", style: "background:var(--line)" }, [h("i", { style: "width:" + Math.max(pct, snd.active ? 3 : 0) + "%;background:var(--accent)" })]),
          h("p", { class: "bl-sub tn", text: snd.done + " of " + snd.total + " sent" + (snd.failed ? " · " + snd.failed + " need a look" : "") + (snd.active && snd.current ? " · now: " + snd.current : "") }),
          snd.active && snd.nextAt ? h("p", { class: "bl-sub", text: "Next one in a few seconds. A short pause between emails keeps Gmail happy. Keep this page open." }) : null,
          snd.reason && !snd.active && snd.reason !== "done" ? h("div", { class: "bl-warn" }, [h("span", { text: snd.reason })]) : null,
          snd.reason === "done" && !snd.active ? h("div", { class: "bl-warn ok" }, [h("span", { text: "All done. Builders reply to your Gmail. Come back in a day or two and tap Check replies." })]) : null,
          h("div", { class: "bl-row" }, [snd.active ? U.btn("Stop after this one", "dng", function () { BA.stopSend(); }) : U.btn("Close", "pri", function () { S.sending = null; U.sheet.close(); U.refresh(); })])]));
        if (!snd.active) { var lg = snd.log.filter(function (x) { return x.st !== "sent"; }); if (lg.length) body.appendChild(h("div", { class: "bl-list" }, lg.map(function (x) { var c = U.byId(S.dir.contacts, x.id); return h("div", { class: "bl-line" }, [U.chip(x.st, x.st === "fail" ? "bad" : "warn"), h("span", { class: "bl-em", text: c ? c.email : x.id }), h("span", { class: "mut", text: x.why || "" })]); }))); }
        if (snd.active) return;
      }
      if (!sel) { sel = {}; batch.ready.forEach(function (x) { sel[x.contact.id] = !x.weak; }); }
      body.appendChild(h("p", { class: "bl-sub", text: "Nothing is sent until you tap Send below. Review who gets it. Each email goes one at a time, with a short random pause." }));
      if (pre.length) body.appendChild(h("div", { class: "bl-warn bad" }, [h("b", { text: "Fix before sending" }), h("ul", {}, pre.map(function (p) { return h("li", { text: p }); })), h("a", { class: "bl-btn sm", href: "index.html#more", text: "Open Email settings" })]));
      var conn = !!Mail.token();
      if (!conn) body.appendChild(h("div", { class: "bl-warn info" }, [h("span", { text: "Connect Gmail first. Google will ask to send email as you, and to read replies so they can be sorted for you." }), U.btn("Connect Gmail", "sm pri", function () { doConnect(); }, "mail")]));
      else body.appendChild(h("div", { class: "bl-line" }, [U.chip("Gmail: " + Mail.email(), S.wrongAccount ? "bad" : "ok"), Mail.canRead() ? U.chip("Can read replies", "ok") : U.chip("Send only", "warn")]));
      if (!B.inWindow(S.dir.settings, new Date())) { var oc = U.check("Send now even though it is outside my sending hours (" + S.dir.settings.winStart + ":00 to " + S.dir.settings.winEnd + ":00)", anyTime); oc.input.addEventListener("change", function () { anyTime = oc.input.checked; if (ctx.upd) ctx.upd(); }); body.appendChild(oc); }
      var used = B.sentInLast24h(S.dir, new Date()), cap = +S.dir.settings.dailyCap || 25;
      if (used) body.appendChild(h("p", { class: "bl-sub", text: used + " already sent in the last 24 hours. Daily limit: " + cap + "." }));
      /* recipients */
      var ready = batch.ready; body.appendChild(h("h3", { class: "mut", text: U.plural(ready.length, "recipient") }));
      if (!ready.length) body.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "No one is ready to email" }), h("span", { text: "Builders need a valid, checked email that is on the monthly list." })]));
      ready.forEach(function (x) {
        var c = x.contact, id = c.id, cb = h("input", { type: "checkbox", id: "rc_" + id, "aria-label": "Send to " + x.builder.name }); cb.checked = !!sel[id]; cb.disabled = x.weak;
        cb.addEventListener("change", function () { sel[id] = cb.checked; ctx.upd(); });
        var row = h("div", { class: "bl-rcp" }, [cb, h("div", { style: "min-width:0" }, [
          h("div", { class: "bl-line" }, [h("b", { text: x.builder.name }), x.weak ? U.chip("Confirm the source first", "warn") : null]), h("div", { class: "m", text: c.email + (c.name ? " · " + c.name : "") }),
          h("div", { class: "bl-row" }, [x.weak ? U.btn("Source is right", "sm", function () { BA.patchContact(c.id, null, { confirmed: BA.nowIso() }); sel = null; U.sheet.redraw(); }) : null,
            U.btn(preview[id] ? "Hide email" : "Preview email", "sm", function () { preview[id] = !preview[id]; U.sheet.redraw(); })]),
          preview[id] ? h("div", { class: "bl-pre", text: "To: " + x.msg.to + "\nSubject: " + x.msg.subject + "\n\n" + x.msg.text }) : null])]);
        if (x.msg.missing.length) row.lastChild.insertBefore(h("div", { class: "bl-warn bad", text: "Missing: " + x.msg.missing.join(", ") }), row.lastChild.children[2]);
        body.appendChild(row);
      });
      if (batch.skipped.length) body.appendChild(h("details", { class: "bl-det" }, [h("summary", { text: U.plural(batch.skipped.length, "address") + " skipped" }), h("div", { class: "bl-list" }, batch.skipped.map(function (x) { return h("div", { class: "bl-line" }, [h("span", { class: "bl-em", text: x.contact.email }), h("span", { class: "mut", style: "font-size:13px", text: (x.builder ? x.builder.name + ": " : "") + x.why })]); }))]));
      var go = h("div", { class: "bl-row", style: "position:sticky;bottom:-4px;background:var(--surface);padding:10px 0" }), sb = U.btn("", "pri", function () {
        var picks = ready.filter(function (x) { return sel[x.contact.id] && !x.weak && !x.msg.missing.length; }); if (!picks.length) return;
        var cn = S.dir.settings, mins = Math.max(1, Math.round(picks.length * ((+cn.paceMin + +cn.paceMax) / 2) / 60));
        BA.send(picks, { anyTime: anyTime }).then(function () { U.sheet.redraw(); U.refresh(); }); U.sheet.redraw(); void mins;
      }, "send");
      ctx.upd = function () { var n = ready.filter(function (x) { return sel[x.contact.id] && !x.weak && !x.msg.missing.length; }).length, cn = S.dir.settings, mins = Math.max(1, Math.round(n * ((+cn.paceMin + +cn.paceMax) / 2) / 60)); sb.lastChild.textContent = n ? "Send " + n + " email" + (n === 1 ? "" : "s") : "Nothing selected"; var closed = !B.inWindow(S.dir.settings, new Date()) && !anyTime; sb.disabled = !n || !!pre.length || !conn || S.wrongAccount || closed; go.querySelector(".est").textContent = closed ? "Outside your sending hours. Tick the box above to send now." : n ? "About " + U.plural(mins, "minute") + ". Keep this page open." : ""; };
      go.appendChild(sb); go.appendChild(h("span", { class: "est mut", style: "font-size:13px" })); body.appendChild(go); ctx.upd(); void st;
    } });
  }
  U.openSend = openSend;

  /* ================= start ================= */
  function boot() {
    build(); setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    var t = (location.hash || "").replace("#", ""); U.st.tab = TABS.indexOf(t) >= 0 ? t : "overview";
    renderTop(); renderHello(); renderSeg(); mountTab();
    BA.on(function () { U.refresh(); });
    window.addEventListener("hashchange", function () { var t = (location.hash || "").replace("#", ""); if (TABS.indexOf(t) >= 0 && t !== U.st.tab) { U.st.tab = t; mountTab(); renderSeg(); window.scrollTo(0, 0); } });
    BA.preload(); BA.load().then(function () { if (S.dir) { BA.prune(); mountTab(); } });
    setInterval(function () { if (document.visibilityState === "visible" && !BA.pending() && !U.sheet.isOpen() && !U.typing() && Date.now() - S.loadedAt > 90000) BA.load(); }, 60000);
    window.addEventListener("beforeunload", function (e) { if (BA.pending() || (S.sending && S.sending.active)) { e.preventDefault(); e.returnValue = ""; } });
  }
  function toLogin() { try { window.location.replace("index.html"); } catch (e) {} }
  if (!Store || !Store.configured()) { toLogin(); return; }
  Store.getSession().then(function (sess) { if (!sess) { toLogin(); return; } boot(); }, function () {});
  Store.onAuth(function (ev, sess) { if (ev === "SIGNED_OUT" || (!sess && ev !== "INITIAL_SESSION")) setTimeout(toLogin, 0); });
})();
