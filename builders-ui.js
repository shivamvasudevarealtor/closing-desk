/* Builders: small building blocks shared by the screens (elements, chips, sheets, toast). No data logic. */
(function (root) {
  "use strict";
  var U = { views: {} };
  U.h = function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v === false || v == null) return;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k === "html") el.innerHTML = v;
      else if (k === "value") el.value = v; else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  };
  var h = U.h;
  U.IC = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
    sun: '<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    logo: '<svg viewBox="0 0 24 24"><path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20"/><path d="M15 20v-8h3.5a1.5 1.5 0 0 1 1.5 1.5V20"/><path d="M3.5 20h17"/><path d="M8.5 8h3M8.5 12h3M8.5 16h3"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5 12 13l8.5-5.5"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 14h6M10 17.5h4"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 9l5-5 5 5M5 20h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  U.ico = function (n) { var s = h("span", { "aria-hidden": "true" }); s.innerHTML = U.IC[n]; s.style.display = "inline-flex"; return s; };
  U.btn = function (label, cls, on, icon, attrs) {
    var b = h("button", Object.assign({ type: "button", class: "bl-btn " + (cls || "") }, attrs || {}), [icon ? U.ico(icon) : null, label]);
    if (on) b.addEventListener("click", on); return b;
  };
  U.chip = function (text, cls) { return h("span", { class: "bl-chip " + (cls || ""), text: text }); };
  U.n = function (x) { return Number(x || 0).toLocaleString("en-CA"); };
  U.plural = function (n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); };
  U.healthCls = function (hh) { return hh.level === "ok" ? "ok" : hh.level === "warn" ? "warn" : hh.level === "bad" ? "bad" : ""; };
  U.ago = function (iso) {
    if (!iso) return ""; var d = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (d < 0.04) return "just now"; if (d < 1) return Math.round(d * 24) + " h ago"; if (d < 2) return "yesterday"; if (d < 45) return Math.round(d) + " days ago";
    return root.BLD.fmtDate(iso.slice(0, 10));
  };
  U.csvDownload = function (name, text) {
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }), u = URL.createObjectURL(blob), a = h("a", { href: u, download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 3000);
  };

  /* ---------- toast ---------- */
  var toastEl = null, toastT = 0;
  U.toast = function (msg, label, fn, ms) {
    if (!toastEl) { toastEl = h("div", { class: "bl-toast", role: "status", hidden: true }); document.body.appendChild(toastEl); }
    toastEl.textContent = ""; toastEl.appendChild(h("span", { text: msg }));
    if (label && fn) toastEl.appendChild(h("button", { type: "button", text: label, onclick: function () { toastEl.hidden = true; fn(); } }));
    toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, ms || (fn ? 7000 : 3800));
  };

  /* ---------- sheet (dialog) ---------- */
  var scrim = null, opener = null, cur = null;
  U.sheet = {
    open: function (opts) {
      U.sheet.close(true); opener = document.activeElement;
      var body = h("div", { class: "bl-sbody", style: "display:flex;flex-direction:column;gap:14px" }), head = h("header", {}, [h("h2", { id: "blSheetT", text: opts.title || "" }), U.btn("", "sm", function () { U.sheet.close(); }, "x", { "aria-label": "Close" })]);
      var sheet = h("div", { class: "bl-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "blSheetT" }, [head, body]);
      scrim = h("div", { class: "bl-scrim" }, [sheet]);
      scrim.addEventListener("mousedown", function (e) { if (e.target === scrim && !opts.sticky) U.sheet.close(); });
      document.body.appendChild(scrim); document.body.style.overflow = "hidden";
      cur = { opts: opts, body: body, sheet: sheet, title: head.firstChild };
      opts.render(body, cur);
      var f = sheet.querySelector("input:not([type=checkbox]),select,textarea") || sheet.querySelector("button:not([aria-label=Close])") || sheet.querySelector("button");
      if (f) f.focus();
      return cur;
    },
    redraw: function () { if (!cur) return; var y = cur.sheet.scrollTop; cur.body.textContent = ""; cur.opts.render(cur.body, cur); cur.sheet.scrollTop = y; },
    close: function (quiet) {
      if (!scrim) return; var c = cur; scrim.remove(); scrim = null; cur = null; document.body.style.overflow = "";
      if (c && c.opts.onClose) c.opts.onClose(); if (!quiet && opener && opener.focus && document.contains(opener)) { try { opener.focus(); } catch (e) {} }
    },
    isOpen: function (t) { return !!cur && (!t || cur.opts.type === t); },
    current: function () { return cur; }
  };
  document.addEventListener("keydown", function (e) {
    if (!scrim) return;
    if (e.key === "Escape") { e.preventDefault(); if (!(cur && cur.opts.sticky)) U.sheet.close(); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(scrim.querySelectorAll("button,input,select,textarea,a[href],summary"), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  /* A labelled field for forms. kind: text | select | textarea | number | date | check */
  U.field = function (label, o) {
    o = o || {}; var el, id = "f_" + Math.random().toString(36).slice(2, 8), wrap;
    if (o.kind === "select") { el = h("select", { id: id }); (o.options || []).forEach(function (op) { var v = Array.isArray(op) ? op[0] : op, t = Array.isArray(op) ? op[1] : op; el.appendChild(h("option", { value: v, text: t })); }); el.value = o.value == null ? "" : o.value; }
    else if (o.kind === "textarea") { el = h("textarea", { id: id, rows: o.rows || 4 }); el.value = o.value || ""; }
    else { el = h("input", { id: id, type: o.kind === "number" ? "text" : (o.kind || "text"), inputmode: o.kind === "number" ? "decimal" : o.inputmode || false, autocomplete: "off", list: o.list || false }); el.value = o.value == null ? "" : o.value; }
    if (o.ph) el.setAttribute("placeholder", o.ph); if (o.max) el.setAttribute("maxlength", o.max); if (o.name) el.name = o.name;
    wrap = h("label", { class: o.wide ? "wide" : "", for: id }, [label, el, o.hint ? h("span", { class: "hint", text: o.hint }) : null]);
    wrap.input = el; return wrap;
  };
  U.check = function (label, on) { var i = h("input", { type: "checkbox" }); i.checked = !!on; var l = h("label", { class: "bl-check" }, [i, label]); l.input = i; return l; };
  root.BLU = U;
})(window);
