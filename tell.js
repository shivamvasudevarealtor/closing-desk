/* Tell Claude (v1.6): the box at the top of Today.
   1. The note is saved to the inbox table first, so it is never lost.
   2. The tell-claude Edge Function asks Claude for suggested actions. It only suggests; it never writes contacts.
   3. Shivam ticks what to keep and taps Apply. Changes to details already saved, and likely duplicates, start unticked.
   Uses only window.CDApp (the app) and window.CDStore (the database). */
(function () {
  "use strict";
  var A = window.CDApp, Store = window.CDStore;
  if (!A || !Store) return;
  var S = A.S, $ = A.$, esc = A.esc;
  var T = { uid: null, inbox: [], tasks: [], requests: [], loaded: false, setupNeeded: "", openNote: null, analyzing: null, applying: null, draft: "", ctl: 0 };
  var LABEL = { "new": "Saved", analyzing: "Reading", proposed: "Waiting for you", applied: "Applied", dismissed: "Dismissed", failed: "Not analysed" };
  var EDITABLE = ["first", "last", "phone", "email", "city", "province", "kind", "temp", "stage", "source"];
  var STOP = { the: 1, and: 1, "for": 1, with: 1, about: 1, from: 1, this: 1, that: 1, they: 1, them: 1, their: 1, want: 1, wants: 1, call: 1, called: 1, text: 1, home: 1, house: 1, today: 1, tomorrow: 1, next: 1, week: 1, "new": 1, client: 1, lead: 1, buyer: 1, seller: 1, looking: 1, budget: 1, his: 1, her: 1, she: 1, him: 1, has: 1, had: 1, was: 1, are: 1, will: 1, said: 1, met: 1, add: 1, also: 1, need: 1, needs: 1, bed: 1, bath: 1, detached: 1, duplex: 1, condo: 1, townhome: 1 };
  var NEEDS_SETUP = "Tell Claude needs its one-time setup in Supabase (see the README, Tell Claude setup).";
  var FAIL = {
    not_setup: "Tell Claude isn't set up yet. Your note is saved. Finish the setup in the README, then tap Analyse again.",
    not_configured: "The Anthropic API key isn't set in Supabase yet. Your note is saved. Add it (README, Tell Claude setup), then tap Analyse again.",
    bad_key: "Supabase has an Anthropic API key, but Anthropic rejected it. Your note is saved. Check the key, then tap Analyse again.",
    rate_limited: "Claude is busy or the API usage limit was reached. Your note is saved; try again in a minute.",
    refused: "Claude declined to analyse this note. Your note is saved.",
    invalid_json: "Claude's answer couldn't be read. Your note is saved; tap Analyse again.",
    unauthorized: "Your sign-in expired. Sign in again, then tap Analyse again.",
    too_large: "This note is too long. Split it into shorter notes."
  };

  function today() { return A.today(); }
  function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function byNewest(a, b) { return String(b.at || b.created || "").localeCompare(String(a.at || a.created || "")); }
  function noteById(id) { for (var i = 0; i < T.inbox.length; i++) if (T.inbox[i].id === id) return T.inbox[i]; return null; }
  function missingTable(e) { return e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message || "")); }

  /* ---------- data ---------- */
  function load() {
    var uid = S.user && S.user.id; T.uid = uid; T.loaded = false; T.setupNeeded = "";
    return Promise.all([Store.listDocs("inbox", 40), Store.listDocs("tasks", 300), Store.listDocs("requests", 100)]).then(function (r) {
      if (!S.user || S.user.id !== uid) return;
      T.inbox = r[0]; T.tasks = r[1]; T.requests = r[2]; T.loaded = true;
      if (!T.openNote) { var p = T.inbox.slice().sort(byNewest).filter(function (n) { return n.status === "proposed"; })[0]; if (p) T.openNote = p.id; }
      A.render();
    }, function (e) {
      T.loaded = true; T.setupNeeded = missingTable(e) ? NEEDS_SETUP : "Couldn't load your notes: " + ((e && e.message) || "unknown error");
      A.render();
    });
  }
  function putNote(n) { return Store.putDoc("inbox", n); }
  function setNote(id, fields) {
    var n = noteById(id); if (!n) return Promise.resolve();
    Object.assign(n, fields); render();
    return putNote(n).catch(function (e) { A.toast("Note not updated: " + ((e && e.message) || "error")); });
  }

  /* ---------- who the note might be about ---------- */
  function candidates(text) {
    var low = String(text).toLowerCase(), words = {};
    (low.match(/[a-zÀ-ɏ'-]{3,}/g) || []).forEach(function (w) { if (!STOP[w]) words[w] = 1; });
    var runs = (String(text).match(/\+?\d[\d\s().-]{5,}\d/g) || []).map(digits).filter(function (d) { return d.length >= 7; });
    return A.all().map(function (c) {
      var score = 0;
      [c.first, c.last].forEach(function (n) { String(n || "").toLowerCase().split(/\s+/).forEach(function (w) { if (w.length >= 3 && words[w]) score += 3; }); });
      if (c.email && low.indexOf(String(c.email).toLowerCase()) >= 0) score += 10;
      var p = digits(c.phone).slice(-7);
      if (p.length === 7 && runs.some(function (r) { return r.indexOf(p) >= 0; })) score += 10;
      return { c: c, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 12).map(function (x) {
      var c = x.c, b = c.buy || {};
      return { id: c.id, name: A.nm(c), phone: c.phone || "", email: c.email || "", city: c.city || "", stage: A.stageLabel(c), kind: c.kind || "", temp: c.temp || "", next: c.next || "",
        buyerProfile: (b.min || b.max || b.areas || (b.types || []).length) ? { min: b.min || "", max: b.max || "", areas: b.areas || "", types: b.types || [], beds: b.beds || "", time: b.time || "", pre: b.pre || "", must: b.must || "" } : null,
        recent: (c.log || []).slice(0, 3).map(function (l) { return l.d + ": " + l.t; }) };
    });
  }

  /* ---------- checking Claude's suggestions ---------- */
  function cleanBuy(src, base) {
    src = src || {}; var out = {}, b = base || {};
    var mn = A.money(src.min), mx = A.money(src.max);
    if (mn) out.min = mn; if (mx) out.max = mx;
    if (mn && mx && mn > mx) return null;
    if (String(src.areas || "").trim()) out.areas = String(src.areas).trim().slice(0, 200);
    var types = (Array.isArray(src.types) ? src.types : []).filter(function (t) { return A.BTYPES.indexOf(t) >= 0; });
    if (types.length) out.types = types;
    if (/^[1-9]$/.test(String(src.beds || ""))) out.beds = String(src.beds);
    if (A.BTIMES.indexOf(src.time) >= 0) out.time = src.time;
    if (A.BPRE.indexOf(src.pre) >= 0) out.pre = src.pre;
    if (String(src.must || "").trim()) out.must = String(src.must).trim().slice(0, 300);
    Object.keys(out).forEach(function (k) { if (JSON.stringify(out[k]) === JSON.stringify(b[k])) delete out[k]; });
    return out;
  }
  function cleanAction(a) {
    if (!a || typeof a !== "object") return { problem: "unreadable suggestion" };
    var type = a.type, why = String(a.why || "").slice(0, 300), c = S.contacts.get(String(a.contactId || ""));
    var noContact = { problem: "pointed at a contact that doesn't exist" };
    if (type === "create_contact") {
      var first = String(a.first || "").trim(), last = String(a.last || "").trim(), phone = A.normPhone(a.phone), email = String(a.email || "").trim().toLowerCase();
      if (!first && !last && !phone && !email) return { problem: "new contact had no name, phone or email" };
      var buy = a.buyerProfile ? cleanBuy(a.buyerProfile, {}) : null;
      return { act: { type: type, first: first, last: last, phone: phone, email: email, city: String(a.city || "").trim(),
        province: A.PROVS.indexOf(a.province) >= 0 ? a.province : "Alberta", source: A.SOURCES.indexOf(a.source) >= 0 ? a.source : "Other",
        kind: A.KINDS.indexOf(a.kind) >= 0 ? a.kind : "", temp: A.TEMPS.indexOf(a.temp) >= 0 ? a.temp : "hot",
        note: String(a.note || "").trim().slice(0, 1000), followUp: isoOk(a.followUp) ? a.followUp : "", buy: buy && Object.keys(buy).length ? buy : null, why: why } };
    }
    if (type === "log_note") { if (!c) return noContact; var tx = String(a.text || "").trim(); return tx ? { act: { type: type, contactId: c.id, text: tx.slice(0, 1000), why: why } } : { problem: "empty note" }; }
    if (type === "set_followup") { if (!c) return noContact; return isoOk(a.date) ? { act: { type: type, contactId: c.id, date: a.date, why: why } } : { problem: "follow-up date wasn't a real date" }; }
    if (type === "set_buyer_profile") {
      if (!c) return noContact;
      var bp = cleanBuy(a.fields || a.buyerProfile, c.buy || {});
      if (bp === null) return { problem: "budget minimum was above the maximum" };
      return Object.keys(bp).length ? { act: { type: type, contactId: c.id, fields: bp, why: why } } : { problem: "buyer profile already says that" };
    }
    if (type === "update_contact") {
      if (!c) return noContact;
      var f = {}, src = a.fields || {};
      EDITABLE.forEach(function (k) {
        if (!(k in src)) return;
        var v = String(src[k] == null ? "" : src[k]).trim();
        if (k === "phone") v = A.normPhone(v); else if (k === "email") v = v.toLowerCase();
        if (k === "province" && A.PROVS.indexOf(v) < 0) return;
        if (k === "stage" && A.ALL_STAGES.indexOf(v) < 0) return;
        if (k === "temp" && A.TEMPS.indexOf(v) < 0) return;
        if (k === "kind" && A.KINDS.concat([""]).indexOf(v) < 0) return;
        if (k === "source" && A.SOURCES.indexOf(v) < 0) return;
        if (v !== String(c[k] || "")) f[k] = v;
      });
      return Object.keys(f).length ? { act: { type: type, contactId: c.id, fields: f, why: why } } : { problem: "suggested change matched what is already saved" };
    }
    if (type === "add_task") { var ti = String(a.title || "").trim(); if (!ti) return { problem: "to-do had no title" }; return { act: { type: type, title: ti.slice(0, 300), due: isoOk(a.due) ? a.due : "", contactId: c ? c.id : "", why: why } }; }
    if (type === "workspace_request") { var rt = String(a.title || "").trim(); return rt ? { act: { type: type, title: rt.slice(0, 200), detail: String(a.detail || "").trim().slice(0, 2000), why: why } } : { problem: "workspace idea had no title" }; }
    if (type === "question") { var q = String(a.text || "").trim(); return q ? { act: { type: type, text: q.slice(0, 500), why: why } } : { problem: "empty question" }; }
    return { problem: "unknown suggestion type" };
  }
  function cleanPlan(raw) {
    var acts = [], problems = [];
    ((raw && Array.isArray(raw.actions)) ? raw.actions : []).slice(0, 20).forEach(function (a) { var r = cleanAction(a); if (r.act) acts.push(r.act); else problems.push(r.problem); });
    return { summary: String((raw && raw.summary) || "").slice(0, 400), actions: acts, problems: problems };
  }
  function dupOf(a) {
    if (a.type !== "create_contact") return null;
    var name = (a.first + " " + a.last).trim().toLowerCase(), hit = null;
    A.all().some(function (c) {
      if ((a.phone && c.phone && digits(c.phone).slice(-10) === digits(a.phone).slice(-10)) || (a.email && c.email && String(c.email).toLowerCase() === a.email) || (name.length > 3 && A.nm(c).toLowerCase() === name)) { hit = c; return true; }
      return false;
    });
    return hit;
  }
  // Overwriting saved buyer-profile values is a change to saved details, so it starts unticked like update_contact.
  function overwritesBuy(a) { if (a.type !== "set_buyer_profile") return false; var b = (S.contacts.get(a.contactId) || {}).buy || {}; return Object.keys(a.fields).some(function (k) { var v = b[k]; return v != null && v !== "" && !(Array.isArray(v) && !v.length); }); }
  function defaultPick(a) { return a.type !== "question" && a.type !== "update_contact" && !dupOf(a) && !overwritesBuy(a); }

  function buyText(b) {
    var bits = [];
    if (b.min || b.max) bits.push(A.budgetText(b)); if (b.areas) bits.push(b.areas); if ((b.types || []).length) bits.push(b.types.join("/"));
    if (b.beds) bits.push(b.beds + "+ bed"); if (b.time) bits.push(b.time); if (b.pre) bits.push("pre-approval " + b.pre.toLowerCase()); if (b.must) bits.push(b.must);
    return bits.join(" · ");
  }
  function actLabel(a) {
    var c = a.contactId ? S.contacts.get(a.contactId) : null, who = c ? esc(A.nm(c)) : "";
    if (a.type === "create_contact") {
      var bits = [a.phone ? A.fphone(a.phone) : "", a.email, a.city, a.kind, a.temp].filter(Boolean).map(esc).join(" · "), dup = dupOf(a);
      return "<b>New contact:</b> " + esc((a.first + " " + a.last).trim() || "(no name)") + (bits ? ' <span class="muted">' + bits + "</span>" : "") +
        (a.note ? "<br>Note: " + esc(a.note) : "") + (a.buy ? "<br>Buyer profile: " + esc(buyText(a.buy)) : "") + (a.followUp ? "<br>Follow up " + esc(A.fdate(a.followUp)) : "") +
        (dup ? '<br><span class="late">Looks like ' + esc(A.nm(dup)) + " who is already saved. Left unticked.</span>" : "");
    }
    if (a.type === "log_note") return "<b>Add to " + who + "'s history:</b> " + esc(a.text);
    if (a.type === "set_followup") return "<b>Follow up with " + who + "</b> on " + esc(A.fdate(a.date)) + (c && c.next ? ' <span class="muted">(now ' + esc(A.fdate(c.next)) + ")</span>" : "");
    if (a.type === "set_buyer_profile") return "<b>Buyer profile for " + who + ":</b> " + esc(buyText(a.fields)) + (overwritesBuy(a) ? '<br><span class="muted">Replaces something already in the profile, so it starts unticked.</span>' : "");
    if (a.type === "update_contact") return "<b>Change " + who + ":</b> " + Object.keys(a.fields).map(function (k) { return esc(k) + ' <span class="muted">' + esc(c[k] || "empty") + "</span> → " + esc(a.fields[k] || "empty"); }).join("; ") + '<br><span class="muted">Changes saved details, so it starts unticked.</span>';
    if (a.type === "add_task") return "<b>To-do:</b> " + esc(a.title) + (a.due ? " · due " + esc(A.fdate(a.due)) : "") + (who ? " · " + who : "");
    if (a.type === "workspace_request") return "<b>Workspace idea:</b> " + esc(a.title) + (a.detail ? '<br><span class="muted">' + esc(a.detail) + "</span>" : "");
    return "<b>Claude asks:</b> " + esc(a.text);
  }

  /* ---------- doing it ---------- */
  function applyAction(a) {
    var t = today();
    if (a.type === "create_contact") {
      var rec = { id: newId("n"), first: a.first, last: a.last, email: a.email, phone: a.phone, province: a.province, city: a.city, source: a.source, rel: "Lead",
        tags: ["src:" + A.slug(a.source), "prov:" + A.PROV_TAG[a.province], "via:tell-claude"].concat(a.phone ? ["ch:phone"] : [], a.email ? ["ch:email"] : []),
        lang: "", added: t, other: "", flags: "", notes: a.note, stage: "New", temp: a.temp, kind: a.kind, next: a.followUp || t, lastTouch: "",
        log: [{ d: t, t: "Added from Tell Claude" + (a.note ? ": " + a.note : "") }] };
      if (a.buy) rec.buy = Object.assign({ min: "", max: "", areas: "", types: [], beds: "", time: "", pre: "", must: "" }, a.buy);
      return A.addContact(rec);
    }
    var c = S.contacts.get(a.contactId);
    if (!c && (a.type === "log_note" || a.type === "set_followup" || a.type === "update_contact" || a.type === "set_buyer_profile")) return Promise.reject(new Error("contact no longer exists"));
    var fields = null;
    if (a.type === "log_note") fields = { log: [{ d: t, t: "Note: " + a.text }].concat(c.log || []).slice(0, 60) };
    else if (a.type === "set_followup") fields = { next: a.date };
    else if (a.type === "set_buyer_profile") fields = { buy: Object.assign({ min: "", max: "", areas: "", types: [], beds: "", time: "", pre: "", must: "" }, c.buy || {}, a.fields) };
    else if (a.type === "update_contact") {
      fields = Object.assign({}, a.fields);
      if (fields.province) { var tg = (c.tags || []).filter(function (x) { return x.indexOf("prov:") !== 0; }); tg.push("prov:" + A.PROV_TAG[fields.province]); fields.tags = tg; }
    }
    if (fields) return A.patchNow(a.contactId, fields).then(function (ok) { if (!ok) throw new Error("not saved"); });
    if (a.type === "add_task") { var tk = { id: newId("t"), title: a.title, due: a.due, contactId: a.contactId, done: false, created: t, from: "tell-claude" }; return Store.putDoc("tasks", tk).then(function () { T.tasks.push(tk); }); }
    if (a.type === "workspace_request") { var rq = { id: newId("r"), title: a.title, detail: a.detail, created: t, status: "new" }; return Store.putDoc("requests", rq).then(function () { T.requests.push(rq); }); }
    return Promise.resolve();
  }

  function send() {
    var box = $("#tellText"), text = box ? box.value.trim() : "";
    if (!text) { A.toast("Write a note first"); if (box) box.focus(); return; }
    if (T.setupNeeded) { A.toast(NEEDS_SETUP); return; }
    var n = { id: newId("i"), text: text.slice(0, 8000), at: new Date().toISOString(), status: "new" };
    T.inbox.push(n); T.openNote = n.id; box.value = ""; T.draft = ""; render();
    putNote(n).then(function () { analyze(n.id); }, function (e) {
      T.inbox = T.inbox.filter(function (x) { return x.id !== n.id; }); var b = $("#tellText"); if (b) b.value = text;
      if (missingTable(e)) T.setupNeeded = NEEDS_SETUP;
      A.toast("Note not saved: " + ((e && e.message) || "unknown error")); render();
    });
  }
  function analyze(id) {
    var n = noteById(id); if (!n || T.analyzing) return;
    var run = ++T.ctl, d = new Date();
    T.analyzing = id; T.openNote = id; render();
    Store.invoke("tell-claude", { note: n.text, candidates: candidates(n.text), today: today(), weekday: d.toLocaleDateString("en-CA", { weekday: "long" }) }).then(function (res) {
      if (run !== T.ctl) return;
      var plan = cleanPlan(res && res.plan);
      return setNote(id, { status: "proposed", plan: plan, pick: plan.actions.map(defaultPick), usage: (res && res.usage) || null, error: "" });
    }, function (e) {
      if (run !== T.ctl) return;
      var code = e && (e.code || (e.status === 404 ? "not_setup" : e.status === 401 ? "unauthorized" : ""));
      return setNote(id, { status: "failed", error: FAIL[code] || "Claude couldn't analyse this note right now (" + ((e && e.message) || "error") + "). It is saved; tap Analyse again." });
    }).then(function () { if (run === T.ctl) { T.analyzing = null; render(); } });
  }
  function stop() { if (!T.analyzing) return; var id = T.analyzing; T.ctl++; T.analyzing = null; setNote(id, { status: "new", error: "Stopped. Your note is saved." }); }
  function apply(id) {
    var n = noteById(id); if (!n || !n.plan || T.applying) return;
    var chosen = n.plan.actions.filter(function (a, i) { return n.pick && n.pick[i] && a.type !== "question"; });
    if (!chosen.length) { A.toast("Tick at least one, or tap Dismiss"); return; }
    T.applying = id; render();
    var done = [], failed = [];
    chosen.reduce(function (p, a) {
      return p.then(function () { return applyAction(a).then(function () { done.push(a.type); }, function (e) { failed.push(a.type.replace(/_/g, " ") + ": " + ((e && e.message) || "error")); }); });
    }, Promise.resolve()).then(function () {
      T.applying = null;
      A.toast(failed.length ? done.length + " saved, " + failed.length + " failed" : "Saved " + done.length + (done.length === 1 ? " change" : " changes"));
      return setNote(id, { status: failed.length && !done.length ? "proposed" : "applied", applied: done, applyErrors: failed, appliedAt: new Date().toISOString() });
    });
  }
  function finishTask(id) {
    var tk = null; T.tasks.forEach(function (x) { if (x.id === id) tk = x; }); if (!tk) return;
    tk.done = true; tk.doneAt = today(); A.render();
    Store.putDoc("tasks", tk).then(function () { A.toast("Done: " + tk.title); }, function (e) { tk.done = false; A.render(); A.toast("Not saved: " + ((e && e.message) || "error")); });
  }

  /* ---------- screen ---------- */
  function cost(u) { return u && typeof u.costUsd === "number" ? " · about $" + (u.costUsd < 0.01 ? "0.01" : u.costUsd.toFixed(2)) : ""; }
  function workHtml() {
    var n = T.openNote ? noteById(T.openNote) : null; if (!n) return "";
    var head = '<div class="tl-note"><span class="muted">' + esc(new Date(n.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })) + esc(cost(n.usage)) + "</span><br>" + esc(n.text) + "</div>";
    if (T.analyzing === n.id) return head + '<div class="tl-status" role="status"><span class="tl-dot"></span>Claude is reading your note and checking your contacts… <button class="btn small" type="button" data-tell="stop">Stop</button></div>';
    if (n.status === "failed" || n.status === "new") return head + '<div class="tl-status">' + esc(n.error || "Saved, not analysed yet.") + ' <button class="btn small" type="button" data-tell="retry" data-id="' + esc(n.id) + '">Analyse again</button></div>';
    if (n.status === "dismissed") return head + '<div class="tl-status">Dismissed. Nothing was changed.</div>';
    if (n.status === "applied") return head + '<div class="tl-status">Saved ' + (n.applied || []).length + " " + ((n.applied || []).length === 1 ? "change" : "changes") + ((n.applyErrors || []).length ? '. <span class="late">Failed: ' + esc(n.applyErrors.join("; ")) + "</span>" : ".") + "</div>";
    var plan = n.plan || { actions: [], problems: [] }, busy = T.applying === n.id;
    var picked = plan.actions.filter(function (a, i) { return n.pick && n.pick[i] && a.type !== "question"; }).length;
    return head + (plan.summary ? '<p class="tl-sum">' + esc(plan.summary) + "</p>" : "") +
      (plan.actions.length ? '<ul class="tl-acts">' + plan.actions.map(function (a, i) {
        var q = a.type === "question";
        return '<li><label class="tl-act' + (q ? " q" : "") + '">' + (q ? '<span class="tl-q" aria-hidden="true">?</span>' : '<input type="checkbox" data-tellpick="' + esc(n.id) + '" data-i="' + i + '"' + (n.pick && n.pick[i] ? " checked" : "") + (busy ? " disabled" : "") + ">") + "<span>" + actLabel(a) + (a.why ? '<br><span class="note">' + esc(a.why) + "</span>" : "") + "</span></label></li>";
      }).join("") + "</ul>" : '<p class="note">Nothing to save from this note.</p>') +
      ((plan.problems || []).length ? '<p class="note">Skipped ' + plan.problems.length + " unusable " + (plan.problems.length === 1 ? "suggestion" : "suggestions") + ": " + esc(plan.problems.join("; ")) + ".</p>" : "") +
      '<div class="row" style="margin-top:10px"><button class="btn primary" type="button" data-tell="apply" data-id="' + esc(n.id) + '"' + (busy || !picked ? " disabled" : "") + ">" + (busy ? "Saving…" : "Apply " + picked + " selected") + '</button><button class="btn" type="button" data-tell="dismiss" data-id="' + esc(n.id) + '"' + (busy ? " disabled" : "") + ">Dismiss</button></div>";
  }
  function recentHtml() {
    var docs = T.inbox.slice().sort(byNewest).slice(0, 6); if (!docs.length) return "";
    return '<div class="tl-recent"><div class="sec-lbl">Recent notes</div>' + docs.map(function (n) {
      var st = T.analyzing === n.id ? "analyzing" : n.status;
      return '<button type="button" class="tl-row' + (T.openNote === n.id ? " on" : "") + '" data-tell="open" data-id="' + esc(n.id) + '"><span class="tl-txt">' + esc(String(n.text).slice(0, 90)) + (String(n.text).length > 90 ? "…" : "") + '</span><span class="tl-st st-' + esc(st) + '">' + esc(LABEL[st] || st) + "</span></button>";
    }).join("") + "</div>";
  }
  function tasksHtml() {
    var open = T.tasks.filter(function (x) { return !x.done; }).sort(function (a, b) { return (a.due || "9999").localeCompare(b.due || "9999"); });
    var ideas = T.requests.filter(function (r) { return r.status === "new"; }).length;
    if (!open.length && !ideas) return "";
    var t = today();
    return '<div class="tl-todo">' + (open.length ? '<div class="sec-lbl">To-do <span class="num">(' + open.length + ")</span></div>" + open.map(function (x) {
      var c = x.contactId ? S.contacts.get(x.contactId) : null;
      return '<div class="tl-task"><input type="checkbox" data-tell="task" data-id="' + esc(x.id) + '" aria-label="Done: ' + esc(x.title) + '"><span class="tl-txt">' + esc(x.title) + ' <span class="note">' + (x.due ? (x.due < t ? '<span class="late">overdue ' + esc(A.fdate(x.due)) + "</span>" : "due " + esc(A.fdate(x.due))) : "") + "</span>" + (c ? ' <button type="button" class="lnk ghost" data-open="' + esc(c.id) + '">' + esc(A.nm(c)) + "</button>" : "") + "</span></div>";
    }).join("") : "") + (ideas ? '<p class="note" style="margin:8px 0 0">' + ideas + " workspace " + (ideas === 1 ? "idea" : "ideas") + " saved for your Build Roadmap.</p>" : "") + "</div>";
  }
  var last = {};
  function part(sel, html) { if (last[sel] === html) return; var el = $(sel); if (el) { el.innerHTML = html; last[sel] = html; } }
  function render() {
    var host = $("#tellHost"); if (!host) return;
    if (!S.user) { if (T.uid) { T = Object.assign(T, { uid: null, inbox: [], tasks: [], requests: [], loaded: false, openNote: null }); } host.hidden = true; return; }
    if (T.uid !== S.user.id) { load(); }
    var show = S.tab === "today" && S.loaded && S.contacts.size > 0;
    host.hidden = !show; if (!show) return;
    if (!$("#tellText")) {
      host.innerHTML = '<section class="card tl" aria-labelledby="tlTitle"><h2 id="tlTitle">Tell Claude</h2><p class="note" style="margin:2px 0 10px">A new lead, an update about a client, or a to-do. Claude suggests what to save and you choose before anything changes.</p>' +
        '<label for="tellText" class="sr">Your note</label><textarea class="field" id="tellText" rows="3" placeholder="e.g. Met Harpreet Gill at the Cityscape show home, 403 555 0147, wants a 3-bed duplex in Airdrie under 550k, call her Friday"></textarea>' +
        '<div class="row" style="margin-top:8px;justify-content:space-between"><span class="note" id="tellHint">⌘/Ctrl + Enter to send</span><button class="btn primary" type="button" data-tell="send">Send to Claude</button></div>' +
        '<div id="tellSetup"></div><div id="tellWork"></div><div id="tellRecent"></div><div id="tellTodo"></div></section>';
      $("#tellText").value = T.draft || ""; last = {};
    }
    part("#tellSetup", T.setupNeeded ? '<div class="warn" style="margin-top:10px">' + esc(T.setupNeeded) + "</div>" : "");
    part("#tellWork", workHtml());
    part("#tellRecent", recentHtml());
    part("#tellTodo", tasksHtml());
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-tell]"); if (!el) return;
    var a = el.dataset.tell, id = el.dataset.id;
    if (a === "send") send();
    else if (a === "open") { T.openNote = id; render(); }
    else if (a === "retry") analyze(id);
    else if (a === "stop") stop();
    else if (a === "apply") apply(id);
    else if (a === "dismiss") setNote(id, { status: "dismissed" });
    else if (a === "task") finishTask(id);
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.dataset || !t.dataset.tellpick) return;
    var n = noteById(t.dataset.tellpick); if (!n) return;
    var pk = (n.pick || []).slice(); pk[Number(t.dataset.i)] = t.checked; setNote(n.id, { pick: pk });
  });
  document.addEventListener("input", function (e) { if (e.target.id === "tellText") T.draft = e.target.value; });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.id === "tellText") { e.preventDefault(); send(); } });

  window.CDTellUI = { render: render };
  A.render();
})();
