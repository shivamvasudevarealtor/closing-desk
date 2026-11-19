/* Builders: Deals, Replies, Settings, and the sheets they open (deal form, PDF, paste a reply). */
(function () {
  "use strict";
  var B = window.BLD, BA = window.BLDAPP, U = window.BLU, h = U.h, S = BA.S;
  var QUADS = B.QUADS, CITIES = ["Calgary", "Airdrie", "Chestermere", "Cochrane", "Okotoks", "Other"];
  function num(v) { v = String(v == null ? "" : v).replace(/[$,\s]/g, ""); if (v === "") return null; var n = Number(v); return isNaN(n) ? NaN : n; }
  function pillRow(label, items, get, set) {
    var row = h("div", { class: "bl-chips", role: "group", "aria-label": label }, [h("span", { class: "lb", text: label })]);
    items.forEach(function (it) { var b = h("button", { type: "button", class: "bl-pill", "aria-pressed": String(get() === it[0]) }, [it[1], it[2] != null ? " " : null, it[2] != null ? h("span", { class: "c", text: String(it[2]) }) : null]); b.addEventListener("click", function () { set(get() === it[0] && it[0] !== "" ? "" : it[0]); }); row.appendChild(b); });
    return row;
  }
  function copy(text) {
    return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { return true; }, function () {
      var t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} t.remove(); return ok;
    });
  }

  /* ================= deal form (edit + add) ================= */
  function dealForm(d, adding) {
    var F = {}, dir = S.dir;
    var dl = h("datalist", { id: "dlComm" }, Object.keys(dir.communities).sort().map(function (n) { return h("option", { value: n }); }));
    var ht = h("datalist", { id: "dlHome" }, ["duplex", "laned", "front garage", "townhome", "bungalow", "estate", "condo", "detached", "single family"].map(function (n) { return h("option", { value: n }); }));
    function f(k, label, o) { o = o || {}; o.value = o.value != null ? o.value : (d[k] == null ? "" : d[k]); F[k] = U.field(label, o); return F[k]; }
    var list = [];
    if (adding) list.push((F.builderId = U.field("Builder", { kind: "select", options: [["", "Choose…"]].concat(dir.builders.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (b) { return [b.id, b.name]; })), value: d.builderId || "" })));
    list.push(f("type", "Type", { kind: "select", options: B.DEAL_TYPES }), f("state", "Status", { kind: "select", options: B.DEAL_STATES }),
      f("community", "Community", { list: "dlComm" }), f("city", "City", { kind: "select", options: [["", "—"]].concat(CITIES) }), f("quadrant", "Quadrant (Calgary)", { kind: "select", options: [["", "—"]].concat(QUADS) }),
      f("address", "Address", { wide: true }), f("lot", "Lot or plan"), f("homeType", "Home type", { list: "dlHome" }),
      f("beds", "Bedrooms", { kind: "number" }), f("baths", "Bathrooms", { kind: "number" }), f("sqft", "Size (sq ft)", { kind: "number" }),
      f("price", "Price ($)", { kind: "number" }), f("priceNote", "Price note", { ph: "e.g. plus GST" }),
      f("possession", "Possession", { ph: "Quick possession, or Spring 2027" }), f("possessionDate", "Possession date", { kind: "date" }), f("validUntil", "Offer ends", { kind: "date" }),
      f("incentives", "What's included (one per line)", { kind: "textarea", wide: true, rows: 3, value: (d.incentives || []).join("\n") }),
      f("contactName", "Builder contact"), f("contactPhone", "Contact phone"), f("contactEmail", "Contact email", { kind: "email" }),
      f("commission", "Commission or referral note. Internal only: never in a PDF or client message.", { kind: "textarea", wide: true, rows: 2 }));
    F.possessionDate.input.value = /^\d{4}-\d{2}-\d{2}$/.test(d.possessionDate || "") ? d.possessionDate : "";
    var initPD = F.possessionDate.input.value;
    var form = h("div", { class: "bl-f" }, list.concat([dl, ht]));
    function read() {
      var p = {}, err = [];
      function t(k) { p[k] = F[k].input.value.trim(); }
      ["type", "state", "community", "city", "quadrant", "address", "lot", "homeType", "priceNote", "possession", "possessionDate", "validUntil", "contactName", "contactPhone", "commission"].forEach(t);
      if (F.possessionDate.input.value === initPD) delete p.possessionDate;
      p.contactEmail = B.normEmail(F.contactEmail.input.value);
      if (p.contactEmail && !B.emailSyntax(p.contactEmail).ok) err.push("Contact email is not valid.");
      [["beds", "Bedrooms"], ["baths", "Bathrooms"], ["sqft", "Size"], ["price", "Price"]].forEach(function (x) { var n = num(F[x[0]].input.value); if (isNaN(n) || (n != null && n < 0)) err.push(x[1] + " must be a number."); else p[x[0]] = n; });
      if (p.price != null && (p.price < 1000 || p.price > 50000000)) err.push("Price looks wrong. Enter the full dollar amount, for example 549900.");
      p.incentives = F.incentives.input.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      if (p.city !== "Calgary") p.quadrant = "";
      var info = p.community && S.dir.communities[p.community];
      if (info && p.community !== d.community) { p.city = info.city; p.quadrant = info.city === "Calgary" ? info.quadrant || "" : ""; }
      if (adding) { p.builderId = F.builderId.input.value; if (!p.builderId) err.push("Choose the builder."); }
      if (adding && !(p.address || p.lot || p.community || p.incentives.length)) err.push("Add at least an address, lot, community or what's included.");
      return { patch: p, err: err };
    }
    return { el: form, read: read };
  }

  /* ================= PDF ================= */
  function mailForPdf() { return Object.assign({}, S.mail, { email: S.dir.settings.account || "" }); }
  function pdfSheet(ids) {
    var deals = ids.map(function (id) { return U.byId(S.deals.deals, id); }).filter(Boolean); if (!deals.length) return;
    U.sheet.open({ title: deals.length === 1 ? "Client PDF" : "Client PDF · " + deals.length + " homes", type: "pdf", render: function (body, ctx) {
      var show = ctx.show == null ? !!S.dir.settings.showName : ctx.show, mail = mailForPdf(), models = deals.map(function (d) { return B.dealPdfModel(d, U.byId(S.dir.builders, d.builderId), mail, new Date(), { showName: show }); });
      body.appendChild(h("p", { class: "bl-sub", text: "One page per home with the facts the builder gave you, the date, and a note to confirm in writing. Commission and your notes are never included." }));
      var miss = []; deals.forEach(function (d, i) { var g = B.gaps(d); if (g.length) miss.push((d.address || d.lot || d.community || "Deal " + (i + 1)) + ": no " + g.join(", ")); });
      if (miss.length) body.appendChild(h("div", { class: "bl-warn" }, [h("b", { text: "Missing details" }), h("ul", {}, miss.map(function (m) { return h("li", { text: m }); })), h("span", { text: "The PDF will leave those out. Fix them in Deals, or ask the builder." })]));
      if (!S.mail.brokerage || !S.mail.phone) body.appendChild(h("div", { class: "bl-warn" }, [h("span", { text: "Your brokerage name and phone show on the PDF. Add them in Settings, Email." })]));
      var cb = U.check("Show my name on the PDF", show); cb.input.addEventListener("change", function () { ctx.show = cb.input.checked; U.sheet.redraw(); }); body.appendChild(cb);
      models.slice(0, 3).forEach(function (m) {
        var box = h("div", { class: "bl-card" }, [h("h3", { text: m.title }), h("b", { style: "font-family:var(--disp);font-size:18px", text: m.headline || "Home details" }), m.price ? h("span", { class: "bl-chip gold", text: m.price }) : null]);
        m.rows.forEach(function (r) { box.appendChild(h("div", { class: "bl-line" }, [h("span", { class: "fnt", style: "width:110px;font-size:12px;text-transform:uppercase;letter-spacing:.05em", text: r[0] }), h("span", { text: r[1] })])); });
        if (m.incentives.length) box.appendChild(h("div", { class: "mut", style: "font-size:13px", text: "Included: " + m.incentives.join("; ") }));
        body.appendChild(box);
      });
      if (models.length > 3) body.appendChild(h("p", { class: "fnt", text: "+ " + (models.length - 3) + " more pages" }));
      var msg = h("div", { role: "status" }); body.appendChild(msg);
      var acts = h("div", { class: "bl-row" });
      var mk = U.btn(models.length === 1 ? "Make PDF" : "Make " + models.length + "-page PDF", "pri", function () {
        mk.disabled = true; msg.className = "bl-warn info"; msg.textContent = "Making the PDF…";
        window.BLDPDF.make(models, { brokerage: S.mail.brokerage }).then(function (res) { return window.BLDPDF.deliver(res).then(function (how) { msg.className = "bl-warn ok"; msg.textContent = how === "cancelled" ? "Cancelled." : (how === "shared" ? "Shared. " : "Saved to your downloads. ") + res.name; }); }, function (e) { msg.className = "bl-warn bad"; msg.textContent = (e && e.message) || "Could not make the PDF."; }).then(function () { mk.disabled = false; });
      }, "pdf");
      acts.appendChild(mk);
      if (deals.length === 1) acts.appendChild(U.btn("Copy a message for the client", "", function () { copy(B.clientBlurb(deals[0], U.byId(S.dir.builders, deals[0].builderId), mail, new Date())).then(function (ok) { U.toast(ok ? "Message copied." : "Could not copy. Select the text and copy it yourself."); }); }));
      body.appendChild(acts);
    } });
  }
  U.pdfSheet = pdfSheet;

  /* ================= Deals ================= */
  var STATES = [["open", "Open"], ["new", "New"], ["reviewed", "Reviewed"], ["active", "Active"], ["sold", "Sold"], ["expired", "Expired"], ["dismissed", "Dismissed"], ["all", "All"]];
  var COLS = [["", ""], ["Builder"], ["Community"], ["City"], ["Qd"], ["Address / lot"], ["Type"], ["Home"], ["Bd", "r"], ["Ba", "r"], ["Sq ft", "r"], ["Price", "r"], ["Possession"], ["Ends"], ["Status"]];
  function dealFilters() { var f = U.st.deals, o = Object.assign({}, f); delete o.sort; delete o.more; delete o.sel; delete o.open; return o; }
  function visibleDeals() { var f = U.st.deals; return B.sortDeals(B.filterDeals(S.deals.deals, dealFilters(), S.dir, B.todayIso()), f.sort); }
  function activeCount() { var f = U.st.deals, n = 0; ["q", "type", "city", "quadrant", "community", "builder", "homeType", "minPrice", "maxPrice", "beds", "possession", "endingDays"].forEach(function (k) { if (f[k]) n++; }); if (f.missing) n++; if (f.state !== "open") n++; return n; }
  function dealRow(d, f, t) {
    var st = B.dealStatus(d, t), isOpen = f.open === d.id, sel = !!f.sel[d.id], b = U.byId(S.dir.builders, d.builderId), g = B.gaps(d);
    function td(label, v, cls) { var e = v == null || v === ""; return h("td", { "data-l": label, class: (cls || "") + (e ? " e" : "") }, [e ? h("span", { class: "nul", text: "—" }) : (typeof v === "string" || typeof v === "number" ? String(v) : v)]); }
    var pick = h("td", { class: "pick" }, [h("input", { type: "checkbox", "aria-label": "Select " + (d.address || d.community || "deal") })]); pick.firstChild.checked = sel;
    pick.firstChild.addEventListener("change", function (e) { e.stopPropagation(); if (e.target.checked) f.sel[d.id] = 1; else delete f.sel[d.id]; U.views.deals.refresh(true); });
    pick.addEventListener("click", function (e) { e.stopPropagation(); });
    var addr = d.address || d.lot || (d.type !== "spec" && d.incentives && d.incentives[0] ? d.incentives[0].slice(0, 80) : "") || (d.description || "").slice(0, 80);
    var btn = h("button", { type: "button", class: "bl-btn sm", style: "min-height:32px;padding:0 8px;border:0;background:transparent;text-align:left;font-weight:700", "aria-expanded": String(isOpen), text: addr || "Details" });
    var typeName = (B.DEAL_TYPES.filter(function (x) { return x[0] === d.type; })[0] || [0, d.type])[1];
    var stChip = U.chip(st === "new" ? "New" : st.charAt(0).toUpperCase() + st.slice(1), st === "new" ? "gold" : st === "active" || st === "reviewed" ? "ok" : st === "expired" || st === "sold" ? "warn" : "");
    var tr = h("tr", { class: "d" + (isOpen ? " open" : ""), "data-id": d.id }, [pick, td("Builder", b ? b.name : ""), td("Community", d.community), td("City", d.city), td("Quadrant", d.quadrant), h("td", { class: "big", "data-l": "Address" }, [btn]),
      td("Type", h("span", {}, [U.chip(typeName.split(" /")[0], d.type === "spec" ? "cal" : d.type === "incentive" ? "ai" : "")])), td("Home type", d.homeType), td("Beds", d.beds, "r"), td("Baths", d.baths, "r"), td("Sq ft", d.sqft ? d.sqft.toLocaleString("en-CA") : "", "r"),
      td("Price", d.price ? B.money(d.price) : "", "price r"), td("Possession", d.possession), td("Offer ends", d.validUntil ? B.fmtDate(d.validUntil) : ""), h("td", { "data-l": "Status" }, [stChip, g.length && d.type === "spec" ? U.chip("Missing " + g.length, "warn") : null, B.stale(d, t) ? U.chip("Check availability", "warn") : null])]);
    tr.addEventListener("click", function () { f.open = isOpen ? null : d.id; U.views.deals.refresh(true); });
    btn.addEventListener("click", function (e) { e.stopPropagation(); f.open = isOpen ? null : d.id; U.views.deals.refresh(true); });
    return tr;
  }
  function dealDetail(d) {
    var cell = h("td", { colspan: String(COLS.length) }), f = U.st.deals, b = U.byId(S.dir.builders, d.builderId), form = dealForm(d, false), g = B.gaps(d);
    cell.appendChild(h("div", { class: "bl-list" }, [
      d.description ? h("p", { style: "margin:0;font-weight:600", text: d.description }) : null,
      g.length ? h("div", { class: "bl-line" }, [h("span", { class: "mut", text: "Missing:" })].concat(g.map(function (x) { return U.chip(x, "warn"); }))) : null,
      d.evidence ? h("details", { class: "bl-det" }, [h("summary", { text: "What the builder wrote" }), h("div", { class: "bl-pre", text: d.evidence })]) : null,
      d.source && d.source !== "manual" && U.byId(S.deals.replies, d.source) ? h("div", {}, [U.btn("Open the reply", "sm", function () { U.st.replies.f = "all"; U.st.replies.open = d.source; U.go("replies"); })]) : null,
      form.el,
      h("div", { class: "bl-row" }, [
        U.btn("Save changes", "pri", function () { var r = form.read(); if (r.err.length) { U.toast(r.err[0]); return; } var p = r.patch, ch = {}; Object.keys(p).forEach(function (k) { if (JSON.stringify(p[k]) !== JSON.stringify(d[k] == null ? (typeof p[k] === "string" ? "" : p[k]) : d[k])) ch[k] = p[k]; }); if (!Object.keys(ch).length) { U.toast("Nothing changed."); return; } BA.patchDeal(d.id, ch); U.toast("Saved."); U.views.deals.refresh(true); }),
        U.btn("Make PDF", "", function () { pdfSheet([d.id]); }, "pdf"),
        d.state !== "reviewed" && d.state !== "active" ? U.btn("Mark reviewed", "", function () { BA.patchDeal(d.id, { state: "reviewed" }); U.toast("Marked reviewed."); }) : null,
        d.state !== "sold" ? U.btn("Sold", "", function () { BA.patchDeal(d.id, { state: "sold" }); }) : null,
        d.state !== "dismissed" ? U.btn("Dismiss", "", function () { BA.patchDeal(d.id, { state: "dismissed" }); U.toast("Dismissed.", "Undo", function () { BA.patchDeal(d.id, { state: d.state }); }); }) : null,
        U.btn("Delete", "dng", function () { var snap = B.clone(d); BA.deleteDeal(d.id); f.open = null; U.toast("Deal deleted.", "Undo", function () { BA.mutate("deals", function (dd) { if (!dd.deals.some(function (x) { return x.id === snap.id; })) dd.deals.push(B.clone(snap)); }); }); })]),
      d.history && d.history.length > 1 ? h("details", { class: "bl-det" }, [h("summary", { text: "History (" + d.history.length + ")" }), h("div", { class: "bl-list", style: "gap:6px;padding-bottom:8px" }, d.history.slice().reverse().map(function (x) { return h("div", { class: "bl-sub", text: U.ago(x.at) + " · " + x.note + (x.changes ? ": " + x.changes.map(function (c) { return c.field; }).join(", ") : "") }); }))]) : null
    ]));
    void b; return h("tr", { class: "x" }, [cell]);
  }
  U.views.deals = {
    mount: function (el) {
      var v = U.views.deals, f = U.st.deals; v.el = el;
      var q = h("input", { type: "search", placeholder: "Search builder, community, address", "aria-label": "Search deals", autocomplete: "off", value: f.q }); q.addEventListener("input", function () { f.q = q.value; v.refresh(true); });
      v.bar = h("div", { class: "bl-fbar" }, [h("div", { class: "bl-search", html: U.IC.search }, [q]), (v.chips = h("div", { style: "display:flex;flex-direction:column;gap:10px" }))]);
      v.head = h("div", { class: "bl-row sp" }); v.list = h("div"); el.appendChild(v.bar); el.appendChild(v.head); el.appendChild(v.list); v.refresh();
    },
    refresh: function (listOnly) {
      var v = U.views.deals, f = U.st.deals, t = B.todayIso(); if (!v.list || !S.deals) return;
      function set(k, val) { f[k] = val; if (k === "city" && val !== "Calgary") f.quadrant = ""; v.refresh(); }
      if (!listOnly || v.dirty) {
        v.dirty = false; v.chips.textContent = ""; var fac = B.builderFacets(S.dir, S.deals.deals, t);
        v.chips.appendChild(pillRow("Status", STATES, function () { return f.state; }, function (x) { set("state", x || "open"); }));
        v.chips.appendChild(pillRow("Type", [["", "All types"]].concat(B.DEAL_TYPES.map(function (x) { return [x[0], x[1].split(" /")[0]]; })), function () { return f.type; }, function (x) { set("type", x); }));
        v.chips.appendChild(pillRow("City", [["", "All"]].concat(["Calgary", "Airdrie", "Chestermere", "Cochrane"].map(function (c) { return [c, c, fac.city[c] || 0]; })), function () { return f.city; }, function (x) { set("city", x); }));
        if (!f.city || f.city === "Calgary") v.chips.appendChild(pillRow("Quadrant", [["", "All"]].concat(QUADS.map(function (c) { return [c, c, fac.quadrant[c] || 0]; })), function () { return f.quadrant; }, function (x) { set("quadrant", x); }));
        function sel(label, key, opts) { var s = h("select", { class: "bl-sel", "aria-label": label }, opts.map(function (o) { return h("option", { value: o[0], text: o[1] }); })); s.value = f[key]; s.addEventListener("change", function () { f[key] = s.value; v.refresh(true); }); return s; }
        var comms = Object.keys(fac.community).sort(), blds = Object.keys(fac.builder).sort(function (a, b) { return U.builderName(a).localeCompare(U.builderName(b)); }), hts = Object.keys(fac.homeType).sort();
        v.chips.appendChild(h("div", { class: "bl-chips" }, [sel("Community", "community", [["", "All communities"]].concat(comms.map(function (n) { return [n, n + " (" + fac.community[n] + ")"]; }))), sel("Builder", "builder", [["", "All builders"]].concat(blds.map(function (n) { return [n, U.builderName(n) + " (" + fac.builder[n] + ")"]; }))), sel("Home type", "homeType", [["", "All home types"]].concat(hts.map(function (n) { return [n, n]; }))),
          sel("Sort", "sort", [["new", "Newest first"], ["price", "Price, low to high"], ["priceDesc", "Price, high to low"], ["ending", "Offer ending soonest"], ["community", "Community A to Z"]])]));
        var mb = h("button", { type: "button", class: "bl-pill", "aria-pressed": String(!!f.more) }, ["More filters"]); mb.addEventListener("click", function () { f.more = !f.more; v.dirty = true; v.refresh(); }); v.chips.appendChild(h("div", { class: "bl-chips" }, [mb]));
        if (f.more) {
          function inp(label, key, ph) { var i = h("input", { type: "text", inputmode: "numeric", placeholder: ph || "", value: f[key] }); i.addEventListener("input", function () { f[key] = i.value.replace(/[^0-9]/g, ""); v.refresh(true); }); return h("label", {}, [label, i]); }
          var pos = h("select", {}, [["", "Any"], ["now", "Quick possession"], ["dated", "Has a date"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); })); pos.value = f.possession; pos.addEventListener("change", function () { f.possession = pos.value; v.refresh(true); });
          var ms = h("input", { type: "checkbox" }); ms.checked = f.missing; ms.addEventListener("change", function () { f.missing = ms.checked; v.refresh(true); });
          v.chips.appendChild(h("div", { class: "bl-more" }, [inp("Price from ($)", "minPrice", "500000"), inp("Price to ($)", "maxPrice", "900000"), inp("Bedrooms at least", "beds", "3"), inp("Offer ends within (days)", "endingDays", "30"), h("label", {}, ["Possession", pos]), h("label", { class: "bl-check", style: "flex-direction:row;align-items:center" }, [ms, "Only deals with missing details"])]));
        }
      }
      var list = visibleDeals(); v.head.textContent = "";
      var n = activeCount(), picks = Object.keys(f.sel).filter(function (id) { return U.byId(S.deals.deals, id); });
      v.head.appendChild(h("span", { class: "mut tn", text: U.plural(list.length, "deal") + " shown" + (S.deals.deals.length !== list.length ? " of " + S.deals.deals.length : "") }));
      var acts = h("div", { class: "bl-row" });
      if (n) acts.appendChild(U.btn("Clear filters", "sm", function () { var keep = { sort: f.sort, sel: f.sel, open: f.open, more: f.more }; Object.assign(f, { q: "", state: "open", type: "", city: "", quadrant: "", community: "", builder: "", homeType: "", minPrice: "", maxPrice: "", beds: "", possession: "", endingDays: "", missing: false }, keep); v.dirty = true; U.rerender(); }));
      if (picks.length) acts.appendChild(U.btn("PDF of " + picks.length + " selected", "sm pri", function () { pdfSheet(picks); }, "pdf"));
      acts.appendChild(U.btn("Add deal", "sm", function () { dealAddSheet(); }, "plus")); acts.appendChild(U.btn("Export CSV", "sm", function () { U.csvDownload("deals-" + t + ".csv", B.toCsv(B.DEAL_COLS, B.dealRows(S.dir, list))); }, "down"));
      v.head.appendChild(acts);
      v.list.textContent = "";
      if (!S.deals.deals.length) { v.list.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "No deals yet" }), h("span", { text: "When builders reply to the monthly ask, their specs, quick possessions and incentives appear here as separate fields you can filter. You can also add one by hand or paste a reply." }), h("div", { class: "bl-row" }, [U.btn("Paste a reply", "pri", function () { U.pasteSheet(); }), U.btn("Add a deal", "", function () { dealAddSheet(); })])])); return; }
      if (!list.length) { v.list.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: "No deals match these filters" }), U.btn("Clear filters", "", function () { U.st.deals.state = "all"; U.st.deals.q = ""; U.rerender(); })])); return; }
      var tbl = h("table", { class: "bl-tbl" }), hd = h("tr"); COLS.forEach(function (c) { hd.appendChild(h("th", { class: c[1] || "", scope: "col", text: c[0] })); }); tbl.appendChild(h("thead", {}, [hd]));
      var tb = h("tbody"); list.slice(0, 300).forEach(function (d) { tb.appendChild(dealRow(d, f, t)); if (f.open === d.id) tb.appendChild(dealDetail(d)); }); tbl.appendChild(tb);
      v.list.appendChild(h("div", { style: "overflow-x:auto" }, [tbl]));
      if (list.length > 300) v.list.appendChild(h("p", { class: "fnt", text: "Showing the first 300. Use filters to narrow." }));
    }
  };
  function dealAddSheet() {
    var blank = B.emptyDeal();
    U.sheet.open({ title: "Add a deal", type: "dealadd", render: function (body) {
      var form = dealForm(Object.assign(blank, { state: "reviewed" }), true); body.appendChild(form.el); var msg = h("div", { role: "alert" }); body.appendChild(msg);
      body.appendChild(h("div", { class: "bl-row" }, [U.btn("Save deal", "pri", function () { var r = form.read(); if (r.err.length) { msg.className = "bl-warn bad"; msg.textContent = r.err[0]; return; } var p = r.patch; Object.keys(p).forEach(function (k) { if (p[k] === "" || p[k] == null || (Array.isArray(p[k]) && !p[k].length)) delete p[k]; }); BA.addDeal(p); U.sheet.close(); U.toast("Deal added."); U.refresh(); })]));
    } });
  }

  /* ================= paste a reply ================= */
  U.pasteSheet = function (builderId) {
    var result = null;
    U.sheet.open({ title: "Paste a reply", type: "paste", render: function (body) {
      if (result) {
        var p = result.parsed;
        body.appendChild(h("div", { class: "bl-warn ok" }, [h("b", { text: result.added ? "Found " + U.plural(result.added, "item") : "No deals found" }), h("span", { text: p.summary || "" })]));
        if (p.aiNote) body.appendChild(h("div", { class: "bl-warn info", text: p.aiNote }));
        if (p.unread) body.appendChild(h("div", { class: "bl-warn", text: p.unread + " part" + (p.unread === 1 ? "" : "s") + " of the message could not be read as a deal. Open it in Replies to check." }));
        body.appendChild(h("div", { class: "bl-row" }, [U.btn("Review in Replies", "pri", function () { U.st.replies.f = "all"; U.st.replies.open = result.rec.id; U.sheet.close(); U.go("replies"); }), U.btn("See deals", "", function () { U.sheet.close(); U.go("deals", { state: "new", builder: result.rec.builderId }); }), U.btn("Paste another", "", function () { result = null; U.sheet.redraw(); })]));
        return;
      }
      var bs = S.dir.builders.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      var bf = U.field("Which builder?", { kind: "select", options: [["", "Choose…"]].concat(bs.map(function (b) { return [b.id, b.name]; })), value: builderId || "" });
      var tf = U.field("The reply (copy it from Gmail, a text, or an email)", { kind: "textarea", rows: 9, wide: true, hint: "Quoted history and signatures are removed automatically. Nothing is sent." });
      var msg = h("div", { role: "alert" });
      body.appendChild(h("div", { class: "bl-f" }, [bf, tf])); body.appendChild(msg);
      var go = U.btn("Read it", "pri", function () {
        if (!bf.input.value) { msg.className = "bl-warn bad"; msg.textContent = "Choose the builder first."; return; }
        if (!tf.input.value.trim()) { msg.className = "bl-warn bad"; msg.textContent = "Paste the reply text first."; return; }
        go.disabled = true; msg.className = "bl-warn info"; msg.textContent = "Reading…";
        var cs = U.contactsOf(bf.input.value);
        BA.pasteReply(tf.input.value, bf.input.value, cs.length === 1 ? cs[0].id : "").then(function (r) { result = r; U.sheet.redraw(); U.refresh(); }, function (e) { go.disabled = false; msg.className = "bl-warn bad"; msg.textContent = e.message || "Could not read that."; });
      });
      body.appendChild(go);
    } });
  };

  /* ================= Replies ================= */
  var RF = [["review", "To review"], ["reply", "Replies"], ["stopbounce", "Opt-outs and bounces"], ["auto", "Automatic"], ["all", "All"]];
  function replyMatch(r, f) {
    if (f === "all") return true; if (f === "review") return r.state === "new" && (r.kind === "reply" || r.kind === "paste");
    if (f === "reply") return r.kind === "reply" || r.kind === "paste"; if (f === "stopbounce") return r.kind === "stop" || r.kind === "bounce"; if (f === "auto") return r.kind === "auto"; return true;
  }
  function replyCard(r) {
    var f = U.st.replies, isOpen = f.open === r.id, c = U.byId(S.dir.contacts, r.contactId), p = r.parse || {}, deals = (r.dealIds || []).map(function (id) { return U.byId(S.deals.deals, id); }).filter(Boolean);
    var kindChip = { reply: ["Reply", "gold"], paste: ["Pasted", "cal"], stop: ["Opt-out", "bad"], bounce: ["Bounced", "bad"], auto: ["Automatic", ""] }[r.kind] || [r.kind, ""];
    var card = h("article", { class: "bl-item" }, [
      h("div", { class: "bl-line" }, [h("h4", { text: U.builderName(r.builderId) }), U.chip(kindChip[0], kindChip[1]), r.kind === "reply" || r.kind === "paste" ? U.chip(p.method === "ai" ? "Read by Claude" : "Read by rules", p.method === "ai" ? "ai" : "") : null, r.state === "new" && (r.kind === "reply" || r.kind === "paste") ? U.chip("New", "gold") : null, h("span", { style: "flex:1" }), h("span", { class: "fnt", style: "font-size:13px", text: U.ago(r.receivedAt) })]),
      c ? h("div", { class: "mut", style: "font-size:13px", text: c.email }) : (r.from ? h("div", { class: "mut", style: "font-size:13px", text: r.from }) : null),
      p.summary ? h("p", { style: "margin:0;line-height:1.5", text: p.summary }) : null]);
    if (r.kind === "reply" || r.kind === "paste") {
      var flags = h("div", { class: "bl-line" }); flags.appendChild(U.chip(U.plural(deals.length, "deal") + " found", deals.length ? "ok" : ""));
      if (p.unread) flags.appendChild(U.chip(p.unread + " unread", "warn")); if (p.dropped && p.dropped.length) flags.appendChild(U.chip(p.dropped.length + " values left out", "warn")); card.appendChild(flags);
      if (p.aiNote) card.appendChild(h("p", { class: "bl-sub", text: p.aiNote }));
      if (p.questions && p.questions.length) card.appendChild(h("div", { class: "bl-warn info" }, [h("b", { text: "Ask the builder" }), h("ul", {}, p.questions.map(function (q) { return h("li", { text: q }); }))]));
      if (p.redirect && p.redirect.length) p.redirect.forEach(function (em) { var have = S.dir.contacts.some(function (x) { return B.normEmail(x.email) === em; }); card.appendChild(h("div", { class: "bl-line" }, [h("span", { class: "mut", text: "They suggested:" }), h("span", { class: "bl-em", text: em }), have ? U.chip("Already saved", "ok") : U.btn("Add as contact", "sm", function () { var rr = BA.addContact(r.builderId, em, "", "", { type: "builder-stated", note: "Given in a reply", url: "" }); U.toast(rr.ok ? "Contact added to the directory." : rr.why + "."); U.refresh(); })])); });
      if (p.commission && p.commission.length) card.appendChild(h("div", { class: "bl-line" }, [U.chip("Internal", "ai"), h("span", { class: "mut", style: "font-size:13px", text: "Commission note: " + p.commission.join(" | ").slice(0, 300) })]));
    }
    if (r.kind === "stop") card.appendChild(h("p", { class: "bl-sub", text: "Removed from the monthly list. This is honoured automatically." }));
    if (r.kind === "bounce") card.appendChild(h("p", { class: "bl-sub", text: "Marked as bounced. It will not be emailed again unless you clear the flag in the Directory." }));
    var acts = h("div", { class: "bl-row" });
    if (r.text || deals.length) acts.appendChild(U.btn(isOpen ? "Hide details" : "Show details", "sm", function () { f.open = isOpen ? null : r.id; U.views.replies.refresh(); }));
    if (r.state === "new" && (r.kind === "reply" || r.kind === "paste")) acts.appendChild(U.btn("Mark reviewed", "sm pri", function () { BA.patchReply(r.id, { state: "reviewed" }); }));
    if (r.threadId) acts.appendChild(h("a", { class: "bl-btn sm", href: "https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(r.threadId), target: "_blank", rel: "noopener noreferrer", text: "Open in Gmail" }));
    if (r.text && (r.kind === "reply" || r.kind === "paste")) acts.appendChild(U.btn("Read again", "sm", function () { U.toast("Reading…"); BA.reparse(r.id).then(function (x) { U.toast(x ? "Read again: " + U.plural(x.added, "item") + "." : "Could not read it."); U.refresh(); }); }));
    card.appendChild(acts);
    if (isOpen) {
      if (r.text) card.appendChild(h("div", { class: "bl-pre", text: r.text })); else if (r.pruned) card.appendChild(h("p", { class: "bl-sub", text: "The original text was cleared after 90 days. The deals stay." }));
      deals.forEach(function (d) { card.appendChild(h("div", { class: "bl-line" }, [U.chip(d.type, "cal"), h("span", { text: d.description || d.address || d.community || "" }), U.btn("Open in Deals", "sm", function () { U.st.deals.open = d.id; U.go("deals", { state: "all", q: "", builder: "", community: "" }); })])); });
    }
    return card;
  }
  U.views.replies = {
    mount: function (el) {
      var v = U.views.replies, f = U.st.replies; v.el = el;
      v.bar = h("div", { class: "bl-fbar" }); v.list = h("div", { class: "bl-list" }); el.appendChild(v.bar); el.appendChild(v.list); v.refresh();
    },
    refresh: function () {
      var v = U.views.replies, f = U.st.replies; if (!v.list || !S.deals) return; v.bar.textContent = "";
      var counts = {}; RF.forEach(function (x) { counts[x[0]] = S.deals.replies.filter(function (r) { return replyMatch(r, x[0]); }).length; });
      v.bar.appendChild(pillRow("Show", RF.map(function (x) { return [x[0], x[1], counts[x[0]]]; }), function () { return f.f; }, function (x) { f.f = x || "review"; v.refresh(); }));
      var Mail = window.CDMail, chk = S.checking;
      v.bar.appendChild(h("div", { class: "bl-row" }, [U.btn(chk && chk.active ? "Checking…" : "Check Gmail for replies", "pri", function () { U.doCheck(); }, "refresh", chk && chk.active ? { disabled: "" } : null), U.btn("Paste a reply", "", function () { U.pasteSheet(); }, "plus"), !Mail.canRead() ? h("span", { class: "fnt", style: "font-size:13px", text: "Gmail is not connected for reading. You can still paste replies." }) : null]));
      var list = S.deals.replies.filter(function (r) { return replyMatch(r, f.f); }).sort(function (a, b) { return String(b.receivedAt).localeCompare(String(a.receivedAt)); });
      v.list.textContent = "";
      if (!list.length) { v.list.appendChild(h("div", { class: "bl-empty" }, [h("b", { text: f.f === "review" ? "Nothing to review" : "Nothing here yet" }), h("span", { text: "Replies appear here after you send the monthly ask and tap Check Gmail for replies." })])); return; }
      list.slice(0, 120).forEach(function (r) { v.list.appendChild(replyCard(r)); });
    }
  };

  /* ================= Settings ================= */
  function setNum(key, min, max, el, label) {
    var n = parseInt(el.value, 10); if (isNaN(n) || n < min || n > max) { U.toast(label + " must be between " + min + " and " + max + "."); el.value = S.dir.settings[key]; return; }
    var p = {}; p[key] = n; BA.patchSettings(p);
  }
  U.views.settings = {
    mount: function (el) { U.views.settings.el = el; U.views.settings.refresh(); },
    refresh: function () {
      var el = U.views.settings.el; if (!el || !S.dir) return; var s = S.dir.settings, Mail = window.CDMail; el.textContent = "";
      function card(title, kids) { return h("section", { class: "bl-card" }, [h("h3", { text: title })].concat(kids)); }
      function numField(label, key, min, max, hint) { var f = U.field(label, { kind: "number", value: s[key], hint: hint, inputmode: "numeric" }); f.input.addEventListener("change", function () { setNum(key, min, max, f.input, label.split(" (")[0]); }); return f; }
      var day = numField("Ask me on day of the month (1 to 28)", "sendDay", 1, 28, "On this day each month the ask shows as due on Overview and Home. Nothing is sent until you tap Send."), cap = numField("Most emails in 24 hours", "dailyCap", 1, 200, "Gmail allows far more, but a low number looks like a person, not a mailing.");
      var pmin = numField("Shortest pause between emails (seconds)", "paceMin", 5, 600), pmax = numField("Longest pause (seconds)", "paceMax", 5, 900), w1 = numField("Send from hour (0 to 23, Calgary time)", "winStart", 0, 23), w2 = numField("Send until hour (1 to 24)", "winEnd", 1, 24);
      el.appendChild(card("Monthly schedule and limits", [h("div", { class: "bl-f" }, [day, cap, pmin, pmax, w1, w2])]));
      var subj = U.field("Subject", { value: s.subject, wide: true, max: 200 }), body = U.field("Message", { kind: "textarea", value: s.body, wide: true, rows: 14 }), pv = h("div", { class: "bl-pre" });
      function drawPv() {
        var c = (BA.batch().ready[0] || {}).contact || S.dir.contacts[0], bl = c && U.byId(S.dir.builders, c.builderId); if (!c || !bl) { pv.textContent = "Add a builder with an email to preview."; return; }
        var doc = Object.assign({}, S.dir, { settings: Object.assign({}, s, { subject: subj.input.value, body: body.input.value }) }), m = B.renderEmail(doc, c, bl, S.mail, BA.mk());
        pv.textContent = "To: " + m.to + "\nSubject: " + m.subject + "\n\n" + m.text + (m.missing.length ? "\n\n[Missing: " + m.missing.join(", ") + "]" : "");
      }
      function saveTpl() { BA.patchSettings({ subject: subj.input.value.trim(), body: body.input.value }); drawPv(); }
      subj.input.addEventListener("change", saveTpl); body.input.addEventListener("change", saveTpl); body.input.addEventListener("input", drawPv); subj.input.addEventListener("input", drawPv); drawPv();
      var lint = B.preflight(S.mail, Object.assign({}, S.dir, { settings: Object.assign({}, s, { body: body.input.value, subject: subj.input.value }) })).filter(function (x) { return /\{\{address\}\}|STOP|Subject/.test(x); });
      el.appendChild(card("Email text", [h("p", { class: "bl-sub", text: "Placeholders: {{greeting}} {{builder}} {{areas}} {{month}} {{brokerage}} {{phone}} {{address}}. Keep {{address}} and the STOP line: Canada's anti-spam law (CASL) needs a mailing address and a way to opt out." }), h("div", { class: "bl-f" }, [subj, body]), lint.length ? h("div", { class: "bl-warn bad" }, [h("ul", {}, lint.map(function (x) { return h("li", { text: x }); }))]) : null, h("h3", { class: "mut", text: "Preview" }), pv,
        h("div", { class: "bl-row" }, [U.btn("Reset to the standard text", "sm", function () { BA.patchSettings({ subject: B.defaultSettings().subject, body: B.DEFAULT_BODY }); U.views.settings.refresh(); U.toast("Standard text restored."); })])]));
      var acc = U.field("Gmail account to send from", { value: s.account || "", kind: "email", inputmode: "email", hint: "Sending is blocked if you connect a different Google account." }); acc.input.addEventListener("change", function () { var v = B.normEmail(acc.input.value); BA.patchSettings({ account: v }); S.wrongAccount = !!(v && Mail.email() && Mail.email() !== v); U.refresh(); });
      var show = U.check("Show my name on client PDFs", s.showName); show.input.addEventListener("change", function () { BA.patchSettings({ showName: show.input.checked }); });
      var idRows = [["Sender name", S.mail.senderName], ["Brokerage", S.mail.brokerage], ["Mailing address", S.mail.address], ["Phone", S.mail.phone], ["Google client ID", S.mail.clientId ? "Set" : ""]];
      el.appendChild(card("Gmail and who you are", [h("div", { class: "bl-f" }, [acc]), show,
        h("div", { class: "bl-list", style: "gap:6px" }, idRows.map(function (r) { return h("div", { class: "bl-line" }, [h("span", { class: "fnt", style: "width:130px;font-size:13px", text: r[0] }), r[1] ? h("span", { text: r[1] }) : U.chip("Missing", "bad")]); })),
        h("p", { class: "bl-sub", text: "These come from Email settings, so the monthly ask and your other emails always match." }), h("div", { class: "bl-row" }, [h("a", { class: "bl-btn sm", href: "index.html#more", text: "Open Email settings" }), Mail.token() ? U.btn("Disconnect Gmail", "sm", function () { BA.disconnect(); }) : U.btn("Connect Gmail", "sm pri", function () { U.doConnect(); }, "mail")]),
        h("details", { class: "bl-det" }, [h("summary", { text: "One-time Google setup for reading replies" }), h("ol", { class: "bl-sub", style: "padding-left:20px;display:flex;flex-direction:column;gap:6px" }, [h("li", { text: "In Google Cloud Console, open the project you made for Email (APIs and services)." }), h("li", { text: "Enable the Gmail API if it is not on." }), h("li", { text: "OAuth consent screen, Data access: add the scope gmail.readonly (it is a restricted scope)." }), h("li", { text: "Keep the app in Testing and add the Gmail address you send from as a test user. Google may show an 'unverified app' screen: tap Advanced, then continue." }), h("li", { text: "Back here, tap Connect Gmail and tick both boxes: send and read." })])])]));
      var ai = S.ai === "on";
      el.appendChild(card("Reading replies", [h("div", { class: "bl-line" }, [U.chip(ai ? "Claude reading is ON" : "Claude reading is OFF", ai ? "ai" : "warn"), U.chip("Simple rules always run", "ok")]),
        h("p", { class: "bl-sub", text: ai ? "Claude reads each reply. Every value it returns is checked against the email text, and anything not in the email is dropped." : "Replies are read by simple rules (addresses, prices, dates, bedrooms) and you review them. To switch on Claude reading: add your Anthropic key as the ANTHROPIC_API_KEY secret in Supabase, deploy the parse-builder-reply function, then set builderParse to true in config.js. Steps are in the README." })]));
      var rev = Object.keys(S.dir.communities).filter(function (n) { var c = S.dir.communities[n]; return c.review || B.needsQuadrant(c); });
      el.appendChild(card("Data", [h("div", { class: "bl-row" }, [U.btn("Export builders CSV", "sm", function () { U.csvDownload("builders-" + B.todayIso() + ".csv", B.toCsv(B.EXPORT_COLS, B.exportRows(S.dir))); }, "down"), U.btn("Export all deals CSV", "sm", function () { U.csvDownload("deals-" + B.todayIso() + ".csv", B.toCsv(B.DEAL_COLS, B.dealRows(S.dir, S.deals.deals))); }, "down")]),
        rev.length ? h("div", { class: "bl-warn" }, [h("span", { text: U.plural(rev.length, "community", "communities") + " need a quadrant check: " + rev.slice(0, 6).join(", ") + (rev.length > 6 ? "…" : "") }), U.btn("Check them", "sm", function () { U.go("directory", { view: "area", city: "", quad: "", comm: "", health: "" }); })]) : null,
        h("p", { class: "bl-sub", text: "Replies are kept with their text for 90 days, then only the extracted details stay." })]));
    }
  };
})();
