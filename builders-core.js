/* Builders engine for Realtor OS. Pure logic only (no page, no network of its own), so it can be tested on its own.
   Everything here follows three rules:
   1. Nothing is invented. A field the builder did not state stays empty and shows up in "missing".
   2. Nothing is sent without being on a list you reviewed. Bounces and STOP replies block an address for good.
   3. Builder commission and internal notes never reach a client PDF. */
(function (root) {
  "use strict";
  var TZ = "America/Edmonton";
  var QUADS = ["NW", "NE", "SW", "SE"];
  var DEAL_TYPES = [["spec", "Spec / quick possession"], ["incentive", "Incentive"], ["release", "New release"], ["other", "Other"]];
  var DEAL_STATES = [["new", "New"], ["reviewed", "Reviewed"], ["active", "Active"], ["expired", "Expired"], ["sold", "Sold"], ["dismissed", "Dismissed"]];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

  /* ---------- small helpers ---------- */
  function str(x) { return x == null ? "" : String(x); }
  function trim(x) { return str(x).replace(/\s+/g, " ").trim(); }
  function slug(s) { return trim(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function hash(s) { var h = 5381, i; s = str(s); for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  var seq = 0;
  function uid(p) { seq++; return (p || "x") + "_" + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1679616).toString(36); }
  function uniq(a) { var seen = {}, o = []; (a || []).forEach(function (x) { if (x != null && x !== "" && !seen[x]) { seen[x] = 1; o.push(x); } }); return o; }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function edmParts(d) {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d || new Date()), o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, iso: o.year + "-" + o.month + "-" + o.day };
  }
  function todayIso(d) { return edmParts(d).iso; }
  function monthKey(d) { var p = edmParts(d); return p.y + "-" + (p.m < 10 ? "0" : "") + p.m; }
  function monthName(key) { var m = /^(\d{4})-(\d{2})$/.exec(key || ""); return m ? MONTHS[+m[2] - 1] + " " + m[1] : ""; }
  function addDays(iso, n) { var t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000); }
  function money(n) { return n == null || n === "" || isNaN(+n) ? "" : "$" + Math.round(+n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* ---------- email checks ---------- */
  function normEmail(s) { return str(s).trim().replace(/^[<"'\s]+|[>"'\s.,;:)\]]+$/g, "").replace(/^mailto:/i, "").replace(/^[<"'\s]+|[>"'\s.,;:)\]]+$/g, "").toLowerCase(); }
  var RE_EMAIL = /^[a-z0-9](?:[a-z0-9._%+'\-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,24}$/;
  function emailSyntax(s) {
    var e = normEmail(s);
    if (!e) return { ok: false, reason: "empty" };
    if (e.length > 254) return { ok: false, reason: "too long" };
    if (e.indexOf("..") >= 0) return { ok: false, reason: "double dot" };
    if ((e.split("@")[0] || "").length > 64) return { ok: false, reason: "name part too long" };
    if (!RE_EMAIL.test(e)) return { ok: false, reason: "not a valid address" };
    return { ok: true, email: e, reason: "" };
  }
  function domainOf(e) { var i = str(e).lastIndexOf("@"); return i < 0 ? "" : str(e).slice(i + 1).toLowerCase(); }
  function regDomain(h) {
    h = str(h).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#]/)[0].replace(/:\d+$/, "");
    var p = h.split(".").filter(Boolean); if (p.length <= 2) return p.join(".");
    var tail2 = p.slice(-2).join(".");
    return /^(co|com|org|net|gov|edu)\.[a-z]{2}$/.test(tail2) ? p.slice(-3).join(".") : tail2;
  }
  function domainMatch(email, website) {
    var w = regDomain(website); if (!w) return "unknown";
    return regDomain(domainOf(email)) === w ? "same" : "different";
  }
  var NO_SEND = /^(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|abuse|privacy|unsubscribe|webmaster|noreply)$/;
  var PLACEHOLDER = /(^|\.)(example\.(com|org|net)|test\.com|domain\.com|email\.com|yourcompany\.com|sentry\.io)$/;
  function emailFlags(s) {
    var e = normEmail(s), local = e.split("@")[0] || "", dom = domainOf(e), f = [];
    if (NO_SEND.test(local)) f.push("no-reply or system address");
    if (PLACEHOLDER.test(dom)) f.push("placeholder domain");
    return f;
  }
  function guessRole(email) {
    var l = (normEmail(email).split("@")[0] || "");
    if (/^(sales|newhomes|new-homes|homes|inventory|realtor|realtors|brokers?|agents?)/.test(l)) return "sales";
    if (/^(marketing|media|press)/.test(l)) return "marketing";
    if (/^(info|hello|contact|office|general|inquir|enquir|admin|social|calgary)/.test(l)) return "general";
    if (/^(warranty|service|care|support|customer)/.test(l)) return "service";
    if (/^(careers|jobs|hr|recruit)/.test(l)) return "careers";
    return "person";
  }
  /* Roles that make no sense for a "what's available" ask. */
  function roleOk(role) { return role !== "service" && role !== "careers"; }

  /* DNS check through DNS-over-HTTPS. Only "none" (no mail server exists) blocks sending. A failed lookup is "unknown", never a verdict. */
  function mxFromDoh(mxJson, aJson) {
    var hosts = [], ans = (mxJson && mxJson.Answer) || [];
    ans.forEach(function (a) { if (a.type === 15) { var m = /^\s*(\d+)\s+(\S+)/.exec(str(a.data)); if (m) hosts.push({ pri: +m[1], host: m[2].replace(/\.$/, "").toLowerCase() }); } });
    if (hosts.length) {
      if (hosts.length === 1 && (hosts[0].host === "" || hosts[0].host === ".")) return { mx: "none", hosts: [], note: "domain says it does not accept mail" };
      hosts.sort(function (a, b) { return a.pri - b.pri; });
      return { mx: "ok", hosts: hosts.map(function (h) { return h.host; }), note: "" };
    }
    if (mxJson && mxJson.Status === 3) return { mx: "none", hosts: [], note: "domain does not exist" };
    if (mxJson && mxJson.Status === 0) {
      var aa = ((aJson && aJson.Answer) || []).filter(function (a) { return a.type === 1 || a.type === 28; });
      if (aa.length) return { mx: "ok", hosts: [], note: "no MX record, uses the web server address" };
      if (aJson) return { mx: "none", hosts: [], note: "domain has no mail server" };
    }
    return { mx: "unknown", hosts: [], note: "lookup did not finish" };
  }
  function checkMx(domain, fetchFn) {
    var f = fetchFn || (root.fetch && root.fetch.bind(root)), d = str(domain).toLowerCase();
    if (!f || !d) return Promise.resolve({ mx: "unknown", hosts: [], note: "no network" });
    function q(type) {
      return f("https://dns.google/resolve?name=" + encodeURIComponent(d) + "&type=" + type, { headers: { accept: "application/dns-json" } }).then(function (r) { if (!r.ok) throw new Error("dns " + r.status); return r.json(); });
    }
    return q("MX").then(function (mj) {
      if (mj && mj.Status === 0 && !(mj.Answer || []).some(function (a) { return a.type === 15; })) return q("A").then(function (aj) { return mxFromDoh(mj, aj); });
      return mxFromDoh(mj, null);
    }).catch(function () { return { mx: "unknown", hosts: [], note: "lookup did not finish" }; });
  }
  /* One word for the chip beside each address. */
  function health(c) {
    var h = (c && c.h) || {}, s = emailSyntax(c && c.email);
    if (!s.ok) return { level: "bad", key: "format", text: "Not a valid address" };
    if (h.optOut) return { level: "bad", key: "optout", text: "Asked not to be emailed" };
    if (h.bounced) return { level: "bad", key: "bounced", text: "Bounced" };
    if (h.mx === "none") return { level: "bad", key: "nomx", text: "Domain cannot receive mail" };
    var fl = emailFlags(c.email); if (fl.length) return { level: "bad", key: "system", text: fl[0] };
    if (h.repliedAt) return { level: "ok", key: "replied", text: "Replied" };
    if (c.src && (c.src.type === "directory" || c.src.type === "conflict") && !h.confirmed) return { level: "warn", key: "unverified", text: "Source not confirmed" };
    if (h.mx === "ok") return { level: "ok", key: "checked", text: "Format and mail server OK" };
    return { level: "unknown", key: "unchecked", text: "Not checked yet" };
  }

  /* ---------- directory model ---------- */
  function newDoc() {
    return { v: 1, builders: [], contacts: [], areas: [], communities: {}, runs: {}, settings: defaultSettings(), updated: new Date().toISOString() };
  }
  function defaultSettings() {
    return {
      sendDay: 1, sendHour: 9, dailyCap: 25, paceMin: 20, paceMax: 55, winStart: 8, winEnd: 17,
      subject: "{{month}}: spec homes and quick possessions at {{builder}}",
      body: DEFAULT_BODY, nudge: true, showName: false
    };
  }
  var DEFAULT_BODY = "{{greeting}}\n\nI'm a Calgary-area Realtor® working with buyers in {{areas}}.\n\nOnce a month I check in with builders on what is current. Could you reply with whatever applies for {{builder}}?\n\n- Spec or quick possession homes (address or lot, price, possession date)\n- Incentives or promotions running now, and when they end\n- New releases or phases opening soon\n\nA short reply or a price sheet is fine. If someone else is the right person for this, tell me who and I will send it to them instead.\n\n{{brokerage}}\n{{phone}}\n\nYou are receiving this because your address is published as a sales contact for {{builder}}. Reply STOP and I will not email you again.\n{{address}}";

  function communityInfo(doc, name) { return (doc.communities && doc.communities[name]) || null; }
  function areasOf(doc, builderId) { return doc.areas.filter(function (a) { return a.builderId === builderId; }).map(function (a) { return a.community; }); }
  function placeOf(doc, name) { var c = communityInfo(doc, name); return c ? { community: name, city: c.city, quadrant: c.quadrant || "" } : { community: name, city: "", quadrant: "" }; }
  function placeLabel(p) { return p.city === "Calgary" ? (p.quadrant ? p.quadrant + " Calgary" : "Calgary (quadrant?)") : p.city; }
  /* A community that still needs a decision: Calgary with no quadrant. Other cities need none. */
  function needsQuadrant(c) { return !!c && c.city === "Calgary" && QUADS.indexOf(c.quadrant) < 0; }

  function seedFromResearch(rs, now) {
    var doc = newDoc(), at = (now || new Date()).toISOString(), seenEmail = {}, nm = {};
    Object.keys(rs.communities || {}).forEach(function (k) {
      var v = rs.communities[k], city = v[0], quad = v[1] || "", review = /^REVIEW/.test(str(v[2]));
      doc.communities[k] = { city: city, quadrant: city === "Calgary" ? quad : "", src: v[2] || "", review: review || (city === "Calgary" && !quad) };
    });
    (rs.builders || []).forEach(function (b) {
      var id = "b_" + slug(b.name); if (nm[id]) return; nm[id] = 1;
      doc.builders.push({ id: id, name: b.name, website: b.website || "", contactPage: b.contactPage || "", status: "active", notes: "" });
      (b.areas || []).forEach(function (a) { if (doc.communities[a]) doc.areas.push({ builderId: id, community: a }); });
      (b.emails || []).forEach(function (e) {
        var em = normEmail(e.email); if (!emailSyntax(em).ok || seenEmail[em]) return; seenEmail[em] = 1;
        var weak = e.type === "directory" || e.type === "conflict";
        doc.contacts.push({ id: "c_" + hash(em), builderId: id, email: em, name: "", role: e.role || guessRole(em), monthly: roleOk(e.role || guessRole(em)),
          src: { type: e.type || "official", url: e.src || "", note: e.note || "", foundAt: (rs._meta && rs._meta.researchedAt) || at.slice(0, 10) }, h: { confirmed: weak ? null : at } });
      });
    });
    return doc;
  }

  /* ---------- sending: batch, template, preflight ---------- */
  function topAreas(doc, builderId, n) {
    var names = areasOf(doc, builderId), out = [];
    names.slice(0, n || 6).forEach(function (x) { out.push(x); });
    var s = out.join(", ");
    if (out.length > 1) s = out.slice(0, -1).join(", ") + " and " + out[out.length - 1];
    return s + (names.length > out.length ? " and nearby" : "");
  }
  function fill(tpl, vars) {
    var missing = [];
    var out = str(tpl).replace(/\{\{\s*([a-z]+)\s*\}\}/gi, function (m, k) {
      k = k.toLowerCase(); var v = vars[k];
      if (v == null || trim(v) === "") { missing.push(k); return ""; }
      return String(v);
    });
    return { text: out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim(), missing: uniq(missing) };
  }
  function firstName(n) { var t = trim(n).split(" ")[0]; return /^[A-Za-z'’\-]{2,}$/.test(t) ? t : ""; }
  function renderEmail(doc, contact, builder, mail, monthKeyStr) {
    var s = doc.settings || defaultSettings(), fn = firstName(contact.name);
    var vars = { greeting: fn ? "Hi " + fn + "," : "Hello,", builder: builder.name, areas: topAreas(doc, builder.id, 6) || "Calgary and area", month: monthName(monthKeyStr) || "This month",
      brokerage: mail.brokerage, phone: mail.phone, address: mail.address };
    var sub = fill(s.subject, vars), body = fill(s.body, vars);
    var optional = { phone: 1 };
    var miss = uniq(sub.missing.concat(body.missing)).filter(function (k) { return !optional[k]; });
    return { to: contact.email, subject: sub.text, text: body.text, missing: miss };
  }
  function recipientEligibility(c, b, run) {
    var s = emailSyntax(c.email), h = c.h || {}, it = run && run.items && run.items[c.id];
    if (!b || b.status !== "active") return { ok: false, why: "Builder is paused" };
    if (!c.monthly) return { ok: false, why: "Not on the monthly list" };
    if (!roleOk(c.role)) return { ok: false, why: "Service or careers address" };
    if (!s.ok) return { ok: false, why: "Not a valid address" };
    if (h.optOut) return { ok: false, why: "Asked not to be emailed" };
    if (h.bounced) return { ok: false, why: "Bounced before" };
    if (h.mx === "none") return { ok: false, why: "Domain cannot receive mail" };
    if (emailFlags(c.email).length) return { ok: false, why: "No-reply or placeholder address" };
    if (it && (it.st === "sent" || it.st === "uncertain" || it.st === "sending")) return { ok: false, why: it.st === "sent" ? "Already sent this month" : "Check this one first" };
    return { ok: true, why: "" };
  }
  /* Every address that could be emailed this month, with a reason for every one that could not. */
  function buildBatch(doc, mk, mail) {
    var run = doc.runs && doc.runs[mk], seen = {}, ready = [], skipped = [];
    var byId = {}; doc.builders.forEach(function (b) { byId[b.id] = b; });
    doc.contacts.forEach(function (c) {
      var b = byId[c.builderId], e = recipientEligibility(c, b, run);
      var em = normEmail(c.email);
      if (e.ok && seen[em]) e = { ok: false, why: "Same address as another builder" };
      if (!e.ok) { skipped.push({ contact: c, builder: b, why: e.why }); return; }
      seen[em] = 1;
      var weak = c.src && (c.src.type === "directory" || c.src.type === "conflict") && !(c.h && c.h.confirmed);
      var msg = renderEmail(doc, c, b, mail, mk);
      ready.push({ contact: c, builder: b, msg: msg, weak: !!weak, check: weak ? "Source not confirmed" : "" });
    });
    return { ready: ready, skipped: skipped };
  }
  function preflight(mail, doc) {
    var out = [], s = doc.settings || {};
    if (!trim(mail.clientId)) out.push("Add your Google client ID in Settings, then connect Gmail.");
    if (!trim(mail.senderName)) out.push("Add the name that shows in the From line (Settings).");
    if (!trim(mail.brokerage)) out.push("Add your brokerage name. Canada's anti-spam law (CASL) requires it in every email.");
    if (!trim(mail.address)) out.push("Add your mailing address. CASL requires it in every email.");
    if (!/\{\{\s*address\s*\}\}/i.test(s.body || "")) out.push("The email text must include {{address}} (CASL).");
    if (!/stop/i.test(s.body || "")) out.push("The email text must tell people how to opt out (a line with STOP).");
    if (!trim(s.subject)) out.push("Subject line is empty.");
    return out;
  }
  function startRun(doc, mk, picks, now) {
    var run = (doc.runs[mk] = doc.runs[mk] || { month: mk, startedAt: (now || new Date()).toISOString(), items: {} });
    picks.forEach(function (p) { if (!run.items[p.contact.id]) run.items[p.contact.id] = { st: "queued" }; });
    return run;
  }
  function runStats(run) {
    var o = { queued: 0, sending: 0, sent: 0, uncertain: 0, fail: 0, skipped: 0, total: 0 };
    Object.keys((run && run.items) || {}).forEach(function (k) { var s = run.items[k].st; if (o[s] != null) o[s]++; o.total++; });
    return o;
  }
  /* Is this month's ask due? Day of month reached, and nothing sent yet. */
  function askStatus(doc, now, mail) {
    var mk = monthKey(now), p = edmParts(now), s = doc.settings || {}, run = doc.runs[mk], st = runStats(run);
    var b = buildBatch(doc, mk, mail || {}), n = b.ready.length, weak = b.ready.filter(function (x) { return x.weak; }).length, strong = n - weak;
    var day = Math.min(28, Math.max(1, +s.sendDay || 1));
    var reached = p.d >= day, sent = st.sent + st.uncertain, state;
    if (st.queued > 0 || st.sending > 0) state = "inprogress";
    else if (sent > 0) state = strong > 0 ? "inprogress" : "done";
    else if (n === 0) state = "empty";
    else state = reached ? "due" : "upcoming";
    return { month: mk, label: monthName(mk), state: state, sendDay: day, ready: strong, weak: weak, run: st, daysLate: reached ? p.d - day : 0 };
  }
  function nextGap(now, doc) { var s = doc.settings || {}, p = edmParts(now); return { day: s.sendDay || 1, today: p.d }; }
  /* Random pause between emails, in ms, and whether now falls in the sending window. */
  function paceMs(s, rnd) { var a = +s.paceMin || 20, b = Math.max(a, +s.paceMax || 55); return Math.round((a + (rnd == null ? Math.random() : rnd) * (b - a)) * 1000); }
  function inWindow(s, now) { var p = edmParts(now); return p.h >= (+s.winStart || 8) && p.h < (+s.winEnd || 17); }
  function sentInLast24h(doc, now) {
    var t = (now || new Date()).getTime(), n = 0;
    Object.keys(doc.runs || {}).forEach(function (k) { var it = doc.runs[k].items || {}; Object.keys(it).forEach(function (c) { if (it[c].at && t - new Date(it[c].at).getTime() < 86400000 && (it[c].st === "sent" || it[c].st === "uncertain")) n++; }); });
    return n;
  }

  /* ---------- reading replies ---------- */
  function htmlToText(h) {
    return str(h).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n").replace(/<\/t[dh]>/gi, " | ").replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); });
  }
  /* Removes quoted history, signatures and legal footers. Keeps what the person actually wrote. */
  function cleanReply(text, max) {
    var lines = str(text).replace(/\r\n?/g, "\n").split("\n"), out = [], i;
    for (i = 0; i < lines.length; i++) {
      var l = lines[i], t = l.trim();
      if (/^>/.test(t)) continue;
      if (/^On .{5,200}wrote:\s*$/i.test(t) || /^-{2,}\s*(Original Message|Forwarded message)/i.test(t) || /^_{5,}$/.test(t)) break;
      if (/^On .{5,120}$/i.test(t) && /wrote:\s*$/i.test(str(lines[i + 1]).trim())) break;
      if (/^From:\s.+/i.test(t) && /^(Sent|Date):/i.test(str(lines[i + 1]).trim())) break;
      if (/^(--|—)\s*$/.test(t) || /^Sent from my (iPhone|iPad|Android|Galaxy|BlackBerry)/i.test(t) || /^Get Outlook for/i.test(t)) break;
      if (/^(CONFIDENTIAL|This (e-?mail|message) (and any|is intended))/i.test(t)) break;
      out.push(l.replace(/\s+$/, ""));
    }
    var s = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return s.length > (max || 12000) ? s.slice(0, max || 12000) : s;
  }
  var RE_PRICE_ANY = /\$\s?\d{2,3},?\d{3}/;
  function classifyReply(m) {
    var from = str(m.from).toLowerCase(), subj = str(m.subject), body = str(m.text), clean = cleanReply(body), hdr = str(m.autoSubmitted).toLowerCase();
    if (/mailer-daemon|postmaster/.test(from) || /(delivery status notification|undeliverable|undelivered mail|mail delivery (failed|subsystem)|delivery has failed|returned mail|failure notice)/i.test(subj)) return "bounce";
    if (/(^|\b)(550|551|553|554)[ -]5\.\d\.\d/.test(body) && /(user unknown|no such user|does not exist|address rejected|not found|mailbox)/i.test(body) && !clean) return "bounce";
    if (hdr && hdr !== "no") return "auto";
    if (/^(automatic reply|auto[- ]?reply|autoreply|out of office|ooo)\b|\b(out of (the )?office|automatic reply|auto-?reply)\b/i.test(subj) || /\b(i am|i'm|we are|we're) (currently )?(out of (the )?office|away from (my|the) (desk|office)|on (vacation|leave|holiday))\b/i.test(clean) || /\bthis is an automated (reply|response|message)\b/i.test(clean)) return "auto";
    var short = clean.length < 500 && !RE_PRICE_ANY.test(clean);
    if (short && /(^|\W)(stop|unsubscribe|remove me|take me off|do not (email|contact)|don't (email|contact)|no longer (wish|want)|opt[- ]?out)(\W|$)/i.test(clean)) return "stop";
    return "reply";
  }
  function parseBounce(text) {
    var t = str(text), found = [], m, re = /(?:Final-Recipient:\s*rfc822;|Original-Recipient:\s*rfc822;|wasn't delivered to|couldn't be delivered to|was not delivered to|delivery to the following recipient[s]? failed[^\n]*\n+|to <|User\s+<?|address\s+<?)\s*<?([A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi;
    while ((m = re.exec(t))) found.push(normEmail(m[1]));
    if (!found.length) { var all = t.match(/[A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || []; found = all.map(normEmail).filter(function (e) { return !/mailer-daemon|postmaster|googlemail|@google\.com$/.test(e); }).slice(0, 1); }
    found = uniq(found).filter(function (e) { return !/^(mailer-daemon|postmaster)@/.test(e); });
    var permanent = !/(mailbox (is )?full|over quota|temporar|try again later|4\.\d\.\d|deferred)/i.test(t) || /5\.\d\.\d|user unknown|no such user|does not exist|address not found|not found/i.test(t);
    return { failed: found, permanent: permanent };
  }
  function extractRedirect(text, selfEmails) {
    var skip = {}; (selfEmails || []).forEach(function (e) { skip[normEmail(e)] = 1; });
    var all = str(text).match(/[A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
    return uniq(all.map(normEmail)).filter(function (e) { return !skip[e] && emailSyntax(e).ok && !emailFlags(e).length; }).slice(0, 5);
  }

  /* ---------- parsing a reply into deals ---------- */
  var HOME_TYPES = [["duplex", /\b(duplex|paired|semi[- ]detached|attached (?:pair|home)s?)\b/i], ["laned", /\b(laned|lane[- ]?(?:way)?|rear[- ]?(?:detached|garage|lane))\b/i], ["front garage", /\b(front[- ](?:drive|attached|garage)|fdg|front[- ]?drive garage|front[- ]?attached)\b/i], ["townhome", /\b(townhomes?|townhouses?|street towns?|row ?homes?|stacked towns?)\b/i], ["bungalow", /\b(bungalows?|villas?)\b/i], ["estate", /\b(estate|semi-?estate|ultra-?estate|executive)\b/i], ["condo", /\b(condos?|apartments?)\b/i]];
  var RE_ADDR = new RegExp("\\b(\\d{1,5}[A-Za-z]?(?:\\s?[-–]\\s?\\d{1,5})?)\\s+((?:[A-Z][A-Za-z'.\\-]*|\\d{1,3}(?:st|nd|rd|th)?)(?:\\s+(?:[A-Z][A-Za-z'.\\-]*|\\d{1,3}(?:st|nd|rd|th)?|of|de|la|the)){0,3})\\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Gate|Gardens|Grove|Manor|Court|Ct|Crescent|Cres|Close|Common|Circle|Cir|Terrace|Ter|Place|Pl|Rise|View|Link|Parade|Landing|Green|Heights|Hill|Mews|Point|Run|Bay|Villas?|Park|Path|Trail|Ridge|Row)\\b\\.?(?:\\s+(NW|NE|SW|SE))?", "");
  var RE_PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d{5,8})(?:\.\d{1,2})?|\$\s?(\d+(?:\.\d+)?)\s?([kKmM])\b/g;
  function prices(t) {
    var o = [], m; RE_PRICE.lastIndex = 0;
    while ((m = RE_PRICE.exec(t))) {
      var v = m[1] ? +m[1].replace(/,/g, "") : Math.round(+m[2] * (/m/i.test(m[3]) ? 1e6 : 1e3));
      o.push({ v: v, at: m.index, raw: m[0] });
    }
    return o;
  }
  function monthIdx(s) { var k = str(s).slice(0, 3).toLowerCase(), i; for (i = 0; i < 12; i++) if (MONTHS[i].slice(0, 3).toLowerCase() === k) return i + 1; return 0; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* Dates written in an email -> YYYY-MM-DD, or null. ref is the day the email arrived (a year is guessed from it only when none is written). */
  function parseDateText(t, ref) {
    t = str(t); var m, y, r = ref || todayIso();
    if ((m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t))) return m[0];
    if ((m = new RegExp("\\b" + MON_RE + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b", "i").exec(t))) return dateFrom(monthIdx(m[1]), +m[2], m[3] && +m[3], r);
    if ((m = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+" + MON_RE + "\\.?(?:,?\\s+(20\\d{2}))?\\b", "i").exec(t))) return dateFrom(monthIdx(m[2]), +m[1], m[3] && +m[3], r);
    if ((m = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(t))) return dateFrom(+m[1], +m[2], +m[3], r);
    return null;
  }
  function dateFrom(mo, d, y, ref) {
    if (!mo || mo > 12 || d < 1 || d > 31) return null;
    if (!y) { y = +ref.slice(0, 4); var iso = y + "-" + pad(mo) + "-" + pad(d); if (daysBetween(ref, iso) < -45) y++; }
    var out = y + "-" + pad(mo) + "-" + pad(d), chk = new Date(out + "T12:00:00Z");
    return chk.getUTCMonth() + 1 === mo && chk.getUTCDate() === d ? out : null;
  }
  function parsePossession(t, ref) {
    t = str(t); var m;
    if (/\b(quick possession|immediate(?:ly)? (?:possession|available)|move[- ]in ready|ready (?:now|for possession)|available now|completed)\b/i.test(t)) {
      var d0 = parseDateText(t.replace(/(valid|until|through|ends?|expires?)[^.\n]*/gi, ""), ref);
      return { text: /move[- ]in ready/i.test(t) ? "Move-in ready" : /immediate/i.test(t) ? "Immediate" : "Quick possession", date: d0 || "" };
    }
    if ((m = new RegExp("\\bpossession[^.\\n]{0,24}?\\b" + MON_RE + "\\.?(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?,?\\s*(20\\d{2})?", "i").exec(t)) || (m = new RegExp("\\b(?:ready|available|completion|complete|move[- ]in)\\b[^.\\n]{0,16}?\\b" + MON_RE + "\\.?(?:\\s+\\d{1,2})?,?\\s*(20\\d{2})?", "i").exec(t))) {
      var mi = monthIdx(m[1]), yy = m[2] ? +m[2] : (function () { var y0 = +ref.slice(0, 4); return mi < +ref.slice(5, 7) - 1 ? y0 + 1 : y0; })();
      return { text: MONTHS[mi - 1] + " " + yy, date: yy + "-" + pad(mi) };
    }
    if ((m = /\b(spring|summer|fall|autumn|winter)\s+(20\d{2})\b/i.exec(t))) return { text: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + " " + m[2], date: "" };
    return null;
  }
  var RE_INCENT = /(incentive|promo(?:tion)?|rebate|credit|bonus|buy-?down|rate (?:hold|buy|special)|\d(?:\.\d+)?\s?%\s*(?:rate|interest)|free\b|complimentary|\$[\d,]+\s*(?:off|in |towards|credit|bonus|savings)|upgrade|appliance|blinds|window coverings?|landscap|fence|deck|closing cost|gst (?:included|paid|rebate)|price (?:drop|reduc|improvement)|reduced)/i;
  var RE_COMM = /(commission|co-?op\b|referral fee|realtor (?:bonus|fee|incentive)|broker(?:age)? (?:bonus|fee)|bonus to (?:the )?(?:realtor|agent))/i;
  var RE_RELEASE = /(new release|phase\s?\d*|grand opening|launch|coming soon|pre-?sale|now (?:selling|open)|show ?home|opening)/i;
  function homeType(t) { var i; for (i = 0; i < HOME_TYPES.length; i++) if (HOME_TYPES[i][1].test(t)) return HOME_TYPES[i][0]; return ""; }
  function findCommunity(t, names) {
    var best = "", bi = -1, low = str(t).toLowerCase();
    (names || []).forEach(function (n) {
      var re = new RegExp("(^|[^a-z0-9])" + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]?") + "([^a-z0-9]|$)", "i"), m = re.exec(low);
      if (m && (n.length > best.length || bi < 0)) { best = n; bi = m.index; }
    });
    return best;
  }
  function cityFromText(t) { var m = /\b(Airdrie|Chestermere|Cochrane|Okotoks|Calgary|Springbank|Rocky View)\b/i.exec(str(t)); return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : ""; }
  function emptyDeal() {
    return { id: "", builderId: "", type: "spec", community: "", city: "", quadrant: "", address: "", lot: "", homeType: "", beds: null, baths: null, sqft: null, price: null, priceNote: "", possession: "", possessionDate: "", incentives: [], validUntil: "", description: "", commission: "", evidence: "", contactName: "", contactEmail: "", contactPhone: "", state: "new", source: "", firstSeen: "", lastSeen: "", edited: {}, history: [], confidence: "low" };
  }
  function lastDate(blk, ref) {
    var re = /(?:until|through|ends?|expires?|expiring|valid (?:to|until|through)|offer (?:ends|expires)|by|before)\s+([^.\n;]{3,30})/gi, m;
    while ((m = re.exec(blk))) {
      if (/^(by|before)$/i.test(m[0].split(/\s/)[0]) && /possession|move[- ]in|ready/i.test(blk.slice(Math.max(0, m.index - 24), m.index))) continue;
      var d = parseDateText(m[1], ref); if (d) return d;
    }
    return "";
  }
  /* Greetings, thanks, sign-offs and phone-only lines are not "unread" content. */
  function filler(blk) {
    var t = trim(blk), words = t.split(/\s+/).filter(Boolean).length;
    return words < 4 || (words < 9 && /^(hi|hello|hey|dear|thanks|thank you|regards|best|kind regards|sincerely|cheers|sales team)\b/i.test(t)) || /^[\d\s().+\-]{7,}$/.test(t);
  }
  /* Addresses a builder points us to ("please contact Priya at ..."). Only lines that read like a hand-off count, and the result is a suggestion, never saved on its own. */
  function redirectOf(text, selfEmails) {
    var out = [];
    str(text).replace(/\r\n?/g, "\n").split("\n").forEach(function (l) {
      if (!/(contact|reach|e-?mail|write to|send|forward|speak|talk|ask|instead|better|handles?|manages?|in charge|reply to|copy)/i.test(l)) return;
      extractRedirect(l, selfEmails).forEach(function (e) { if (out.indexOf(e) < 0) out.push(e); });
    });
    return out.slice(0, 5);
  }
  function ruleParse(text, ctx) {
    ctx = ctx || {}; var names = ctx.communities || [], ref = ctx.received || todayIso(), lines = str(text).replace(/\r\n?/g, "\n").split("\n"), cands = [], cur = null, head = "", out = { deals: [], summary: "", unread: 0, method: "rules", commission: [] };
    function flush() { if (cur && cur.lines.length) cands.push(cur); cur = null; }
    function start() { cur = { lines: [], head: head }; }
    function addrLine(x) { return RE_ADDR.test(x) || /\blot\s*\d+/i.test(x); }
    lines.forEach(function (raw) {
      var l = raw.replace(/^\s*(?:[-*\u2022\u25cf]|\d{1,2}[.)])\s+/, "").trim();
      if (!l) { flush(); return; }
      var asHead = l.replace(/[:\-\u2013\u2014]\s*$/, "").replace(/^(community|neighbou?rhood)\s*[:\-\u2013]\s*/i, "");
      if (l.length < 60 && names.indexOf(asHead) >= 0 && !prices(l).length) { flush(); head = asHead; return; }
      var curHas = cur && cur.lines.some(addrLine);
      if (!cur || (addrLine(l) && curHas)) { flush(); start(); }
      cur.lines.push(l);
    });
    flush();
    /* A block with no address is a list of separate offers: one line each. */
    var flat = [];
    cands.forEach(function (c) { if (c.lines.length > 1 && !c.lines.some(addrLine)) c.lines.forEach(function (l) { flat.push({ lines: [l], head: c.head }); }); else flat.push(c); });
    var other = [];
    flat.forEach(function (c) {
      var blk = c.lines.join("\n"), pr = prices(blk).filter(function (p) { return p.v >= 100000 && p.v <= 30000000; }), am = RE_ADDR.exec(blk), lot = /\blot\s*(\d+)(?:\s*,?\s*block\s*(\w+))?/i.exec(blk);
      var com = findCommunity(blk, names) || c.head, ht = homeType(blk), beds = /\b(\d)\s*(?:-?\s*)(?:bed(?:room)?s?|bdrms?|br)\b/i.exec(blk), baths = /\b(\d(?:\.\d)?)\s*(?:-?\s*)(?:bath(?:room)?s?|ba)\b/i.exec(blk), sq = /\b(\d{1,2},?\d{3})\s*(?:sq\.?\s?ft\.?|sqft|square feet|sf)\b/i.exec(blk);
      var commOnly = RE_COMM.test(blk) && !am && !lot && !beds && !baths && !sq && !ht, home = !!(am || lot || (pr.length && !commOnly)), poss = home ? parsePossession(blk, ref) : null, spec = /\b(spec|quick possession|move[- ]in ready|inventory|immediate|ready now|available now)\b/i.test(blk) || !!poss;
      var inc = RE_INCENT.test(blk), comm = RE_COMM.test(blk), signals = (am || lot ? 1 : 0) + (pr.length ? 1 : 0) + (com ? 1 : 0) + (ht ? 1 : 0) + (poss ? 1 : 0) + (beds ? 1 : 0) + (sq ? 1 : 0);
      if (comm && !home) { out.commission.push(trim(blk).slice(0, 300)); return; }
      if (!(home && signals >= 2) && !(inc && /\$|%|free|credit|rebate|bonus/i.test(blk)) && !(RE_RELEASE.test(blk) && com)) { if (!filler(blk)) other.push(blk); return; }
      var d = emptyDeal(); d.evidence = blk.slice(0, 600);
      if (am) { d.address = trim(am[1] + " " + am[2] + " " + am[3] + (am[4] ? " " + am[4] : "")); if (am[4]) d.quadrant = am[4]; }
      if (lot) d.lot = "Lot " + lot[1] + (lot[2] ? " Block " + lot[2] : "");
      if (pr.length) d.price = pr[0].v;
      if (comm) d.commission = trim(c.lines.filter(function (x) { return RE_COMM.test(x); }).join(" ")).slice(0, 300);
      d.community = com; d.homeType = ht; d.beds = beds ? +beds[1] : null; d.baths = baths ? +baths[1] : null; d.sqft = sq ? +sq[1].replace(/,/g, "") : null;
      if (poss) { d.possession = poss.text; d.possessionDate = poss.date; }
      d.incentives = c.lines.filter(function (x) { return RE_INCENT.test(x) && !RE_COMM.test(x); }).map(function (x) { return trim(x).slice(0, 220); });
      d.validUntil = lastDate(blk, ref);
      var ph = /\(?\b(\d{3})\)?[-. ]\s?(\d{3})[-. ](\d{4})\b/.exec(blk); if (ph) d.contactPhone = ph[1] + "-" + ph[2] + "-" + ph[3];
      var em = (blk.match(/[A-Za-z0-9._%+'\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/) || [])[0]; if (em) d.contactEmail = normEmail(em);
      d.type = home && (am || lot || spec || ht) ? "spec" : (RE_RELEASE.test(blk) && !pr.length ? "release" : (inc ? "incentive" : "other"));
      d.confidence = (am || lot) && pr.length ? "high" : (signals >= 3 ? "medium" : "low");
      d.description = describe(d);
      out.deals.push(d);
    });
    out.unread = other.length;
    out.redirect = redirectOf(cleanReply(text), ctx.self);
    var clean = trim(cleanReply(text)); var sents = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    out.summary = out.deals.length ? out.deals.length + " item" + (out.deals.length === 1 ? "" : "s") + " found: " + countBy(out.deals) + ". " + (sents.slice(0, 2).join(" ").slice(0, 300)) : (sents.slice(0, 3).join(" ").slice(0, 400) || "No readable message.");
    return out;
  }
  function countBy(deals) { var c = {}; deals.forEach(function (d) { c[d.type] = (c[d.type] || 0) + 1; }); return Object.keys(c).map(function (k) { return c[k] + " " + ({ spec: "spec/quick possession", incentive: "incentive", release: "new release", other: "other" }[k] || k); }).join(", "); }
  function describe(d) {
    var p = [];
    var head = [d.homeType ? cap(d.homeType) : "", d.community ? "in " + d.community : ""].filter(Boolean).join(" ");
    if (d.address || d.lot) head += (head ? ", " : "") + (d.address || d.lot);
    if (head) p.push(head);
    var f = []; if (d.beds != null) f.push(d.beds + " bed"); if (d.baths != null) f.push(d.baths + " bath"); if (d.sqft) f.push(d.sqft.toLocaleString("en-CA") + " sq ft");
    if (f.length) p.push(f.join(", "));
    if (d.price) p.push(money(d.price));
    if (d.possession) p.push("possession " + d.possession);
    if (d.incentives && d.incentives.length) p.push("incentives: " + d.incentives.join("; "));
    return p.join(". ");
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  /* AI output is checked against the email text itself. A value that cannot be found in the email is dropped, never kept. */
  function alnum(s) { return str(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function verifyAi(ai, raw, ctx) {
    ctx = ctx || {}; var rawS = str(raw), hay = alnum(rawS), dropped = [], list = ai && Array.isArray(ai.deals) ? ai.deals : [];
    var nums = {}; (rawS.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) { nums[String(+n.replace(/,/g, ""))] = 1; }); prices(rawS).forEach(function (p) { nums[String(p.v)] = 1; });
    var out = { deals: [], summary: trim(ai && ai.summary).slice(0, 1200), method: "ai", unread: 0, optOut: !!(ai && ai.optOut), redirect: [], questions: (ai && Array.isArray(ai.questions) ? ai.questions : []).map(trim).filter(Boolean).slice(0, 6) };
    list.slice(0, 80).forEach(function (x, i) {
      var d = emptyDeal(); x = x && typeof x === "object" ? x : {};
      function tx(k, v, max) { v = trim(v).slice(0, max || 200); if (!v) return ""; if (hay.indexOf(alnum(v)) < 0) { dropped.push("deal " + (i + 1) + ": " + k + " '" + v + "' is not in the email"); return ""; } return v; }
      function nm(k, v, kw) {
        if (v == null || v === "") return null; var n = +String(v).replace(/[$,\s]/g, ""); if (isNaN(n)) return null;
        var ok = kw ? new RegExp("(^|[^\\d.])" + String(n).replace(".", "\\.") + "(?:\\.0)?\\s*-?\\s*(?:" + kw + ")", "i").test(rawS) : !!nums[String(n)];
        if (!ok) { dropped.push("deal " + (i + 1) + ": " + k + " " + v + " is not in the email"); return null; } return n;
      }
      d.type = ["spec", "incentive", "release", "other"].indexOf(x.type) >= 0 ? x.type : "other";
      d.address = tx("address", x.address); d.lot = tx("lot", x.lot, 40); d.community = findCommunity(str(x.community), ctx.communities || []) || tx("community", x.community, 80);
      d.homeType = homeType(str(x.homeType)) || tx("home type", x.homeType, 40);
      d.price = nm("price", x.price); if (d.price != null && (d.price < 100000 || d.price > 30000000)) { dropped.push("deal " + (i + 1) + ": price out of range"); d.price = null; }
      d.beds = nm("beds", x.beds, "bed(?:room)?s?|bdrms?|br\\b"); d.baths = nm("baths", x.baths, "bath(?:room)?s?|ba\\b"); d.sqft = nm("sq ft", x.sqft);
      d.priceNote = tx("price note", x.priceNote, 120); d.possession = tx("possession", x.possession, 60);
      d.possessionDate = /^\d{4}-\d{2}(-\d{2})?$/.test(str(x.possessionDate)) && d.possession ? x.possessionDate : "";
      d.validUntil = /^\d{4}-\d{2}-\d{2}$/.test(str(x.validUntil)) ? x.validUntil : "";
      d.incentives = (Array.isArray(x.incentives) ? x.incentives : []).map(function (s) { return tx("incentive", s, 220); }).filter(Boolean).slice(0, 8);
      d.evidence = tx("evidence", x.evidence, 600); d.commission = tx("commission note", x.commission, 300);
      d.contactName = tx("contact", x.contactName, 80); d.contactPhone = tx("phone", x.contactPhone, 30); d.contactEmail = normEmail(tx("email", x.contactEmail, 120));
      var q = /\b(NW|NE|SW|SE)\b/.exec(d.address); d.quadrant = q ? q[1] : "";
      d.description = describe(d);
      d.confidence = (d.address || d.lot) && d.price ? "high" : "medium";
      if (!(d.address || d.lot || d.price || d.incentives.length || (d.community && d.evidence))) { dropped.push("deal " + (i + 1) + ": nothing in it could be checked against the email, so it was left out"); return; }
      out.deals.push(d);
    });
    out.redirect = extractRedirect((ai && Array.isArray(ai.redirect) ? ai.redirect : []).map(function (r) { return r && r.email; }).join(" "), ctx.self || []).filter(function (e) { return hay.indexOf(alnum(e)) >= 0; });
    out.dropped = dropped;
    return out;
  }
  /* Fill community city/quadrant from the directory, never from the email. */
  function place(deal, doc) {
    var c = deal.community && communityInfo(doc, deal.community);
    if (c) { deal.city = c.city; if (c.city === "Calgary") deal.quadrant = deal.quadrant || c.quadrant || ""; else deal.quadrant = ""; }
    else { deal.city = deal.city || cityFromText(deal.evidence + " " + deal.address); if (deal.city && deal.city !== "Calgary") deal.quadrant = ""; }
    return deal;
  }

  /* ---------- deals: merge, gaps, filters ---------- */
  function addrKey(a) { return alnum(a).replace(/(street|avenue|road|drive|boulevard|crescent|terrace|circle|court|close|place|common|landing)/g, function (m) { return { street: "st", avenue: "ave", road: "rd", drive: "dr", boulevard: "blvd", crescent: "cres", terrace: "ter", circle: "cir", court: "ct", close: "cl", place: "pl", common: "com", landing: "ldg" }[m]; }); }
  function dealKey(d) {
    if (d.address) return d.builderId + "|a|" + addrKey(d.address);
    if (d.lot && d.community) return d.builderId + "|l|" + alnum(d.community + d.lot);
    return d.builderId + "|x|" + alnum([d.type, d.community, d.homeType, d.price || "", (d.incentives || []).join("").slice(0, 60)].join(""));
  }
  var TRACK = ["price", "possession", "possessionDate", "validUntil", "homeType", "beds", "baths", "sqft", "community", "incentives", "priceNote", "contactName", "contactPhone", "contactEmail"];
  function mergeDeals(existing, incoming, meta) {
    var list = existing.slice(), idx = {}, added = 0, updated = 0, at = meta.at || new Date().toISOString();
    list.forEach(function (d) { idx[dealKey(d)] = d; });
    incoming.forEach(function (n) {
      n.builderId = meta.builderId; n.source = meta.replyId || n.source; var k = dealKey(n), ex = idx[k];
      if (!ex) { n.id = n.id || uid("d"); n.firstSeen = at; n.lastSeen = at; n.state = n.state || "new"; n.history = [{ at: at, note: "First seen" }]; list.push(n); idx[k] = n; added++; return; }
      var ch = [];
      TRACK.forEach(function (f) {
        var a = JSON.stringify(ex[f]), b = JSON.stringify(n[f]);
        if (b === JSON.stringify(emptyDeal()[f])) return;
        if (a !== b && !(ex.edited && ex.edited[f])) { ch.push({ field: f, from: ex[f], to: n[f] }); ex[f] = n[f]; }
      });
      if (n.commission) ex.commission = n.commission;
      ex.evidence = n.evidence || ex.evidence; ex.description = describe(ex) || ex.description; ex.lastSeen = at; ex.source = n.source || ex.source;
      if (ex.state === "expired" || ex.state === "sold") { ch.push({ field: "state", from: ex.state, to: "active" }); ex.state = "active"; }
      if (ch.length) { ex.history = (ex.history || []).concat([{ at: at, note: "Updated", changes: ch }]).slice(-30); updated++; }
    });
    return { deals: list, added: added, updated: updated };
  }
  function gaps(d) {
    var g = [];
    if (d.type === "spec") { if (!d.address && !d.lot) g.push("address"); if (!d.price) g.push("price"); if (!d.possession) g.push("possession"); if (!d.beds) g.push("bedrooms"); if (!d.sqft) g.push("size"); if (!d.homeType) g.push("home type"); }
    else if (d.type === "incentive") { if (!d.validUntil) g.push("end date"); if (!d.incentives || !d.incentives.length) g.push("what's included"); }
    if (!d.community) g.push("community");
    return g;
  }
  function dealAge(d, today) { return d.lastSeen ? daysBetween(d.lastSeen.slice(0, 10), today) : 0; }
  function dealStatus(d, today) {
    if (d.state === "sold" || d.state === "dismissed" || d.state === "expired") return d.state;
    if (d.validUntil && d.validUntil < today) return "expired";
    return d.state;
  }
  function stale(d, today) { return dealAge(d, today) > 45 && (d.state === "new" || d.state === "reviewed" || d.state === "active"); }
  function filterDeals(deals, f, doc, today) {
    f = f || {}; var q = trim(f.q).toLowerCase(), t = today || todayIso(), bmap = {}; (doc.builders || []).forEach(function (b) { bmap[b.id] = b.name; });
    return deals.filter(function (d) {
      var st = dealStatus(d, t);
      if (f.state && f.state !== "all") { if (f.state === "open") { if (["new", "reviewed", "active"].indexOf(st) < 0) return false; } else if (st !== f.state) return false; }
      if (f.type && d.type !== f.type) return false;
      if (f.city && d.city !== f.city) return false;
      if (f.quadrant && d.quadrant !== f.quadrant) return false;
      if (f.community && d.community !== f.community) return false;
      if (f.builder && d.builderId !== f.builder) return false;
      if (f.homeType && d.homeType !== f.homeType) return false;
      if (f.minPrice && !(d.price >= +f.minPrice)) return false;
      if (f.maxPrice && !(d.price != null && d.price <= +f.maxPrice)) return false;
      if (f.beds && !(d.beds >= +f.beds)) return false;
      if (f.possession === "now" && !/quick|immediate|move-in/i.test(d.possession)) return false;
      if (f.possession === "dated" && !d.possessionDate) return false;
      if (f.endingDays != null && f.endingDays !== "" && !(d.validUntil && d.validUntil >= t && daysBetween(t, d.validUntil) <= +f.endingDays)) return false;
      if (f.missing && !gaps(d).length) return false;
      if (q) { var hay = [bmap[d.builderId], d.community, d.city, d.quadrant, d.address, d.lot, d.homeType, d.description, (d.incentives || []).join(" ")].join(" ").toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
  }
  function sortDeals(list, key) {
    var k = key || "new", c = {
      new: function (a, b) { return (b.firstSeen || "").localeCompare(a.firstSeen || ""); },
      price: function (a, b) { return (a.price == null) - (b.price == null) || a.price - b.price; },
      priceDesc: function (a, b) { return (a.price == null) - (b.price == null) || b.price - a.price; },
      ending: function (a, b) { return (a.validUntil ? 0 : 1) - (b.validUntil ? 0 : 1) || str(a.validUntil).localeCompare(str(b.validUntil)); },
      community: function (a, b) { return str(a.community).localeCompare(str(b.community)); }
    }[k] || null;
    return c ? list.slice().sort(c) : list;
  }
  function builderFacets(doc, deals, today) {
    var out = { city: {}, quadrant: {}, community: {}, builder: {}, homeType: {} }, t = today || todayIso();
    deals.forEach(function (d) { if (["new", "reviewed", "active"].indexOf(dealStatus(d, t)) < 0) return; ["city", "quadrant", "community", "builder", "homeType"].forEach(function (k) { var v = k === "builder" ? d.builderId : d[k]; if (v) out[k][v] = (out[k][v] || 0) + 1; }); });
    return out;
  }

  /* ---------- client PDF: only fields that are safe to show a buyer ---------- */
  function dealPdfModel(d, builder, mail, now, opts) {
    opts = opts || {}; var asOf = todayIso(now), rows = [];
    function row(k, v) { if (v != null && trim(v) !== "") rows.push([k, trim(v)]); }
    row("Builder", builder && builder.name);
    row("Community", [d.community, d.city === "Calgary" ? (d.quadrant ? d.quadrant + " Calgary" : "Calgary") : d.city].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(", "));
    row("Address", d.address || d.lot);
    row("Home type", d.homeType ? cap(d.homeType) : "");
    row("Bedrooms", d.beds); row("Bathrooms", d.baths); row("Size", d.sqft ? d.sqft.toLocaleString("en-CA") + " sq ft" : "");
    row("Possession", d.possession);
    row("Offer ends", d.validUntil ? fmtDate(d.validUntil) : "");
    return {
      title: d.type === "incentive" ? "Builder incentive" : d.type === "release" ? "New release" : (/quick|immediate|move[- ]in|ready now|available now/i.test(d.possession || "") ? "Quick possession home" : "New home from the builder"),
      headline: d.address || d.lot || d.community || (builder && builder.name) || "",
      price: d.price ? money(d.price) : "", priceNote: d.priceNote || "",
      rows: rows, incentives: (d.incentives || []).slice(0, 8),
      asOf: asOf, asOfLabel: fmtDate(asOf),
      prepared: [mail.brokerage, mail.phone, mail.email].filter(Boolean),
      agent: opts.showName && mail.senderName ? mail.senderName : "",
      disclaimer: "Details were provided by the builder as of " + fmtDate(asOf) + ". Prices, incentives and availability can change without notice and should be confirmed in writing with the builder before you decide. E.&O.E.",
      missing: gaps(d)
    };
  }
  function fmtDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(iso)); return m ? MONTHS[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : str(iso); }
  function clientBlurb(d, builder, mail, now) {
    var bits = [d.homeType ? "a " + d.homeType + " home" : "a new home", d.community ? "in " + d.community : ""].filter(Boolean).join(" "), p = [];
    p.push("Here is " + bits + (d.price ? " at " + money(d.price) : "") + (d.possession ? ", possession: " + d.possession : "") + ".");
    p.push("The one-page summary is attached. Details come from the builder as of " + fmtDate(todayIso(now)) + " and can change, so I will confirm them in writing before you decide.");
    return p.join(" ");
  }

  /* ---------- CSV ---------- */
  function csvCell(v) { var s = str(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(cols, rows) { return [cols.map(csvCell).join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(","); })).join("\r\n"); }
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false, i, c, t = str(text).replace(/^\uFEFF/, "");
    for (i = 0; i < t.length; i++) {
      c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (x) { return trim(x); })) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell); if (row.some(function (x) { return trim(x); })) rows.push(row);
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return trim(h).toLowerCase().replace(/[^a-z]/g, ""); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, k) { o[h] = trim(r[k]); }); return o; });
  }
  /* Rows with builder + email (+ optional name, role, website, source). Returns what changed so the page can show it before saving. */
  function importContacts(doc, rows) {
    var res = { added: 0, updated: 0, skipped: [] }, byName = {}, byEmail = {};
    doc.builders.forEach(function (b) { byName[b.name.toLowerCase()] = b; });
    doc.contacts.forEach(function (c) { byEmail[normEmail(c.email)] = c; });
    rows.forEach(function (r, i) {
      var bn = trim(r.builder || r.company || r.name2), em = emailSyntax(r.email || r.emailaddress);
      if (!bn) { res.skipped.push("Row " + (i + 2) + ": no builder name"); return; }
      if (!em.ok) { res.skipped.push("Row " + (i + 2) + ": " + (trim(r.email) || "no email") + " is " + em.reason); return; }
      var b = byName[bn.toLowerCase()];
      if (!b) { b = { id: "b_" + slug(bn), name: bn, website: trim(r.website), contactPage: "", status: "active", notes: "" }; doc.builders.push(b); byName[bn.toLowerCase()] = b; }
      var ex = byEmail[em.email];
      if (ex) { if (r.contactname && !ex.name) ex.name = trim(r.contactname); if (r.role) ex.role = trim(r.role).toLowerCase(); res.updated++; return; }
      var role = trim(r.role).toLowerCase() || guessRole(em.email), c = { id: "c_" + hash(em.email), builderId: b.id, email: em.email, name: trim(r.contactname || r.person), role: role, monthly: roleOk(role), src: { type: "manual", url: trim(r.source), note: "Added by you", foundAt: todayIso() }, h: { confirmed: new Date().toISOString() } };
      doc.contacts.push(c); byEmail[em.email] = c; res.added++;
    });
    return res;
  }
  function exportRows(doc) {
    var byId = {}; doc.builders.forEach(function (b) { byId[b.id] = b; });
    var rows = [], withEmail = {};
    doc.contacts.forEach(function (c) {
      var b = byId[c.builderId] || {}, ar = areasOf(doc, c.builderId).map(function (n) { return placeOf(doc, n); }), h = health(c);
      withEmail[c.builderId] = 1;
      rows.push({ builder: b.name, email: c.email, contactName: c.name, role: c.role, monthly: c.monthly ? "yes" : "no", health: h.text, sourceType: (c.src && c.src.type) || "", sourcePage: (c.src && c.src.url) || "", cities: uniq(ar.map(function (p) { return p.city; })).join("; "), quadrants: uniq(ar.map(function (p) { return p.quadrant; })).join("; "), communities: ar.map(function (p) { return p.community; }).join("; "), website: b.website });
    });
    doc.builders.forEach(function (b) {
      if (withEmail[b.id]) return; var ar = areasOf(doc, b.id).map(function (n) { return placeOf(doc, n); });
      rows.push({ builder: b.name, email: "", contactName: "", role: "", monthly: "no", health: "No public email found", sourceType: "", sourcePage: b.contactPage || "", cities: uniq(ar.map(function (p) { return p.city; })).join("; "), quadrants: uniq(ar.map(function (p) { return p.quadrant; })).join("; "), communities: ar.map(function (p) { return p.community; }).join("; "), website: b.website });
    });
    return rows;
  }
  var EXPORT_COLS = ["builder", "email", "contactName", "role", "monthly", "health", "sourceType", "sourcePage", "cities", "quadrants", "communities", "website"];
  var DEAL_COLS = ["builder", "type", "state", "community", "city", "quadrant", "address", "lot", "homeType", "beds", "baths", "sqft", "price", "possession", "possessionDate", "validUntil", "incentives", "description", "firstSeen", "lastSeen"];
  function dealRows(doc, deals) {
    var bmap = {}; doc.builders.forEach(function (b) { bmap[b.id] = b.name; });
    return deals.map(function (d) { var o = {}; DEAL_COLS.forEach(function (k) { o[k] = k === "builder" ? bmap[d.builderId] : k === "incentives" ? (d.incentives || []).join(" | ") : d[k]; }); return o; });
  }

  var API = {
    QUADS: QUADS, DEAL_TYPES: DEAL_TYPES, DEAL_STATES: DEAL_STATES, EXPORT_COLS: EXPORT_COLS, DEAL_COLS: DEAL_COLS, DEFAULT_BODY: DEFAULT_BODY,
    slug: slug, hash: hash, uid: uid, uniq: uniq, clone: clone, trim: trim, money: money, monthKey: monthKey, monthName: monthName, todayIso: todayIso, edmParts: edmParts, addDays: addDays, daysBetween: daysBetween, fmtDate: fmtDate,
    normEmail: normEmail, emailSyntax: emailSyntax, emailFlags: emailFlags, domainOf: domainOf, domainMatch: domainMatch, guessRole: guessRole, roleOk: roleOk, mxFromDoh: mxFromDoh, checkMx: checkMx, health: health,
    newDoc: newDoc, defaultSettings: defaultSettings, seedFromResearch: seedFromResearch, areasOf: areasOf, placeOf: placeOf, placeLabel: placeLabel, needsQuadrant: needsQuadrant, communityInfo: communityInfo,
    fill: fill, renderEmail: renderEmail, recipientEligibility: recipientEligibility, buildBatch: buildBatch, preflight: preflight, startRun: startRun, runStats: runStats, askStatus: askStatus, paceMs: paceMs, inWindow: inWindow, sentInLast24h: sentInLast24h,
    htmlToText: htmlToText, cleanReply: cleanReply, classifyReply: classifyReply, parseBounce: parseBounce, extractRedirect: extractRedirect, ruleParse: ruleParse, verifyAi: verifyAi, place: place, describe: describe, emptyDeal: emptyDeal,
    parseDateText: parseDateText, parsePossession: parsePossession, dealKey: dealKey, mergeDeals: mergeDeals, gaps: gaps, dealStatus: dealStatus, stale: stale, dealAge: dealAge, filterDeals: filterDeals, sortDeals: sortDeals, builderFacets: builderFacets,
    dealPdfModel: dealPdfModel, clientBlurb: clientBlurb, toCsv: toCsv, parseCsv: parseCsv, importContacts: importContacts, exportRows: exportRows, dealRows: dealRows
  };
  root.BLD = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
