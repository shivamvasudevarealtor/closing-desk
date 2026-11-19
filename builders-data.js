/* Builders: saving, sending the monthly ask, and reading replies. No screens here (builders.js draws those).
   Two documents live in the database (os_docs), the same place Tasks keeps its data:
     "bld"        builders, contacts, communities, which builder works where, each month's send record, settings
     "bld-deals"  every reply received, and every deal found in them
   Saving is safe on two devices: each change is a small function. If the stored copy changed since we loaded it,
   we load the new copy and replay our changes on it, so nothing already saved is overwritten.
   Sending is semi-automatic: this page prepares the batch and sends it only while it is open and you have tapped Send. */
(function (root) {
  "use strict";
  var Store = root.CDStore, B = root.BLD, Mail = root.CDMail;
  var IDS = { dir: "bld", deals: "bld-deals", sum: "bld-sum" }, JR = "cd.bld.jr";
  var BA = { S: { dir: null, deals: null, mail: {}, status: "load", save: "saved", saveErr: "", loadedAt: 0, ai: "unknown", sending: null, checking: null, mx: null, expectedAccount: "" } };
  var S = BA.S, ops = { dir: [], deals: [] }, rev = { dir: 0, deals: 0 }, inflight = { dir: null, deals: null }, timers = {}, listeners = [], retryN = 0, retryT = 0;

  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  BA.on = function (f) { listeners.push(f); };
  function now() { return new Date(); }
  function iso() { return now().toISOString(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- shapes ---------- */
  function normDir(d) {
    d = d && typeof d === "object" ? d : B.newDoc();
    ["builders", "contacts", "areas"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    ["communities", "runs"].forEach(function (k) { if (!d[k] || typeof d[k] !== "object") d[k] = {}; });
    d.settings = Object.assign(B.defaultSettings(), d.settings || {});
    d.contacts.forEach(function (c) { if (!c.h) c.h = {}; if (!c.src) c.src = { type: "manual" }; });
    return d;
  }
  function normDeals(d) {
    d = d && typeof d === "object" ? d : { v: 1 };
    ["replies", "deals", "bounceSeen"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    d.deals.forEach(function (x) { if (!Array.isArray(x.incentives)) x.incentives = []; if (!x.edited) x.edited = {}; if (!Array.isArray(x.history)) x.history = []; });
    return d;
  }
  BA.dirDoc = function () { return S.dir; };
  BA.dealsDoc = function () { return S.deals; };
  function key2doc(k) { return k === "dir" ? S.dir : S.deals; }

  /* ---------- saving ---------- */
  function setSave(st, err) { S.save = st; S.saveErr = err || ""; emit(); }
  function pending() { return ops.dir.length + ops.deals.length; }
  BA.pending = pending;
  /* Apply a change now and queue it for saving. fn(doc) must only use ids and plain values. */
  BA.mutate = function (key, fn) {
    var d = key2doc(key); if (!d) return;
    fn(d); ops[key].push(fn); setSave("dirty");
    clearTimeout(timers[key]); timers[key] = setTimeout(function () { BA.flush(key); }, 700);
    emit();
  };
  function saveOne(key) {
    if (!ops[key].length) return Promise.resolve(true);
    if (inflight[key]) return inflight[key].then(function () { return saveOne(key); });
    var batch = ops[key].length, id = IDS[key];
    inflight[key] = Store.getOsDoc(id).then(function (remote) {
      var d = key2doc(key), rebased = false;
      if (remote && (remote.rev || 0) !== rev[key]) {
        d = key === "dir" ? normDir(remote) : normDeals(remote);
        ops[key].slice(0, batch).forEach(function (fn) { fn(d); }); rebased = true;
      }
      d.rev = ((remote && remote.rev) || 0) + 1; d.updated = iso();
      return Store.putOsDoc(id, d).then(function () {
        if (rebased) { ops[key].slice(batch).forEach(function (fn) { fn(d); }); if (key === "dir") S.dir = d; else S.deals = d; }
        rev[key] = d.rev; ops[key] = ops[key].slice(batch); retryN = 0; return true;
      });
    }).then(function (ok) { inflight[key] = null; return ok; }, function (e) { inflight[key] = null; throw e; });
    return inflight[key];
  }
  BA.flush = function (key) {
    var keys = key ? [key] : ["dir", "deals"];
    setSave("saving");
    return Promise.all(keys.map(saveOne)).then(function () {
      if (pending()) { setSave("dirty"); return true; }
      setSave("saved"); sumSave(); return true;
    }, function (e) {
      setSave("failed", (e && e.message) || "Could not save");
      var wait = [5000, 15000, 60000][Math.min(retryN++, 2)];
      clearTimeout(retryT); retryT = setTimeout(function () { if (pending()) BA.flush(); }, wait);
      return false;
    });
  };
  root.addEventListener && root.addEventListener("online", function () { if (pending()) BA.flush(); });
  root.addEventListener && root.addEventListener("pagehide", function () { if (pending()) BA.flush(); });

  /* A tiny summary row for Home, so Home does not download the whole directory. */
  function sumCompute() {
    var d = S.dir, dd = S.deals; if (!d) return null;
    var t = now(), mk = B.monthKey(t), ask = B.askStatus(d, t, S.mail || {}), today = B.todayIso(t);
    var open = (dd ? dd.deals : []).filter(function (x) { return x.state === "new"; }).length;
    var rep = (dd ? dd.replies : []).filter(function (r) { return r.state === "new" && r.kind === "reply"; }).length;
    var withEmail = {}; d.contacts.forEach(function (c) { if (c.monthly) withEmail[c.builderId] = 1; });
    var need = d.builders.filter(function (b) { return b.status === "active" && !withEmail[b.id]; }).length;
    return { v: 1, month: mk, sendDay: ask.sendDay, ready: ask.ready, sent: ask.run.sent + ask.run.uncertain, queued: ask.run.queued, newDeals: open, newReplies: rep, needEmail: need, at: iso(), today: today };
  }
  function sumSave() {
    var s = sumCompute(); if (!s) return;
    try { localStorage.setItem("cd.bld.sum", JSON.stringify(s)); } catch (e) {}
    Store.putOsDoc(IDS.sum, s).then(function () {}, function () {});
  }
  BA.sumNow = sumCompute;

  /* ---------- loading ---------- */
  function journalFix() {
    var jr = {}; try { jr = JSON.parse(localStorage.getItem(JR) || "{}") || {}; } catch (e) {}
    var changed = false;
    Object.keys(jr).forEach(function (mk) {
      Object.keys(jr[mk]).forEach(function (cid) {
        var it = S.dir.runs[mk] && S.dir.runs[mk].items && S.dir.runs[mk].items[cid];
        if (it && it.st !== "sent" && it.st !== "uncertain") {
          BA.mutate("dir", function (d) { var r = d.runs[mk]; if (r && r.items[cid] && r.items[cid].st !== "sent") r.items[cid] = Object.assign(r.items[cid], { st: "uncertain", err: "Page closed while sending. Check Gmail Sent before sending again." }); });
          changed = true;
        }
      });
    });
    try { localStorage.removeItem(JR); } catch (e) {}
    return changed;
  }
  function journal(mk, cid, on) {
    try { var jr = JSON.parse(localStorage.getItem(JR) || "{}") || {}; if (on) { (jr[mk] = jr[mk] || {})[cid] = Date.now(); } else if (jr[mk]) { delete jr[mk][cid]; if (!Object.keys(jr[mk]).length) delete jr[mk]; } localStorage.setItem(JR, JSON.stringify(jr)); } catch (e) {}
  }
  BA.load = function () {
    if (S.status === "loading") return Promise.resolve();
    S.status = S.dir ? "refresh" : "loading"; emit();
    return Promise.all([Store.getSettings(), Store.getOsDoc(IDS.dir), Store.getOsDoc(IDS.deals)]).then(function (r) {
      S.mail = (r[0] && r[0].mail) || {};
      var d = r[1] ? normDir(r[1]) : null, dd = normDeals(r[2]);
      if (pending()) { S.status = "ok"; emit(); return; }  /* never replace unsaved work */
      S.dir = d; S.deals = dd; rev.dir = (r[1] && r[1].rev) || 0; rev.deals = (r[2] && r[2].rev) || 0;
      S.status = d ? "ok" : "empty"; S.loadedAt = Date.now();
      var cfg = (root.CD_CONFIG && root.CD_CONFIG.features) || {}; S.ai = cfg.builderParse ? "on" : "off";
      if (d) { if (journalFix()) BA.flush(); sumSave(); }
      emit();
    }, function (e) { S.status = S.dir ? "ok" : "error"; S.loadErr = (e && e.message) || ""; emit(); });
  };
  /* First use with no directory yet: start an empty one. */
  BA.startEmpty = function () { S.dir = normDir(B.newDoc()); if (!S.deals) S.deals = normDeals(null); S.status = "ok"; ops.dir.push(function () {}); BA.flush("dir"); emit(); };

  /* ---------- Gmail ---------- */
  BA.mailReady = function () { return !!Mail.token(); };
  BA.canRead = function () { return Mail.canRead(); };
  BA.connect = function () {
    var cid = (S.mail.clientId || "").trim();
    if (!cid) return Promise.reject(new Error("Add your Google client ID first (Settings, Email)."));
    return Mail.connect(cid, S.dir && S.dir.settings.account || undefined, { read: true }).then(function (email) {
      var want = (S.dir && S.dir.settings.account || "").toLowerCase();
      S.wrongAccount = !!(want && email !== want); emit(); return email;
    });
  };
  BA.preload = function () { return Mail.load().catch(function () {}); };
  BA.disconnect = function () { Mail.disconnect(); S.wrongAccount = false; emit(); };

  /* ---------- the monthly ask ---------- */
  BA.mk = function () { return B.monthKey(now()); };
  BA.batch = function () { return B.buildBatch(S.dir, BA.mk(), S.mail); };
  BA.status = function () { return B.askStatus(S.dir, now(), S.mail); };
  BA.stopSend = function () { if (S.sending) S.sending.stop = "You stopped it."; emit(); };

  function buildRaw(item, from) {
    var m = item.msg;
    return Mail.raw({ from: { name: S.mail.senderName || "", email: from }, to: item.contact.email, subject: m.subject, text: m.text, html: Mail.textToHtml(m.text) });
  }
  /* picks: [{contact, builder, msg}] in order. Runs until done, stopped, or something needs you. Resolves with a summary. */
  BA.send = function (picks, opts) {
    opts = opts || {};
    if (S.sending && S.sending.active) return Promise.resolve(S.sending);
    var mk = BA.mk(), st = S.sending = { active: true, mk: mk, total: picks.length, done: 0, failed: 0, stop: "", reason: "", current: "", log: [], nextAt: 0 }, wake = null;
    var email = Mail.email();
    try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then(function (w) { wake = w; }, function () {}); } catch (e) {}
    BA.mutate("dir", function (d) { B.startRun(d, mk, picks); });
    emit();
    var i = 0;
    function finish(reason) {
      st.active = false; st.reason = st.reason || reason || ""; st.current = ""; st.nextAt = 0;
      try { if (wake && wake.release) wake.release(); } catch (e) {}
      return BA.flush().then(function () { emit(); return st; });
    }
    function step() {
      if (st.stop) { st.reason = st.stop; return finish(); }
      if (i >= picks.length) return finish("done");
      var p = picks[i], c = p.contact, tn = now();
      if (!Mail.token()) { st.reason = "Gmail disconnected. Tap Connect Gmail, then Send again to continue."; return finish(); }
      if (S.wrongAccount) { st.reason = "Connected to a different Gmail account than the one chosen in Settings."; return finish(); }
      if (!opts.anyTime && !B.inWindow(S.dir.settings, tn)) { st.reason = "Outside your sending hours (" + S.dir.settings.winStart + ":00 to " + S.dir.settings.winEnd + ":00 Calgary time). Send again during the window."; return finish(); }
      if (B.sentInLast24h(S.dir, tn) >= (+S.dir.settings.dailyCap || 25)) { st.reason = "Daily limit of " + S.dir.settings.dailyCap + " reached. The rest stay queued for tomorrow."; return finish(); }
      var el = B.recipientEligibility(c, p.builder, S.dir.runs[mk] && { items: Object.assign({}, S.dir.runs[mk].items, (function () { var o = {}; o[c.id] = { st: "queued" }; return o; })()) });
      if (!el.ok) { st.log.push({ id: c.id, st: "skipped", why: el.why }); i++; return step(); }
      var run = S.dir.runs[mk], it = run && run.items[c.id];
      if (it && it.st === "sent") { i++; return step(); }
      var msg = B.renderEmail(S.dir, c, p.builder, S.mail, mk);
      if (msg.missing.length) { st.log.push({ id: c.id, st: "skipped", why: "Missing: " + msg.missing.join(", ") }); i++; return step(); }
      st.current = c.email; emit();
      journal(mk, c.id, true);
      var raw = buildRaw({ contact: c, msg: msg }, email);
      return Mail.send(raw).then(function (res) {
        BA.mutate("dir", function (d) { var r = d.runs[mk]; r.items[c.id] = { st: "sent", at: iso(), msgId: res.id, threadId: res.threadId, subject: msg.subject }; });
        st.done++; st.log.push({ id: c.id, st: "sent" });
        return BA.flush("dir").then(function () { journal(mk, c.id, false); });
      }, function (err) {
        var k = err && err.kind, text = (err && err.message) || "Send failed";
        if (k === "auth") { journal(mk, c.id, false); st.reason = "Gmail sign-in expired. Tap Connect Gmail, then Send again."; Mail.forget(); emit(); return "stop"; }
        if (k === "limit") { journal(mk, c.id, false); st.reason = "Gmail says you have reached a sending limit. Try again tomorrow."; return "stop"; }
        if (k === "bad") {
          BA.mutate("dir", function (d) { var r = d.runs[mk]; r.items[c.id] = { st: "fail", at: iso(), err: text }; var cc = d.contacts.filter(function (x) { return x.id === c.id; })[0]; if (cc) cc.h.bounced = iso(); });
          st.failed++; st.log.push({ id: c.id, st: "fail", why: text }); journal(mk, c.id, false); return BA.flush("dir");
        }
        if (k === "denied") { journal(mk, c.id, false); st.reason = "Gmail refused: " + text; return "stop"; }
        /* server / network / unknown: the email may or may not have gone. Never resend on our own. */
        BA.mutate("dir", function (d) { var r = d.runs[mk]; r.items[c.id] = { st: "uncertain", at: iso(), err: text }; });
        st.failed++; st.log.push({ id: c.id, st: "uncertain", why: text }); st.reason = "Could not confirm the last email. Check Gmail Sent before sending again.";
        return BA.flush("dir").then(function () { journal(mk, c.id, false); return "stop"; });
      }).then(function (r) {
        if (r === "stop") return finish();
        i++;
        if (i >= picks.length) return finish("done");
        var wait = B.paceMs(S.dir.settings); st.nextAt = Date.now() + wait; emit();
        return sleep(wait).then(function () { st.nextAt = 0; return step(); });
      });
    }
    return step();
  };
  /* A one-off retry for an "uncertain" or "failed" item after you checked Gmail Sent yourself. */
  BA.markSent = function (mk, cid) { BA.mutate("dir", function (d) { var r = d.runs[mk]; if (r && r.items[cid]) r.items[cid] = Object.assign(r.items[cid], { st: "sent", err: "", note: "Confirmed in Gmail by you" }); }); BA.flush("dir"); };
  BA.requeue = function (mk, cid) { BA.mutate("dir", function (d) { var r = d.runs[mk]; if (r && r.items[cid]) delete r.items[cid]; }); BA.flush("dir"); };

  /* ---------- reading replies ---------- */
  function addrOf(s) { var m = /<([^>]+)>/.exec(String(s || "")) || [null, s]; return B.normEmail(m[1] || ""); }
  function communityNames() { return Object.keys(S.dir.communities || {}); }
  function builderOf(id) { return S.dir.builders.filter(function (b) { return b.id === id; })[0]; }
  function contactOf(id) { return S.dir.contacts.filter(function (c) { return c.id === id; })[0]; }
  function wantAi() { return S.ai === "on"; }
  /* Turn reply text into deals. Rules always run; the AI runs too when it is switched on and its answer passes the check against the email. */
  BA.parseText = function (text, builder, receivedAt) {
    var ctx = { communities: communityNames(), received: (receivedAt || iso()).slice(0, 10), self: [Mail.email(), (S.dir.settings.account || "")] };
    var rules = B.ruleParse(text, ctx);
    if (!wantAi()) return Promise.resolve(rules);
    return Store.invoke("parse-builder-reply", { text: text.slice(0, 14000), builder: builder ? builder.name : "", communities: ctx.communities.slice(0, 120), today: B.todayIso(now()) }).then(function (r) {
      var v = B.verifyAi(r && r.ai, text, ctx);
      if (!v.deals.length && !v.summary) return rules;
      v.commission = v.deals.map(function (d) { return d.commission; }).filter(Boolean).concat(rules.commission || []);
      v.rulesCount = rules.deals.length; S.ai = "on"; return v;
    }, function (e) {
      if (e && (e.code === "not_configured" || e.code === "unauthorized" || e.status === 404)) S.ai = "off";
      rules.aiNote = e && e.code === "not_configured" ? "AI reading is not set up yet, so this was read with simple rules." : "AI reading did not answer, so this was read with simple rules.";
      return rules;
    });
  };
  /* Save a parsed reply: the reply record, its deals, and what it says about the contact. */
  BA.saveReply = function (rec, parsed, opts) {
    opts = opts || {};
    var at = rec.receivedAt || iso(), builderId = rec.builderId, dealIds = [];
    var inc = (parsed.deals || []).map(function (d) { d = B.clone(d); d.id = d.id || B.uid("d"); d.builderId = builderId; B.place(d, S.dir); d.description = B.describe(d); return d; });
    rec.parse = { method: parsed.method, summary: parsed.summary, unread: parsed.unread || 0, dropped: parsed.dropped || [], questions: parsed.questions || [], redirect: parsed.redirect || [], commission: parsed.commission || [], aiNote: parsed.aiNote || "", optOut: !!parsed.optOut };
    inc.forEach(function (n) { n.source = rec.id; dealIds.push(n.id); });
    rec.dealIds = dealIds; rec.state = rec.state || (rec.kind === "reply" || rec.kind === "paste" ? "new" : "done");
    BA.mutate("deals", function (dd) {
      if (!dd.replies.some(function (r) { return r.id === rec.id; })) dd.replies.unshift(B.clone(rec));
      var r = B.mergeDeals(dd.deals, B.clone(inc), { builderId: builderId, replyId: rec.id, at: at });
      dd.deals = r.deals;
      /* mergeDeals gives a match the existing id; remember which ids this reply actually touched */
      var mine = dd.replies.filter(function (x) { return x.id === rec.id; })[0];
      if (mine) mine.dealIds = inc.map(function (n) { var k = B.dealKey(Object.assign({}, n, { builderId: builderId })), hit = dd.deals.filter(function (x) { return B.dealKey(x) === k; })[0]; return hit ? hit.id : n.id; });
    });
    return inc.length;
  };
  function applyContactEffects(rec, parsed) {
    BA.mutate("dir", function (d) {
      var c = d.contacts.filter(function (x) { return x.id === rec.contactId; })[0];
      if (c) {
        if (rec.kind === "reply" || rec.kind === "paste") { c.h.repliedAt = rec.receivedAt; }
        if (rec.kind === "stop" || (parsed && parsed.optOut)) { c.h.optOut = rec.receivedAt; c.monthly = false; }
        if (rec.kind === "bounce") { c.h.bounced = rec.receivedAt; }
      }
      var r = rec.mk && d.runs[rec.mk]; if (r && r.items[rec.contactId] && (rec.kind === "reply" || rec.kind === "paste")) r.items[rec.contactId].repliedAt = rec.receivedAt;
    });
  }
  /* Pasted reply (when Gmail reading is not connected, or the answer came by text or phone). */
  BA.pasteReply = function (text, builderId, contactId) {
    var b = builderOf(builderId); text = B.cleanReply(text, 12000) || String(text || "").trim().slice(0, 12000);
    if (!text) return Promise.reject(new Error("Nothing to read. Paste the builder's reply first."));
    var rec = { id: "p_" + B.hash(text + builderId + Date.now()), threadId: "", contactId: contactId || "", builderId: builderId, receivedAt: iso(), from: "", subject: "Pasted reply", text: text, kind: "paste", mk: "" };
    return BA.parseText(text, b, rec.receivedAt).then(function (parsed) { var n = BA.saveReply(rec, parsed); applyContactEffects(rec, parsed); return BA.flush().then(function () { return { rec: rec, parsed: parsed, added: n }; }); });
  };
  /* Re-read a saved reply (for example after switching AI on). Deals the same reply produced before are updated, not duplicated. */
  BA.reparse = function (replyId) {
    var rec = S.deals.replies.filter(function (r) { return r.id === replyId; })[0]; if (!rec) return Promise.resolve(null);
    return BA.parseText(rec.text, builderOf(rec.builderId), rec.receivedAt).then(function (parsed) {
      var copy = B.clone(rec); copy.state = rec.state; var n = BA.saveReply(Object.assign(copy, {}), parsed);
      BA.mutate("deals", function (dd) { var r = dd.replies.filter(function (x) { return x.id === replyId; })[0]; if (r) { r.parse = copy.parse; r.dealIds = copy.dealIds; } });
      return BA.flush().then(function () { return { parsed: parsed, added: n }; });
    });
  };

  function pool(list, n, fn) {
    var i = 0, out = [];
    function next() { if (i >= list.length) return Promise.resolve(); var k = i++; return Promise.resolve(fn(list[k], k)).then(function (r) { out[k] = r; }, function (e) { out[k] = { error: e }; }).then(next); }
    var ws = []; for (var w = 0; w < Math.min(n, list.length); w++) ws.push(next());
    return Promise.all(ws).then(function () { return out; });
  }
  /* Look at every thread we sent in the last 60 days, and at bounce notices. Needs Gmail connected with permission to read. */
  BA.checkReplies = function () {
    if (S.checking && S.checking.active) return Promise.resolve(S.checking);
    if (!Mail.canRead()) return Promise.reject(new Error("Connect Gmail with permission to read replies first, or use Paste a reply."));
    var chk = S.checking = { active: true, threads: 0, newReplies: 0, newDeals: 0, bounces: 0, stops: 0, errors: 0, at: "", note: "" }, self = Mail.email(), t0 = now().getTime();
    emit();
    var threads = {}, seen = {}; S.deals.replies.forEach(function (r) { seen[r.id] = 1; });
    Object.keys(S.dir.runs).forEach(function (mk) {
      var items = S.dir.runs[mk].items || {};
      Object.keys(items).forEach(function (cid) {
        var it = items[cid]; if (!it.threadId || (it.st !== "sent" && it.st !== "uncertain")) return;
        if (t0 - new Date(it.at).getTime() > 60 * 86400000) return;
        if (!threads[it.threadId]) threads[it.threadId] = { threadId: it.threadId, contactId: cid, mk: mk, sentId: it.msgId };
      });
    });
    var list = Object.keys(threads).map(function (k) { return threads[k]; }).slice(0, 300), found = [];
    return pool(list, 4, function (th) {
      return Mail.getThread(th.threadId).then(function (t) {
        chk.threads++;
        (t.messages || []).forEach(function (m) {
          var p = Mail.parseMessage(m);
          if (p.id === th.sentId || seen[p.id] || addrOf(p.from) === self) return;
          found.push({ th: th, p: p });
        });
      });
    }).then(function (res) {
      res.forEach(function (r) { if (r && r.error) { chk.errors++; if (r.error.kind === "auth") chk.note = "Gmail sign-in expired. Connect again."; } });
      /* bounce notices that arrived as their own conversation */
      return Mail.search("from:(mailer-daemon OR postmaster) newer_than:45d", 40).catch(function () { return []; });
    }).then(function (ids) {
      var fresh = ids.filter(function (id) { return S.deals.bounceSeen.indexOf(id) < 0 && !seen[id] && !found.some(function (f) { return f.p.id === id; }); });
      return pool(fresh, 4, function (id) { return Mail.getMessage(id).then(function (m) { return Mail.parseMessage(m); }); }).then(function (ps) {
        var seenIds = [];
        ps.forEach(function (p, k) {
          if (!p || p.error) return; seenIds.push(fresh[k]);
          var txt = p.text || B.htmlToText(p.html), b = B.parseBounce(txt);
          b.failed.forEach(function (em) {
            var c = S.dir.contacts.filter(function (x) { return B.normEmail(x.email) === em; })[0]; if (!c) return;
            var rec = { id: p.id, threadId: p.threadId, contactId: c.id, builderId: c.builderId, receivedAt: p.internalDate || iso(), from: p.from, subject: p.subject, text: B.cleanReply(txt, 2000), kind: b.permanent ? "bounce" : "auto", mk: "" };
            if (b.permanent) { BA.saveReply(rec, { method: "rules", summary: "Delivery failed for " + em, deals: [] }); applyContactEffects(rec, null); chk.bounces++; }
          });
        });
        if (seenIds.length) BA.mutate("deals", function (dd) { seenIds.forEach(function (x) { if (dd.bounceSeen.indexOf(x) < 0) dd.bounceSeen.push(x); }); dd.bounceSeen = dd.bounceSeen.slice(-300); });
      });
    }).then(function () {
      /* now read each new message in the threads, one at a time so a slow AI call never blocks the others */
      var chain = Promise.resolve();
      found.forEach(function (f) {
        chain = chain.then(function () {
          var p = f.p, c = contactOf(f.th.contactId), builderId = c ? c.builderId : "", b = builderOf(builderId);
          var text = p.text || B.htmlToText(p.html), kind = B.classifyReply({ from: p.from, subject: p.subject, text: text, autoSubmitted: p.autoSubmitted });
          var rec = { id: p.id, threadId: p.threadId, contactId: f.th.contactId, builderId: builderId, receivedAt: p.internalDate || iso(), from: p.from, subject: p.subject, text: B.cleanReply(text, 12000), kind: kind, mk: f.th.mk };
          if (kind === "reply") {
            return BA.parseText(rec.text, b, rec.receivedAt).then(function (parsed) { var n = BA.saveReply(rec, parsed); applyContactEffects(rec, parsed); chk.newReplies++; chk.newDeals += n; if (parsed.optOut) chk.stops++; });
          }
          BA.saveReply(rec, { method: "rules", summary: kind === "stop" ? "Asked not to be emailed again." : kind === "bounce" ? "Delivery failed." : "Automatic reply.", deals: [] });
          applyContactEffects(rec, null);
          if (kind === "stop") chk.stops++; if (kind === "bounce") chk.bounces++;
        });
      });
      return chain;
    }).then(function () { chk.active = false; chk.at = iso(); return BA.flush(); }).then(function () { emit(); return chk; }, function (e) { chk.active = false; chk.note = (e && e.message) || "Check did not finish"; emit(); return chk; });
  };
  /* Keep the database small: old reply text is cleared after 90 days, the parsed fields stay. */
  BA.prune = function () {
    var cut = now().getTime() - 90 * 86400000, any = S.deals && S.deals.replies.some(function (r) { return r.text && new Date(r.receivedAt).getTime() < cut; });
    if (any) BA.mutate("deals", function (dd) { dd.replies.forEach(function (r) { if (r.text && new Date(r.receivedAt).getTime() < cut) { r.text = ""; r.pruned = true; } }); });
  };

  /* ---------- email checks ---------- */
  BA.checkEmails = function (ids) {
    if (S.mx && S.mx.active) return Promise.resolve(S.mx);
    var list = S.dir.contacts.filter(function (c) { return !ids || ids.indexOf(c.id) >= 0; }), domains = {};
    list.forEach(function (c) { var s = B.emailSyntax(c.email); if (s.ok) (domains[B.domainOf(s.email)] = domains[B.domainOf(s.email)] || []).push(c.id); });
    var names = Object.keys(domains), st = S.mx = { active: true, total: names.length, done: 0, bad: 0, unknown: 0 };
    emit();
    return pool(names, 4, function (dom) {
      return B.checkMx(dom).then(function (r) {
        st.done++; if (r.mx === "none") st.bad++; if (r.mx === "unknown") st.unknown++;
        BA.mutate("dir", function (d) { d.contacts.forEach(function (c) { if (domains[dom].indexOf(c.id) >= 0 && r.mx !== "unknown") { c.h.mx = r.mx; c.h.mxAt = iso(); c.h.mxNote = r.note || ""; } }); });
        emit();
      });
    }).then(function () { st.active = false; return BA.flush().then(function () { emit(); return st; }); });
  };

  /* ---------- directory edits (every one is a mutate, so it saves and rebases) ---------- */
  BA.addBuilder = function (name, website) {
    var id = "b_" + B.slug(name); if (S.dir.builders.some(function (b) { return b.id === id; })) return id;
    BA.mutate("dir", function (d) { if (!d.builders.some(function (b) { return b.id === id; })) d.builders.push({ id: id, name: name, website: website || "", contactPage: "", status: "active", notes: "" }); }); return id;
  };
  BA.patchBuilder = function (id, f) { BA.mutate("dir", function (d) { var b = d.builders.filter(function (x) { return x.id === id; })[0]; if (b) Object.assign(b, f); }); };
  BA.addContact = function (builderId, email, name, role, src) {
    var s = B.emailSyntax(email); if (!s.ok) return { ok: false, why: s.reason };
    if (S.dir.contacts.some(function (c) { return B.normEmail(c.email) === s.email; })) return { ok: false, why: "That address is already saved" };
    var r = role || B.guessRole(s.email), c = { id: "c_" + B.hash(s.email), builderId: builderId, email: s.email, name: name || "", role: r, monthly: B.roleOk(r), src: Object.assign({ type: "manual", url: "", note: "Added by you", foundAt: B.todayIso(now()) }, src || {}), h: { confirmed: iso() } };
    BA.mutate("dir", function (d) { if (!d.contacts.some(function (x) { return x.id === c.id; })) d.contacts.push(B.clone(c)); }); return { ok: true, id: c.id };
  };
  BA.patchContact = function (id, f, hf) { BA.mutate("dir", function (d) { var c = d.contacts.filter(function (x) { return x.id === id; })[0]; if (!c) return; if (f) Object.assign(c, f); if (hf) Object.assign(c.h, hf); }); };
  BA.removeContact = function (id) { BA.mutate("dir", function (d) { d.contacts = d.contacts.filter(function (x) { return x.id !== id; }); }); };
  BA.setAreas = function (builderId, names) {
    BA.mutate("dir", function (d) { d.areas = d.areas.filter(function (a) { return a.builderId !== builderId; }).concat(names.filter(function (n) { return d.communities[n]; }).map(function (n) { return { builderId: builderId, community: n }; })); });
  };
  BA.setCommunity = function (name, f) {
    BA.mutate("dir", function (d) {
      var c = d.communities[name] || (d.communities[name] = { city: "", quadrant: "", src: "Added by you", review: false });
      Object.assign(c, f); if (c.city !== "Calgary") c.quadrant = ""; if (c.city && (c.city !== "Calgary" || c.quadrant)) c.review = false;
    });
  };
  BA.patchSettings = function (f) { BA.mutate("dir", function (d) { Object.assign(d.settings, f); }); };
  BA.importRows = function (rows) { var res; BA.mutate("dir", function (d) { var r = B.importContacts(d, B.clone(rows)); if (!res) res = r; }); return res; };

  /* ---------- deals ---------- */
  BA.patchDeal = function (id, f) {
    BA.mutate("deals", function (dd) {
      var d = dd.deals.filter(function (x) { return x.id === id; })[0]; if (!d) return; var ch = [];
      Object.keys(f).forEach(function (k) { if (JSON.stringify(d[k]) !== JSON.stringify(f[k])) { ch.push({ field: k, from: d[k], to: f[k] }); d[k] = f[k]; if (["state", "commission"].indexOf(k) < 0) d.edited[k] = true; } });
      if (ch.length) { d.description = B.describe(d) || d.description; d.history = (d.history || []).concat([{ at: iso(), note: "Edited by you", changes: ch }]).slice(-30); }
    });
  };
  BA.addDeal = function (f) {
    var d = Object.assign(B.emptyDeal(), f), at = iso(); d.id = B.uid("d"); d.firstSeen = at; d.lastSeen = at; d.state = "reviewed"; d.source = "manual"; d.history = [{ at: at, note: "Added by you" }];
    d.edited = {}; Object.keys(f).forEach(function (k) { d.edited[k] = true; });
    B.place(d, S.dir); d.description = B.describe(d);
    BA.mutate("deals", function (dd) { dd.deals.push(B.clone(d)); }); return d.id;
  };
  BA.deleteDeal = function (id) { BA.mutate("deals", function (dd) { dd.deals = dd.deals.filter(function (x) { return x.id !== id; }); }); };
  BA.patchReply = function (id, f) { BA.mutate("deals", function (dd) { var r = dd.replies.filter(function (x) { return x.id === id; })[0]; if (r) Object.assign(r, f); }); };
  /* "Still available?" check: deals not seen in a reply for 45+ days, still open. */
  BA.staleDeals = function () { var t = B.todayIso(now()); return S.deals.deals.filter(function (d) { return B.stale(d, t); }); };

  BA.nowIso = iso;
  root.BLDAPP = BA;
})(window);
