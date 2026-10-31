/* Email tab for Closing Desk: who gets an email, what it says, and how fast it goes out so Gmail never blocks you.
   gmail.js does the Google sign-in and sending. This file decides who, when and how many.

   The safety rules (all on by default, none can be turned off from the screen):
   - One email per person, sent one at a time. Never a long BCC list.
   - A daily cap far under Gmail's own limit, counted over a rolling 24 hours (everything sent through this app).
   - A warm-up: the first days allow fewer emails, so a brand new sending pattern does not look like a blast.
   - A random pause between emails, and sending only inside your chosen hours.
   - If Gmail says "slow down", sending stops, the cap is cut in half, and nothing is retried right away.
   - Only people with consent recorded, never anyone who unsubscribed, bounced or was emailed recently.
   - If an email might or might not have gone (network trouble), it is never sent a second time on its own. */
(function () {
  "use strict";
  var A = window.CDApp, Mail = window.CDMail;
  if (!A || !Mail) return;
  var S = A.S, $ = A.$, esc = A.esc, toast = A.toast;

  var DAY = 86400000, LOCK_MS = 6 * 60000;
  var CEIL = { personal: 200, workspace: 500 };         /* most this app will ever send in 24 hours */
  var GMAIL_LIMIT = { personal: 500, workspace: 2000 }; /* Gmail's own limit for everything you send */
  var RAMP = [20, 30, 40, 60, 80, 100, 120];            /* warm-up: allowed per day on sending day 1, 2, 3... */
  var PACE = { gentle: [45000, 90000, "Gentle: about 1 a minute"], normal: [20000, 45000, "Normal: about 2 a minute"] };
  var CONSENT = {
    express: { label: "Said yes", help: "They agreed to get my emails. Does not expire." },
    client: { label: "Client", help: "Bought or sold with me. Good for about 2 years from the date." },
    inquiry: { label: "Asked me", help: "They contacted me with a question. Good for about 6 months from the date." }
  };
  var DEF = {
    clientId: "", senderName: "", brokerage: "The Modern Real Estate Group at Real Broker", address: "", phone: "",
    reason: "You are getting this because you have been in touch with me about buying or selling a home.",
    account: "personal", cap: 100, pace: "normal", winStart: 8, winEnd: 20, freqDays: 30,
    sendDays: 0, lastDay: "", tests: [], limitAt: 0, camp: null, lock: null, hist: [], draft: null
  };
  var REASONS = { noemail: "No email address", badfmt: "Email looks wrong", bounced: "Address bounced", unsub: "Unsubscribed", dead: "Marked Dead", noconsent: "No consent recorded",
    expired: "Consent has expired", own: "Your own address", dup: "Same address as another contact", recent: "Emailed recently" };
  var TPL = [
    { id: "checkin", name: "Friendly check-in", subject: "Checking in, {first}", body: "Hi {first},\n\nI was thinking of you and wanted to say hello. How are things going?\n\nIf you are thinking about buying or selling, or you are just curious what your home might be worth, reply to this email and tell me what you have in mind. No pressure either way.\n\nTalk soon,\n{sender}" },
    { id: "market", name: "Offer a market update", subject: "A quick hello from {sender}", body: "Hi {first},\n\nIf you would like to know what has been happening in the Calgary area market, or what it could mean for you, just reply and I will send you a short, personal update.\n\nHope you and your family are well.\n\n{sender}" }
  ];
  var M = { on: false, timer: 0, busy: false, nextAt: 0, note: "", bad: 0, unsubOk: null, unsubMsg: "", draft: null, confirmStop: false, hb: 0, live: 0, wl: null, loading: false };

  /* ---------- settings ---------- */
  function mcfg() { return Object.assign({}, DEF, S.settings.mail || {}); }
  function saveMail(f) { return A.saveSettings({ mail: Object.assign({}, mcfg(), f) }); }
  function setCamp(f) { var c = mcfg().camp; if (!c) return; saveMail({ camp: Object.assign({}, c, f) }); }
  function dev() { try { var d = localStorage.getItem("cd.dev"); if (!d) { d = rhex(6); localStorage.setItem("cd.dev", d); } return d; } catch (e) { return "tmp"; } }
  function rhex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a).map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function clock(ts) { return new Date(ts).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }); }
  function dayClock(ts) { var d = new Date(ts); return (d.toDateString() === new Date().toDateString() ? "today" : d.toLocaleDateString("en-CA", { weekday: "short" })) + " " + clock(ts); }
  function ymd(ts) { var d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function sentence(t) { return /[.!?]$/.test(t) ? t : t + "."; }
  function hr(h) { return (h % 12 || 12) + (h < 12 ? " am" : " pm"); }
  function unsubBase() { return new URL("unsub.html", location.href).href; }

  /* ---------- how many we may send ---------- */
  function priorDays(c) { return Math.max(0, (c.sendDays || 0) - (c.lastDay === A.today() ? 1 : 0)); }
  function rampCap(c) { var p = priorDays(c); return p >= RAMP.length ? Infinity : RAMP[p]; }
  function effCap(c) { c = c || mcfg(); return Math.max(1, Math.min(Number(c.cap) || 50, CEIL[c.account] || 200, rampCap(c))); }
  function stamps() {
    var cut = Date.now() - DAY, out = [];
    A.all().forEach(function (c) { var t = Number(c.mailAt) || 0; if (t > cut && (c.mailSt === "sending" || c.mailSt === "sent" || c.mailSt === "uncertain")) out.push(t); });
    (mcfg().tests || []).forEach(function (t) { if (t > cut) out.push(t); });
    return out.sort(function (a, b) { return a - b; });
  }

  /* ---------- who is allowed ---------- */
  var EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;
  function consentOk(c, td) {
    if (c.consent === "express") return "ok";
    if ((c.consent === "client" || c.consent === "inquiry") && /^\d{4}-\d\d-\d\d$/.test(c.consentAt || "")) return A.addDays(c.consentAt, c.consent === "client" ? 730 : 182) >= td ? "ok" : "expired";
    return "none";
  }
  function why(c, cfg, own, seen, now, td) {
    var e = String(c.email || "").trim().toLowerCase();
    if (!e) return "noemail";
    if (!EMAIL_RE.test(e)) return "badfmt";
    if (c.emailBad) return "bounced";
    if (c.unsub) return "unsub";
    if (c.stage === "Dead") return "dead";
    var k = consentOk(c, td); if (k === "none") return "noconsent"; if (k === "expired") return "expired";
    if (e === own) return "own";
    if (seen[e]) return "dup";
    var t = Number(c.mailAt) || 0;
    if (t && (c.mailSt === "sent" || c.mailSt === "sending" || c.mailSt === "uncertain") && now - t < (Number(cfg.freqDays) || 0) * DAY) return "recent";
    return "";
  }
  function inFilter(c, f) {
    if (f.kind && c.kind !== f.kind) return false;
    if (f.stage && A.stageLabel(c) !== f.stage) return false;
    if (f.temp && c.temp !== f.temp) return false;
    if (f.prov && c.province !== f.prov) return false;
    if (f.tag && !(c.tags || []).some(function (t) { return t.indexOf(String(f.tag).toLowerCase().trim()) >= 0; })) return false;
    return true;
  }
  function byTemp(a, b) { var x = A.TEMPS.indexOf(a.temp), y = A.TEMPS.indexOf(b.temp); x = x < 0 ? 9 : x; y = y < 0 ? 9 : y; return x - y || A.nm(a).localeCompare(A.nm(b)); }
  function audience(f, campId) {
    var cfg = mcfg(), own = (Mail.email() || "").toLowerCase(), now = Date.now(), td = A.today(), seen = {}, skip = {}, ok = [], done = 0;
    var list = A.all().filter(function (c) { return inFilter(c, f || {}); });
    list.forEach(function (c) { if (campId && c.mailCid === campId) { done++; if (c.email) seen[String(c.email).trim().toLowerCase()] = 1; } });
    list.sort(byTemp).forEach(function (c) {
      if (campId && c.mailCid === campId) return;
      var r = why(c, cfg, own, seen, now, td);
      if (r) { skip[r] = (skip[r] || 0) + 1; return; }
      seen[String(c.email).trim().toLowerCase()] = 1; ok.push(c);
    });
    return { ok: ok, skip: skip, total: list.length, done: done };
  }

  /* ---------- writing the message ---------- */
  function merge(text, c, cfg) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      k = k.toLowerCase();
      if (k === "first") return A.greetName(c); if (k === "last") return c.last || ""; if (k === "city") return c.city || ""; if (k === "sender") return cfg.senderName || "";
      return m;
    });
  }
  function unknownTokens(t) { var bad = []; String(t).replace(/\{(\w+)\}/g, function (m, k) { if (!/^(first|last|city|sender)$/i.test(k) && bad.indexOf(m) < 0) bad.push(m); return m; }); return bad; }
  function footerLines(cfg, from) { return [cfg.senderName + (cfg.brokerage ? ", " + cfg.brokerage : ""), cfg.address, [cfg.phone, from].filter(Boolean).join(" | ")].filter(Boolean); }
  function footerText(cfg, from, url) { return "--\n" + footerLines(cfg, from).join("\n") + "\n\n" + cfg.reason + "\nUnsubscribe: " + url; }
  function footerHtml(cfg, from, url) {
    return '<hr style="border:0;border-top:1px solid #ddd;margin:22px 0 12px"><p style="margin:0;font-size:12px;line-height:1.55;color:#666">' + footerLines(cfg, from).map(esc).join("<br>") +
      "</p><p style=\"margin:10px 0 0;font-size:12px;line-height:1.55;color:#666\">" + esc(cfg.reason) + ' <a href="' + esc(url) + '" style="color:#666">Unsubscribe</a></p>';
  }
  function compose(c, o, cfg, from, token, tag) {
    var url = unsubBase() + "?t=" + token, subject = (tag || "") + merge(o.subject, c, cfg), body = merge(o.body, c, cfg);
    var text = body + "\n\n" + footerText(cfg, from, url);
    var html = '<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222">' + Mail.textToHtml(body) + footerHtml(cfg, from, url) + "</div>";
    return { subject: subject, raw: Mail.raw({ from: { name: cfg.senderName, email: from }, to: String(c.email).trim(), subject: subject, text: text, html: html, unsubUrl: url, unsubMail: from }) };
  }

  /* ---------- checks before sending ---------- */
  var SPAM = /(\bfree\b|act now|limited time|urgent|winner|100%|\$\$|click here|risk[- ]free|!!)/i;
  var RECA = /\b(best|#1|number one|no\.\s?1|top[- ]rated|top[- ]producer|leading|guaranteed?|lowest|highest|cheapest|unbeatable|most trusted)\b/i;
  function recaHit(t) { var m = RECA.exec(String(t).replace(/\b(best regards|best wishes|all the best|kind regards)\b/ig, "").replace(/^\s*best,?\s*$/igm, "")); return m ? m[0] : ""; }
  function preflight(o, aud, cfg) {
    var blocks = [], warns = [];
    if (!cfg.clientId) blocks.push("Add your Google Client ID in Email settings.");
    if (!cfg.senderName.trim()) blocks.push("Add your name in Email settings. Every email must say who it is from.");
    if (!cfg.address.trim()) blocks.push("Add your mailing address in Email settings. Canadian anti-spam law requires it in every email.");
    if (!o.subject.trim()) blocks.push("Write a subject line.");
    if (!o.body.trim()) blocks.push("Write the email.");
    var bad = unknownTokens(o.subject + " " + o.body); if (bad.length) blocks.push("Unknown field " + bad.join(", ") + ". You can use {first}, {last}, {city} and {sender}.");
    if (M.unsubOk !== true) blocks.push(M.unsubOk === false ? "The unsubscribe link is not working yet: " + M.unsubMsg : "Test the unsubscribe link in Email settings first.");
    if (!Mail.token()) blocks.push("Connect Gmail.");
    if (!aud.ok.length) blocks.push("Nobody in this list can be emailed yet. Check consent below.");
    if (SPAM.test(o.subject + " " + o.body)) warns.push("Words like free, urgent or act now can send an email to spam.");
    if (o.subject.length > 70) warns.push("The subject is long. Under 60 characters shows fully on a phone.");
    if (o.subject.replace(/[^A-Z]/g, "").length > 6 && o.subject === o.subject.toUpperCase()) warns.push("The subject is in all capitals.");
    if (o.body.trim() && !/\{first\}/i.test(o.subject + " " + o.body)) warns.push("Add {first} so each email greets the person by name.");
    if ((o.body.match(/https?:\/\//g) || []).length > 2) warns.push("More than 2 links can look like spam. Fewer is safer.");
    var rc = recaHit(o.subject + " " + o.body); if (rc) warns.push("RECA: \"" + rc + "\" is a claim you may not be able to prove. Remove it or back it up.");
    if (S.offline) warns.push("You are offline right now.");
    return { blocks: blocks, warns: warns };
  }

  /* ---------- unsubscribe link test ---------- */
  function checkUnsub() {
    var cfg = window.CD_CONFIG || {}; M.unsubOk = null; M.unsubMsg = "Checking..."; refreshChecks();
    var rpc = fetch(cfg.url + "/rest/v1/rpc/unsubscribe_contact", { method: "POST", headers: { apikey: cfg.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: "0".repeat(32) }) })
      .then(function (r) { return r.ok ? r.json().then(function (j) { return j === false; }) : false; }, function () { return false; });
    var page = fetch(unsubBase(), { cache: "no-store" }).then(function (r) { return r.ok; }, function () { return false; });
    return Promise.all([rpc, page]).then(function (r) {
      M.unsubOk = r[0] && r[1];
      M.unsubMsg = M.unsubOk ? "Working: the page is online and the database answered." : (!r[0] ? "the database does not have the unsubscribe function yet. Run supabase/email.sql in the Supabase SQL Editor." : "the unsubscribe page was not found online. Publish unsub.html with the rest of the app.");
      refreshChecks(); refreshCampResult(); A.render();
    });
  }

  /* ---------- the engine ---------- */
  function later(ms) { clearTimeout(M.timer); M.timer = setTimeout(tick, ms); }
  function jitter() { var p = PACE[mcfg().pace] || PACE.normal; return p[0] + Math.random() * (p[1] - p[0]); }
  function startEngine() {
    if (M.on) return; M.on = true; M.note = ""; M.bad = 0; M.nextAt = Date.now() + 3000 + Math.random() * 5000;
    saveMail({ lock: { dev: dev(), at: Date.now() } });
    clearInterval(M.hb); M.hb = setInterval(function () { if (M.on) saveMail({ lock: { dev: dev(), at: Date.now() } }); }, 120000);
    clearInterval(M.live); M.live = setInterval(updateLive, 1000);
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { M.wl = l; }, function () {}); } catch (e) {}
    later(100); A.render();
  }
  function stopEngine(keepLock) {
    M.on = false; clearTimeout(M.timer); clearInterval(M.hb); clearInterval(M.live); M.note = "";
    try { if (M.wl) { M.wl.release(); M.wl = null; } } catch (e) {}
    var lk = mcfg().lock; if (!keepLock && lk && lk.dev === dev()) saveMail({ lock: null });
    A.render();
  }
  function counts(camp) {
    var r = { sent: 0, rejected: 0, unsure: 0 };
    A.all().forEach(function (c) { if (c.mailCid !== camp.id) return; if (c.mailSt === "sent") r.sent++; else if (c.mailSt === "fail") r.rejected++; else if (c.mailSt === "uncertain" || c.mailSt === "sending") r.unsure++; });
    return r;
  }
  function finish(kind) {
    var camp = mcfg().camp, n = counts(camp), hist = [{ name: camp.subject.slice(0, 60), at: Date.now(), sent: n.sent, rejected: n.rejected, unsure: n.unsure, how: kind }].concat(mcfg().hist || []).slice(0, 10);
    saveMail({ camp: Object.assign({}, camp, { status: kind, doneAt: Date.now() }), hist: hist });
    stopEngine(); toast(kind === "done" ? "Campaign finished: " + n.sent + " sent" : "Campaign stopped: " + n.sent + " sent");
  }
  function pauseNow(kind, msg, ms) {
    setCamp({ status: "paused", pauseKind: kind, pauseMsg: msg, pauseUntil: ms ? Date.now() + ms : 0 });
    if (!ms) stopEngine(); else { M.busy = false; later(1000); }
    toast(msg);
  }
  function tick() {
    M.timer = 0; if (!M.on) return;
    var cfg = mcfg(), camp = cfg.camp, now = Date.now();
    if (!S.user || !camp) return stopEngine();
    if (camp.status === "paused" && camp.pauseUntil) {
      if (now >= camp.pauseUntil) { setCamp({ status: "running", pauseUntil: 0, pauseMsg: "", pauseKind: "" }); M.nextAt = now + 5000; return later(300); }
      M.note = camp.pauseMsg + " " + sentence("Starts again at " + dayClock(camp.pauseUntil)); return later(Math.min(camp.pauseUntil - now, 15000));
    }
    if (camp.status !== "running") return stopEngine();
    var lk = cfg.lock; if (lk && lk.dev !== dev() && now - lk.at < LOCK_MS) { stopEngine(true); toast("This campaign is running on another device. Pause it there first."); return; }
    M.note = "";
    if (M.busy) return later(500);
    if (S.offline) { M.note = "Offline. Waiting for your connection."; return later(5000); }
    if (!Mail.token()) { M.note = "Gmail sign-in ended. Tap Connect Gmail to keep going."; return later(3000); }
    var h = new Date(now).getHours();
    if (h < cfg.winStart || h >= cfg.winEnd) { M.note = "Outside your sending hours (" + hr(cfg.winStart) + " to " + hr(cfg.winEnd) + "). Waiting."; return later(30000); }
    var st = stamps(), eff = effCap(cfg);
    if (st.length >= eff) { var until = st[st.length - eff] + DAY + 1000; M.note = sentence("Reached the limit of " + eff + " in 24 hours. Next email " + dayClock(until)); return later(Math.max(1000, Math.min(until - now, 30000))); }
    if (now < M.nextAt) return later(Math.max(250, Math.min(M.nextAt - now, 1000)));
    var aud = audience(camp.f || {}, camp.id);
    if (!aud.ok.length) return finish("done");
    sendOne(aud.ok[0], camp, cfg);
  }
  function sendOne(c, camp, cfg) {
    M.busy = true;
    var prev = { mailAt: Number(c.mailAt) || 0, mailSt: c.mailSt || "", mailCid: c.mailCid || "" }, token = /^[0-9a-f]{32}$/.test(c.utoken || "") ? c.utoken : rhex(16), id = c.id, now = Date.now();
    var revert = function () { return A.patchNow(id, prev); };
    /* 1. Write "about to send" first. If this cannot be saved, nothing is sent. */
    A.patchNow(id, { utoken: token, mailAt: now, mailSt: "sending", mailCid: camp.id, mailPrev: prev.mailSt === "sent" ? prev.mailAt : 0 }).then(function (saved) {
      if (!saved) { M.busy = false; M.note = "Could not save to the database. Trying again shortly."; return later(8000); }
      var msg; try { msg = compose(S.contacts.get(id) || c, camp, cfg, Mail.email(), token); } catch (e) { return revert().then(function () { pauseNow("error", "Could not build the email: " + e.message); }); }
      return Mail.send(msg.raw).then(function (r) { return sent(id, camp, msg.subject, r); }, function (err) { return failed(id, err, prev, camp); });
    }).catch(function (e) { M.busy = false; pauseNow("error", "Something went wrong: " + ((e && e.message) || "unknown error")); });
  }
  function sent(id, camp, subject, r) {
    var cur = S.contacts.get(id) || {}, td = A.today(), cfg = mcfg();
    A.patchNow(id, { mailSt: "sent", mailGid: r.id || "", mailCount: (cur.mailCount || 0) + 1, log: [{ d: td, t: "Mass email: " + subject }].concat(cur.log || []).slice(0, 60) });
    if (cfg.lastDay !== td) saveMail({ sendDays: (cfg.sendDays || 0) + 1, lastDay: td });
    M.bad = 0; M.busy = false; M.nextAt = Date.now() + jitter(); A.render(); later(500);
  }
  function failed(id, err, prev, camp) {
    var k = (err && err.kind) || "other", revert = function () { return A.patchNow(id, prev); }, cfg = mcfg();
    M.busy = false;
    if (k === "auth") { Mail.forget(); return revert().then(function () { M.note = "Gmail sign-in ended. Tap Connect Gmail to keep going."; A.render(); later(3000); }); }
    if (k === "limit") {
      var again = cfg.limitAt && Date.now() - cfg.limitAt < DAY, newCap = Math.max(10, Math.floor(Math.min(Number(cfg.cap) || 50, CEIL[cfg.account]) / 2));
      return revert().then(function () {
        saveMail({ limitAt: Date.now(), cap: newCap });
        pauseNow("limit", "Gmail asked us to slow down, so sending is paused and the daily cap is now " + newCap + ".", again ? DAY : 3600000);
      });
    }
    if (k === "bad") {
      var cur = S.contacts.get(id) || {};
      A.patchNow(id, { emailBad: true, mailSt: "fail", mailAt: prev.mailAt, mailCid: camp.id, log: [{ d: A.today(), t: "Mass email rejected: Gmail says this address is not valid" }].concat(cur.log || []).slice(0, 60) });
      M.bad++; if (M.bad >= 5) { return pauseNow("bad", "Gmail rejected 5 addresses in a row. Check your list before continuing."); }
      M.nextAt = Date.now() + jitter(); A.render(); return later(500);
    }
    if (k === "denied") { Mail.forget(); return revert().then(function () { pauseNow("denied", "Google refused permission to send. Tap Connect Gmail and tick the box that allows sending."); }); }
    if (k === "server" || k === "network") {
      A.patchNow(id, { mailSt: "uncertain" });
      return pauseNow("uncertain", "Not sure if the last email went out (" + (err.message || k) + "). Check your Gmail Sent folder, mark it below, then resume.");
    }
    return revert().then(function () { pauseNow("error", "Gmail said: " + ((err && err.message) || "unknown error")); });
  }
  window.addEventListener("beforeunload", function (e) { if (M.on) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- connect / test ---------- */
  function connectGmail(then) {
    var cfg = mcfg(); if (!cfg.clientId) { toast("Add your Google Client ID in Email settings first."); return; }
    if (!Mail.ready()) { Mail.load().then(function () { toast("Google sign-in is ready. Tap again."); }, function (e) { toast(e.message); }); return; }
    Mail.connect(cfg.clientId, "").then(function (email) { toast("Gmail connected: " + email); A.render(); if (then) then(); }, function (e) { toast(e.message || "Could not connect."); });
  }
  function testSend() {
    var cfg = mcfg(); if (!Mail.token()) { toast("Connect Gmail first."); return; }
    if (!cfg.senderName.trim() || !cfg.address.trim()) { toast("Add your name and mailing address in Email settings first."); return; }
    var o = M.draft || { subject: "", body: "" }; if (!o.subject.trim() || !o.body.trim()) { toast("Write the subject and the email first."); return; }
    var sample = { first: "Alex", last: "Sample", city: "Calgary", email: Mail.email() }, msg = compose(sample, o, cfg, Mail.email(), "0".repeat(32), "[TEST] ");
    $("#cpTest").disabled = true;
    Mail.send(msg.raw).then(function () {
      var cut = Date.now() - DAY; saveMail({ tests: (cfg.tests || []).filter(function (t) { return t > cut; }).concat([Date.now()]) });
      toast("Test sent to " + Mail.email() + ". Open it and check how it looks."); var b = $("#cpTest"); if (b) b.disabled = false;
    }, function (e) { toast("Test failed: " + (e.message || e.kind)); var b = $("#cpTest"); if (b) b.disabled = false; if (e.kind === "auth") { Mail.forget(); A.render(); } });
  }

  /* ---------- sheets ---------- */
  function panel(id, title, inner, closeLabel) {
    S.sheetId = id;
    $("#sheetHost").innerHTML = '<div class="veil" id="veil"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-top"><h2>' + esc(title) + '</h2><button class="btn" type="button" data-act="closesheet">' + (closeLabel || "Close") + "</button></div>" + inner + "</div></div>";
    $("#veil").addEventListener("click", function (e) { if (e.target.id === "veil") A.closeSheet(); });
  }
  function chipRow(act, list, cur) { return '<div class="chips">' + list.map(function (x) { return '<button class="chip" type="button" data-act="' + act + '" data-v="' + esc(x[0]) + '" aria-pressed="' + (x[0] === cur ? "true" : "false") + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>"; }

  function openSettings() {
    var c = mcfg(), hours = []; for (var i = 0; i < 24; i++) hours.push(i);
    var sel = function (id, v) { return '<select class="field" id="' + id + '">' + hours.map(function (h) { return '<option value="' + h + '"' + (h === v ? " selected" : "") + ">" + hr(h) + "</option>"; }).join("") + "</select>"; };
    panel("__mailset", "Email settings",
      '<div class="stack">' +
      '<div class="sec-lbl">Google connection</div><label>Google Client ID<input class="field" id="msClient" autocomplete="off" spellcheck="false" placeholder="123456-abc.apps.googleusercontent.com" value="' + esc(c.clientId) + '"></label><div class="note">Not a secret. You create it once in Google Cloud (steps are in the README).</div>' +
      '<div id="msGm"></div>' +
      '<div class="sec-lbl">Who the email is from (required by law)</div>' +
      '<div class="two"><label>Your name<input class="field" id="msName" autocomplete="off" value="' + esc(c.senderName) + '"></label><label>Phone (optional)<input class="field" id="msPhone" inputmode="tel" value="' + esc(c.phone) + '"></label></div>' +
      '<label>Brokerage line<input class="field" id="msBrand" value="' + esc(c.brokerage) + '"></label><div class="note">Check with your brokerage that this wording is how your advertising must show your name and brokerage.</div>' +
      '<label>Mailing address<textarea class="field" id="msAddr" rows="2" placeholder="Street, city, province, postal code">' + esc(c.address) + "</textarea></label>" +
      '<label>Why they are getting it<textarea class="field" id="msReason" rows="2">' + esc(c.reason) + "</textarea></label>" +
      '<div class="sec-lbl">Gmail account type</div>' + chipRow("mail-acct", [["personal", "Free Gmail"], ["workspace", "Google Workspace (paid)"]], c.account) +
      '<div class="note" id="msLimits"></div>' +
      '<div class="two"><label>Daily cap<input class="field num" id="msCap" type="number" min="10" value="' + c.cap + '"></label><label>Skip anyone emailed in the last (days)<input class="field num" id="msFreq" type="number" min="1" max="365" value="' + c.freqDays + '"></label></div>' +
      '<div class="sec-lbl">Speed</div>' + chipRow("mail-pace", Object.keys(PACE).map(function (k) { return [k, PACE[k][2]]; }), c.pace) +
      '<div class="sec-lbl">Only send between</div><div class="two"><label>From' + sel("msWs", c.winStart) + "</label><label>Until" + sel("msWe", c.winEnd) + "</label></div>" +
      '<div class="sec-lbl">Unsubscribe link</div><div class="note" id="msUn"></div><button class="btn" type="button" data-act="mail-checkun">Test unsubscribe link</button>' +
      '<div class="note">Links in your emails open: ' + esc(unsubBase()) + "</div>" +
      '<div class="sec-lbl">What every email ends with</div><pre class="note" id="msFoot" style="white-space:pre-wrap;margin:0"></pre>' +
      "</div>");
    refreshChecks();
  }
  function refreshChecks() {
    var c = mcfg();
    var gm = $("#msGm"); if (gm) gm.innerHTML = Mail.token() ? '<div class="row"><span class="pill cold">Connected</span><span>' + esc(Mail.email()) + '</span><button class="btn small" type="button" data-act="mail-disconnect">Disconnect</button></div>' : '<button class="btn primary" type="button" data-act="mail-connect">Connect Gmail</button>';
    var lim = $("#msLimits"); if (lim) lim.textContent = "Gmail itself allows about " + GMAIL_LIMIT[c.account] + " a day across everything you send, including your normal email. This app will never send more than " + CEIL[c.account] + " in 24 hours, and today's limit is " + effCap(c) + (priorDays(c) < RAMP.length ? " because it is still warming up" : "") + ".";
    var un = $("#msUn"); if (un) un.textContent = M.unsubOk === true ? "Working. " + M.unsubMsg : (M.unsubOk === false ? "Not working: " + M.unsubMsg : M.unsubMsg || "Not tested yet.");
    var ft = $("#msFoot"); if (ft) ft.textContent = footerText(c, Mail.email() || "you@gmail.com", unsubBase() + "?t=...");
    var co = $("#cpChecks"); if (co) co.innerHTML = checksHtml(c);
  }
  function checksHtml(c) {
    var items = [[!!c.clientId, "Google Client ID added"], [!!c.senderName.trim() && !!c.address.trim(), "Your name and mailing address added"], [M.unsubOk === true, "Unsubscribe link tested"], [!!Mail.token(), "Gmail connected"]];
    return items.map(function (x) { return '<div class="chk ' + (x[0] ? "ok" : "no") + '"><b>' + (x[0] ? "&#10003;" : "&#10007;") + "</b><span>" + esc(x[1]) + "</span></div>"; }).join("");
  }
  function openCampaign() {
    var cfg = mcfg(); M.draft = Object.assign({ subject: "", body: "", f: {} }, cfg.draft || {}); M.draft.f = Object.assign({}, M.draft.f);
    var f = M.draft.f, provs = A.PROVS.filter(function (p) { return A.all().some(function (c) { return c.province === p; }); });
    Mail.load().catch(function () {});
    if (M.unsubOk === null && !M.unsubMsg) checkUnsub();
    panel("__camp", "New email campaign",
      '<div class="stack"><div class="sec-lbl" style="margin-top:0">Start from</div><select class="field" id="cpTpl"><option value="">My own words</option>' + TPL.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("") + "</select>" +
      '<label>Subject<input class="field" id="cpSubj" autocomplete="off" value="' + esc(M.draft.subject) + '"></label>' +
      '<label>Email<textarea class="field" id="cpBody" rows="10">' + esc(M.draft.body) + "</textarea></label>" +
      '<div class="row"><span class="note">Insert:</span>' + ["{first}", "{city}", "{last}", "{sender}"].map(function (t) { return '<button class="chip" type="button" data-act="mail-ins" data-v="' + t + '">' + t + "</button>"; }).join("") + "</div>" +
      '<div class="note">Your name, brokerage, address and an unsubscribe link are added at the bottom automatically.</div>' +
      '<div class="sec-lbl">Who gets it</div><div class="two"><select class="field" id="cpKind" aria-label="Type">' + A.opt(A.KINDS, f.kind, "Any type") + '</select><select class="field" id="cpStage" aria-label="Stage">' + A.opt(A.ALL_STAGES, f.stage, "Any stage") + "</select></div>" +
      '<div class="two"><select class="field" id="cpTemp" aria-label="Temperature">' + A.opt(A.TEMPS, f.temp, "Any temperature") + '</select><select class="field" id="cpProv" aria-label="Province">' + A.opt(provs, f.prov, "All provinces") + "</select></div>" +
      '<input class="field" id="cpTag" placeholder="Tag contains (optional)" value="' + esc(f.tag || "") + '">' +
      '<div id="cpResult"></div><div id="cpChecks" class="stack" style="gap:4px"></div>' +
      '<div class="row"><button class="btn" type="button" id="cpTest" data-act="mail-test">Send a test to me</button><button class="btn primary" type="button" id="cpGo" data-act="mail-go">Start sending</button></div>' +
      '<button class="btn small" type="button" data-act="mail-settings">Email settings</button></div>');
    refreshCampResult(); refreshChecks();
  }
  function readDraft() {
    var g = function (id) { var e = $("#" + id); return e ? e.value : ""; };
    M.draft = { subject: g("cpSubj"), body: g("cpBody"), f: { kind: g("cpKind"), stage: g("cpStage"), temp: g("cpTemp"), prov: g("cpProv"), tag: g("cpTag").trim() } };
  }
  function refreshCampResult() {
    var box = $("#cpResult"); if (!box) return;
    var cfg = mcfg(), d = M.draft, aud = audience(d.f, ""), pf = preflight(d, aud, cfg), eff = effCap(cfg);
    var rows = Object.keys(REASONS).filter(function (k) { return aud.skip[k]; }).map(function (k) { return "<tr><td>" + esc(REASONS[k]) + '</td><td class="num">' + aud.skip[k] + "</td></tr>"; }).join("");
    var days = Math.ceil(aud.ok.length / eff);
    box.innerHTML = '<div class="card stack"><div class="row" style="justify-content:space-between"><strong class="num">' + aud.ok.length + ' can be emailed</strong><span class="muted num">' + aud.total + " in this list</span></div>" +
      (rows ? '<table class="rh"><tr><th>Left out</th><th>People</th></tr>' + rows + "</table>" : "") +
      (aud.ok.length ? '<div class="note">Today\'s limit is ' + eff + ", so this takes about " + days + (days === 1 ? " day" : " days") + ". Keep this page open while it sends.</div>" : "") +
      pf.blocks.map(function (b) { return '<div class="blk">' + esc(b) + "</div>"; }).join("") + pf.warns.map(function (w) { return '<div class="warn" style="margin:0">' + esc(w) + "</div>"; }).join("") + "</div>";
    var go = $("#cpGo"); if (go) go.disabled = pf.blocks.length > 0;
    var ck = $("#cpChecks"); if (ck) ck.innerHTML = checksHtml(cfg);
  }
  function startCampaign() {
    readDraft(); var cfg = mcfg(), aud = audience(M.draft.f, ""), pf = preflight(M.draft, aud, cfg);
    if (pf.blocks.length) { refreshCampResult(); return; }
    var camp = { id: "k" + Date.now().toString(36), subject: M.draft.subject.trim(), body: M.draft.body, f: M.draft.f, startedAt: Date.now(), status: "running", total: aud.ok.length };
    saveMail({ camp: camp, draft: M.draft }); A.closeSheet(); toast("Sending started. Keep this page open."); startEngine();
  }
  function openConsent() {
    var n = S.selected.size; if (!n) return;
    M.cons = { v: "express", at: A.today() };
    panel("__consent", "Email consent for " + n + " people",
      '<div class="stack"><p class="note" style="margin:0">Only mark people who really fit. Canadian anti-spam law (CASL) says you must be able to prove it, and you are the one who has to.</p>' +
      chipRow("mail-cv", [["express", CONSENT.express.label], ["client", CONSENT.client.label], ["inquiry", CONSENT.inquiry.label], ["none", "Clear"]], "express") +
      '<div class="note" id="cnHelp">' + esc(CONSENT.express.help) + '</div><label>Date<input class="field" id="cnDate" type="date" value="' + A.today() + '"></label>' +
      '<div class="note">For Client, use the closing date. For Asked me, use the day they contacted you. Express does not expire.</div>' +
      '<button class="btn primary" type="button" data-act="mail-cgo">Apply to ' + n + " contacts</button></div>");
  }

  /* ---------- the Email tab ---------- */
  function liveText() { if (!M.on) return ""; if (M.note) return M.note; if (M.busy) return "Sending..."; if (M.nextAt > Date.now()) return "Next email in " + Math.ceil((M.nextAt - Date.now()) / 1000) + " seconds"; return "Sending..."; }
  function updateLive() {
    var el = $("#mailLive"); if (el) el.textContent = liveText();
    var tk = $("#mailTok"); if (tk && Mail.token()) tk.textContent = "Sign-in lasts about " + Math.max(1, Math.round((Mail.expiresAt() - Date.now()) / 60000)) + " more minutes.";
  }
  function renderEmail() {
    if (!M.loading) { M.loading = true; Mail.load().catch(function () {}); }
    var cfg = mcfg(), camp = cfg.camp, h = "", n = stamps().length, eff = effCap(cfg), pct = Math.min(100, Math.round(n / eff * 100));
    var live = Mail.token();
    h += '<div class="card stack"><div class="row" style="justify-content:space-between"><h2>Gmail</h2>' + (live ? '<span class="pill cold">Connected</span>' : '<span class="pill stale">Not connected</span>') + "</div>" +
      (live ? "<div>Sending as <b>" + esc(Mail.email()) + '</b></div><div class="note" id="mailTok"></div><div class="row"><button class="btn small" type="button" data-act="mail-connect">Refresh sign-in</button><button class="btn small" type="button" data-act="mail-disconnect">Disconnect</button></div>' :
        '<div class="note">Closing Desk only asks to send email as you. It cannot read your inbox.</div>' + (cfg.clientId ? '<button class="btn primary" type="button" data-act="mail-connect">Connect Gmail</button>' : '<button class="btn primary" type="button" data-act="mail-settings">Set up email</button>')) +
      '<button class="btn small" type="button" data-act="mail-settings" style="align-self:flex-start">Email settings</button></div>';
    h += '<div class="card stack" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h2>Sent in the last 24 hours</h2><strong class="num">' + n + " of " + eff + '</strong></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="note">' + (priorDays(cfg) < RAMP.length ? "Warm-up day " + (priorDays(cfg) + 1) + " of " + RAMP.length + ": the limit grows each day you send. " : "") + "Gmail allows about " + GMAIL_LIMIT[cfg.account] + " a day for everything you send, so this app stays well under it.</div></div>";
    h += campaignCard(cfg, camp);
    h += attentionCard(cfg, camp);
    if ((cfg.hist || []).length) h += '<div class="card stack" style="margin-top:12px"><h2>Past campaigns</h2>' + cfg.hist.map(function (x) { return '<div class="mrow"><span>' + esc(x.name) + '<br><span class="muted">' + esc(A.fdate(ymd(x.at))) + (x.how === "stopped" ? ", stopped" : "") + '</span></span><span class="num">' + x.sent + " sent</span></div>"; }).join("") + "</div>";
    $("#view").innerHTML = h; updateLive();
  }
  function campaignCard(cfg, camp) {
    var h = '<div class="card stack" style="margin-top:12px">';
    if (!camp || camp.status === "done" || camp.status === "stopped") {
      if (camp) { var n = counts(camp); h += "<h2>Last campaign " + (camp.status === "done" ? "finished" : "stopped") + '</h2><div class="num">' + n.sent + " sent" + (n.rejected ? ", " + n.rejected + " rejected" : "") + (n.unsure ? ", " + n.unsure + " not sure" : "") + '</div><div class="muted">' + esc(camp.subject) + "</div>"; }
      else h += "<h2>Campaign</h2><div class=\"note\">Write one email, pick who gets it, and it goes out one person at a time at a safe speed.</div>";
      return h + '<button class="btn primary" type="button" data-act="mail-new">New campaign</button></div>';
    }
    var c = counts(camp), aud = audience(camp.f || {}, camp.id), total = c.sent + c.rejected + c.unsure + aud.ok.length, pct = total ? Math.round((c.sent + c.rejected + c.unsure) / total * 100) : 0;
    var lk = cfg.lock, other = lk && lk.dev !== dev() && Date.now() - lk.at < LOCK_MS, runningHere = M.on && camp.status === "running";
    h += '<div class="row" style="justify-content:space-between"><h2>' + esc(camp.subject) + "</h2>" + (runningHere ? '<span class="pill hot">Sending</span>' : '<span class="pill warm">' + (camp.status === "paused" ? "Paused" : "Stopped here") + "</span>") + "</div>" +
      '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="num">' + c.sent + " sent, " + aud.ok.length + " to go" + (c.rejected ? ", " + c.rejected + " rejected" : "") + (c.unsure ? ", " + c.unsure + " not sure" : "") + "</div>";
    if (camp.status === "paused" && camp.pauseMsg) h += '<div class="warn" style="margin:0">' + esc(camp.pauseMsg) + (camp.pauseUntil && M.on ? " " + sentence("It starts again by itself at " + dayClock(camp.pauseUntil)) : "") + "</div>";
    if (camp.status === "running" && !M.on) h += '<div class="warn" style="margin:0">' + (other ? "This campaign is running on another device." : "Sending stopped because the app was closed. Tap Resume to continue.") + "</div>";
    h += '<div class="live" id="mailLive" role="status"></div><div class="row">';
    if (runningHere || (M.on && camp.status === "paused" && camp.pauseUntil)) h += '<button class="btn" type="button" data-act="mail-pause">Pause</button>';
    else if (!other) h += '<button class="btn primary" type="button" data-act="mail-resume">Resume</button>';
    h += '<button class="btn' + (M.confirmStop ? " danger" : "") + '" type="button" data-act="mail-stop">' + (M.confirmStop ? "Tap again to stop for good" : "Stop") + "</button></div>";
    if (M.on && !Mail.token()) h += '<button class="btn primary" type="button" data-act="mail-connect">Connect Gmail</button>';
    return h + "</div>";
  }
  function attentionCard(cfg, camp) {
    var td = A.today(), unsure = [], bounced = 0, unsubs = 0, noCons = 0, now = Date.now();
    A.all().forEach(function (c) {
      if (c.mailSt === "uncertain" || (c.mailSt === "sending" && !(M.busy && camp && c.mailCid === camp.id) && now - (Number(c.mailAt) || 0) > 180000)) unsure.push(c);
      if (c.emailBad) bounced++; if (c.unsub) unsubs++;
      if (c.email && !c.unsub && !c.emailBad && c.stage !== "Dead" && consentOk(c, td) === "none") noCons++;
    });
    var h = "";
    if (unsure.length) h += '<div class="card stack" style="margin-top:12px"><h2>Not sure if these went out</h2><div class="note">Open your Gmail Sent folder and look for each one. Nothing is ever sent twice on its own.</div>' +
      unsure.map(function (c) { return '<div class="mrow"><span>' + esc(A.nm(c)) + '<br><span class="muted" style="overflow-wrap:anywhere">' + esc(c.email) + '</span></span><span class="row"><button class="btn small" type="button" data-act="mail-was" data-id="' + esc(c.id) + '">It was sent</button><button class="btn small" type="button" data-act="mail-wasnt" data-id="' + esc(c.id) + '">Not sent</button></span></div>'; }).join("") + "</div>";
    var lines = [];
    if (noCons) lines.push('<div class="mrow"><span><b class="num">' + noCons + '</b> with an email but no consent recorded</span><button class="btn small" type="button" data-act="mail-nocons">Review</button></div>');
    if (unsubs) lines.push('<div class="mrow"><span><b class="num">' + unsubs + "</b> unsubscribed. " + (unsubs === 1 ? "This person is" : "They are") + " never emailed.</span></div>");
    if (bounced) lines.push('<div class="mrow"><span><b class="num">' + bounced + "</b> " + (bounced === 1 ? "address Gmail rejected. It is skipped." : "addresses Gmail rejected. They are skipped.") + "</span></div>");
    if (lines.length) h += '<div class="card stack" style="margin-top:12px"><h2>Your list</h2>' + lines.join("") + "</div>";
    return h;
  }
  function contactPart(c) {
    var host = $("#shMail"); if (!host) return;
    var k = consentOk(c, A.today()), h = "";
    if (!c.email) { host.innerHTML = '<div class="note">Add an email address above to use this.</div>'; return; }
    h += chipRow("mail-con", [["express", CONSENT.express.label], ["client", CONSENT.client.label], ["inquiry", CONSENT.inquiry.label], ["none", "None"]], c.consent || "none");
    h += '<div class="note" style="margin-top:6px">' + (c.consent ? esc(CONSENT[c.consent].help) : "No consent recorded, so mass emails skip this person. You can still write to them yourself.") + (k === "expired" ? " <b>This consent has expired.</b>" : "") + "</div>";
    if (c.consent) h += '<label style="margin-top:6px">Consent date<input class="field" id="shConAt" type="date" value="' + esc(c.consentAt || "") + '"></label>';
    if (c.unsub) h += '<div class="warn" style="margin:8px 0 0">Unsubscribed' + (c.unsubAt ? " on " + esc(A.fdate(String(c.unsubAt).slice(0, 10))) : "") + '. <button class="btn small" type="button" data-act="mail-resub">They asked to get emails again</button></div>';
    else h += '<button class="btn small" type="button" style="margin-top:8px" data-act="mail-unsub">Mark unsubscribed</button>';
    if (c.emailBad) h += '<div class="warn" style="margin:8px 0 0">Gmail rejected this address. <button class="btn small" type="button" data-act="mail-clearbad">Fixed it, allow again</button></div>';
    if (c.mailAt && c.mailSt === "sent") h += '<div class="note" style="margin-top:6px">Last mass email: ' + esc(A.fdate(ymd(Number(c.mailAt)))) + (c.mailCount > 1 ? " (" + c.mailCount + " in total)" : "") + "</div>";
    host.innerHTML = h;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act^='mail-']"); if (!el) return;
    var a = el.dataset.act, v = el.dataset.v, id = el.dataset.id, cfg = mcfg();
    if (a === "mail-connect") connectGmail(function () { var s = $("#msGm"); if (s) refreshChecks(); var r = $("#cpResult"); if (r) refreshCampResult(); });
    else if (a === "mail-disconnect") { Mail.disconnect(); toast("Disconnected from Gmail"); refreshChecks(); A.render(); }
    else if (a === "mail-settings") openSettings();
    else if (a === "mail-new") openCampaign();
    else if (a === "mail-test") { readDraft(); testSend(); }
    else if (a === "mail-go") startCampaign();
    else if (a === "mail-checkun") checkUnsub();
    else if (a === "mail-acct") { var capv = Math.min(Number(cfg.cap) || 100, CEIL[v]); saveMail({ account: v, cap: capv }); openSettings(); }
    else if (a === "mail-pace") { saveMail({ pace: v }); openSettings(); }
    else if (a === "mail-ins") { var b = $("#cpBody"); if (b) { var s = b.selectionStart == null ? b.value.length : b.selectionStart; b.value = b.value.slice(0, s) + v + b.value.slice(b.selectionEnd == null ? s : b.selectionEnd); b.focus(); b.selectionStart = b.selectionEnd = s + v.length; readDraft(); saveMail({ draft: M.draft }); refreshCampResult(); } }
    else if (a === "mail-resume") {
      var camp = cfg.camp; if (!camp) return;
      var lk = cfg.lock; if (lk && lk.dev !== dev() && Date.now() - lk.at < LOCK_MS) { toast("It is still running on another device. Pause it there first."); return; }
      var go = function () { M.confirmStop = false; setCamp({ status: "running", pauseUntil: 0, pauseMsg: "", pauseKind: "" }); startEngine(); };
      if (Mail.token()) go(); else connectGmail(go);
    }
    else if (a === "mail-pause") { setCamp({ status: "paused", pauseKind: "user", pauseMsg: "Paused by you.", pauseUntil: 0 }); stopEngine(); }
    else if (a === "mail-stop") { if (!M.confirmStop) { M.confirmStop = true; A.render(); setTimeout(function () { if (M.confirmStop) { M.confirmStop = false; A.render(); } }, 5000); return; } M.confirmStop = false; finish("stopped"); }
    else if (a === "mail-was") A.patchNow(id, { mailSt: "sent" });
    else if (a === "mail-wasnt") { var cc = S.contacts.get(id) || {}, pv = Number(cc.mailPrev) || 0; A.patchNow(id, { mailSt: pv ? "sent" : "", mailAt: pv, mailCid: "", mailPrev: 0 }); }
    else if (a === "mail-nocons") A.openLists({ email: true, consent: "none" });
    else if (a === "mail-consent") openConsent();
    else if (a === "mail-cv") { M.cons.v = v; var hp = $("#cnHelp"); if (hp) hp.textContent = v === "none" ? "Clears any consent on these contacts." : CONSENT[v].help; document.querySelectorAll("[data-act='mail-cv']").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.v === v ? "true" : "false"); }); }
    else if (a === "mail-cgo") {
      var d = ($("#cnDate") || {}).value || A.today(), ids = Array.from(S.selected), jobs = [];
      ids.forEach(function (cid) { if (S.contacts.has(cid)) jobs.push([cid, M.cons.v === "none" ? { consent: "", consentAt: "" } : { consent: M.cons.v, consentAt: d }]); });
      toast("Updating " + jobs.length + " contacts..."); A.closeSheet();
      A.saveMany(jobs).then(function () { toast("Consent saved for " + jobs.length + " contacts"); }, function () {});
    }
    else if (a === "mail-con") { var c1 = S.contacts.get(S.sheetId); if (c1) A.save(c1.id, v === "none" ? { consent: "", consentAt: "" } : { consent: v, consentAt: c1.consentAt || A.today() }); }
    else if (a === "mail-unsub") { var c2 = S.contacts.get(S.sheetId); if (c2) A.save(c2.id, { unsub: true, unsubAt: A.today(), log: [{ d: A.today(), t: "Marked unsubscribed from email" }].concat(c2.log || []).slice(0, 60) }); }
    else if (a === "mail-resub") { var c3 = S.contacts.get(S.sheetId); if (c3) A.save(c3.id, { unsub: false, log: [{ d: A.today(), t: "Asked to get emails again" }].concat(c3.log || []).slice(0, 60) }); }
    else if (a === "mail-clearbad") { var c4 = S.contacts.get(S.sheetId); if (c4) A.save(c4.id, { emailBad: false }); }
  });
  var timer;
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.id || t.id.indexOf("cp") !== 0 || !$("#cpResult")) return;
    if (t.id === "cpTpl") return;
    readDraft(); clearTimeout(timer); timer = setTimeout(refreshCampResult, 150);
  });
  document.addEventListener("change", function (e) {
    var t = e.target, id = t.id || "";
    if (id === "cpTpl") { var tp = TPL.filter(function (x) { return x.id === t.value; })[0]; if (tp) { $("#cpSubj").value = tp.subject; $("#cpBody").value = tp.body; } readDraft(); saveMail({ draft: M.draft }); refreshCampResult(); return; }
    if (id.indexOf("cp") === 0 && $("#cpResult")) { readDraft(); saveMail({ draft: M.draft }); refreshCampResult(); return; }
    if (id === "shConAt") { var cs = S.contacts.get(S.sheetId); if (cs) A.save(cs.id, { consentAt: t.value }); return; }
    if (id.indexOf("ms") !== 0) return;
    var cfg = mcfg(), f = {}, num = function (min, max) { return Math.min(max, Math.max(min, Math.round(Number(t.value)) || min)); };
    if (id === "msClient") f.clientId = t.value.trim();
    else if (id === "msName") f.senderName = t.value.trim();
    else if (id === "msBrand") f.brokerage = t.value.trim();
    else if (id === "msAddr") f.address = t.value.trim();
    else if (id === "msPhone") f.phone = t.value.trim();
    else if (id === "msReason") f.reason = t.value.trim() || DEF.reason;
    else if (id === "msCap") { f.cap = num(10, CEIL[cfg.account]); t.value = f.cap; }
    else if (id === "msFreq") { f.freqDays = num(1, 365); t.value = f.freqDays; }
    else if (id === "msWs" || id === "msWe") {
      var ws = id === "msWs" ? Number(t.value) : cfg.winStart, we = id === "msWe" ? Number(t.value) : cfg.winEnd;
      if (we <= ws) { toast("The end time must be after the start time."); t.value = id === "msWs" ? cfg.winStart : cfg.winEnd; return; }
      f.winStart = ws; f.winEnd = we;
    }
    if (Object.keys(f).length) { saveMail(f); setTimeout(refreshChecks, 0); }
  });

  window.CDMailUI = { render: renderEmail, contactPart: contactPart };
})();
