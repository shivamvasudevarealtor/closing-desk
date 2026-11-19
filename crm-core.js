/* Contact rules shared by Home. These are the same rules the Clients page uses (app.js): who is due, in what order,
   what a "Talked / Messaged / No answer" tap saves, and which pipeline column a person sits in.
   Pure functions: no page access, nothing is saved here. */
window.CRM = (function () {
  "use strict";
  var TEMPS = ["hot", "warm", "cold", "stale"];
  var RHYTHM = { hot: 2, warm: 7, cold: 30, stale: 90 };
  var OFFBOARD = ["Past client", "Dead"];
  var STAGES = {
    buyer: ["Cold", "Engaged", "Searching", "Under contract", "Closed"],
    seller: ["Cold", "Consult set", "Listed", "Under contract", "Closed"]
  };
  var LEGACY = { buyer: { "Contacted": "Engaged", "Meeting set": "Engaged", "Active": "Searching" }, seller: { "Contacted": "Cold", "Meeting set": "Consult set", "Active": "Listed" } };

  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var p = s.split("-").map(Number); return iso(new Date(p[0], p[1] - 1, p[2] + n)); }
  function diff(a, b) { var x = a.split("-").map(Number), y = b.split("-").map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000); }

  function fphone(p) { var m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? "(" + m[1] + ") " + m[2] + "-" + m[3] : (p || ""); }
  function nm(c) { return ((c.first || "") + " " + (c.last || "")).trim() || c.email || fphone(c.phone) || "No name"; }
  function initials(c) { var a = ((c.first || "").trim().charAt(0) + (c.last || "").trim().charAt(0)).toUpperCase(); return a || String(c.email || "?").charAt(0).toUpperCase(); }
  function tone(c) { var k = String(c.id || nm(c)), h = 0, i; for (i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h % 4; }

  function pipeOf(c) { return c.kind === "seller" ? "seller" : (c.kind === "buyer" || c.kind === "investor") ? "buyer" : ""; }
  /* The pipeline column a person sits in, or "" when they are not on a board. */
  function colOf(c) {
    var p = pipeOf(c); if (!p) return "";
    var st = c.stage || "New";
    if (st === "Nurture" || OFFBOARD.indexOf(st) >= 0) return "";
    if (st === "New") return "Cold";
    if (STAGES[p].indexOf(st) >= 0) return st;
    return LEGACY[p][st] || "Cold";
  }
  function stageLabel(c) { return (c.stage === "New" || !c.stage) ? "New" : (colOf(c) || c.stage); }

  function rhythm(c) { if (c.stage === "Past client") return 90; if (c.stage === "Closed") return 14; return RHYTHM[c.temp] || 30; }
  function rank(c) { return (c.stage === "New" ? 0 : 1) * 10 + Math.max(TEMPS.indexOf(c.temp), 0); }
  function byPriority(a, b) { return rank(a) - rank(b) || (a.next || "").localeCompare(b.next || ""); }

  /* Everyone whose follow-up date is today or earlier, most important first. Same list and order as Clients > Due today. */
  function dueList(contacts, td) {
    return (contacts || []).filter(function (c) { return c.stage !== "Dead" && c.next && c.next <= td; }).sort(byPriority);
  }
  function dueText(c, td) {
    if (!c.next) return "No date";
    var d = diff(c.next, td);
    return d > 0 ? d + (d === 1 ? " day overdue" : " days overdue") : "Due today";
  }
  /* What a tap on Talked / Messaged / No answer saves. Mirrors touch() in app.js. */
  function touchFields(c, kind, td) {
    var label = { talked: "Talked", messaged: "Sent a message", noanswer: "No answer" }[kind];
    if (!label) return null;
    var days = kind === "noanswer" ? 3 : rhythm(c), nx = addDays(td, days);
    var f = { lastTouch: td, next: nx, log: [{ d: td, t: label }].concat(c.log || []).slice(0, 60) };
    if (c.stage === "New" && kind !== "noanswer") f.stage = pipeOf(c) ? "Cold" : "Nurture";
    return f;
  }
  /* The same fields as they were, so a tap can be undone. */
  function undoFields(c, f) { var p = {}; Object.keys(f).forEach(function (k) { p[k] = c[k] === undefined ? null : c[k]; }); return p; }
  function laterFields(td) { return { next: addDays(td, 7) }; }

  /* How many people sit in each pipeline column (buyers and sellers together). */
  function deals(contacts) {
    var out = { under: 0, listed: 0, consult: 0, searching: 0 };
    (contacts || []).forEach(function (c) {
      if (c.stage === "Dead") return;
      var col = colOf(c);
      if (col === "Under contract") out.under++;
      else if (col === "Listed") out.listed++;
      else if (col === "Consult set") out.consult++;
      else if (col === "Searching") out.searching++;
    });
    return out;
  }
  function telUrl(c) { return c.phone ? "tel:" + c.phone : ""; }
  function smsUrl(c) { return c.phone ? "sms:" + c.phone : ""; }
  function waUrl(c) { var d = String(c.phone || "").replace(/\D/g, ""); return d ? "https://wa.me/" + d : ""; }

  return {
    iso: iso, today: today, addDays: addDays, diff: diff, nm: nm, fphone: fphone, initials: initials, tone: tone,
    pipeOf: pipeOf, colOf: colOf, stageLabel: stageLabel, byPriority: byPriority, rhythm: rhythm,
    dueList: dueList, dueText: dueText, touchFields: touchFields, undoFields: undoFields, laterFields: laterFields,
    deals: deals, telUrl: telUrl, smsUrl: smsUrl, waUrl: waUrl
  };
})();
