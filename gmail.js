/* Gmail layer for Realtor OS. Sign in with Google, build the email, send it through the Gmail API.
   Knows nothing about contacts or campaigns: app.js decides who gets what and when.
   The Email tab asks for two permissions: send email as you (gmail.send) and read your own address (userinfo.email).
   The Builders tab can also ask for gmail.readonly (opts.read), only so it can read replies to the emails it sent and bounce notices.
   The access token lives in memory only (never saved), so closing the tab signs Gmail out; tap Connect Gmail again. */
(function (root) {
  "use strict";
  var SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
  var GSI = "https://accounts.google.com/gsi/client";
  var READ = "https://www.googleapis.com/auth/gmail.readonly";
  var st = { token: "", exp: 0, email: "", scope: "" };

  /* ---------- building the message (pure functions) ---------- */
  function utf8(s) { return new TextEncoder().encode(s); }
  function b64bytes(bytes) { var bin = "", i, CH = 0x8000; for (i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(bin); }
  function b64(s) { return b64bytes(utf8(s)); }
  function wrap76(s) { return (s.match(/.{1,76}/g) || [""]).join("\r\n"); }
  function b64url(s) { return b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim(); }
  function isAscii(s) { return /^[\x20-\x7e]*$/.test(s); }
  /* RFC 2047: non-ASCII header text becomes =?UTF-8?B?...?= words, each under 75 characters. */
  function encWord(s) {
    if (isAscii(s)) return s;
    var out = [], cur = "";
    Array.from(s).forEach(function (ch) { if (utf8(cur + ch).length > 42) { out.push(cur); cur = ""; } cur += ch; });
    if (cur) out.push(cur);
    return out.map(function (p) { return "=?UTF-8?B?" + b64(p) + "?="; }).join("\r\n ");
  }
  function fmtAddr(name, email) {
    name = clean(name); email = clean(email);
    if (!name) return "<" + email + ">";
    if (isAscii(name)) return '"' + name.replace(/(["\\])/g, "\\$1") + '" <' + email + ">";
    return encWord(name) + " <" + email + ">";
  }
  function rand(n) { var a = new Uint8Array(n); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); }); return Array.from(a).map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }

  /* o: { from:{name,email}, to, replyTo?, subject, text, html, unsubUrl?, unsubMail? }  ->  raw RFC 2822 text */
  function build(o) {
    var bnd = "cd_" + rand(12), h = [];
    h.push("From: " + fmtAddr(o.from.name, o.from.email));
    h.push("To: " + clean(o.to));
    if (o.replyTo) h.push("Reply-To: " + clean(o.replyTo));
    h.push("Subject: " + encWord(clean(o.subject)));
    h.push("Date: " + new Date().toUTCString());
    h.push("MIME-Version: 1.0");
    if (o.unsubUrl) h.push("List-Unsubscribe: <" + clean(o.unsubUrl) + ">" + (o.unsubMail ? ", <mailto:" + clean(o.unsubMail) + "?subject=Unsubscribe>" : ""));
    h.push('Content-Type: multipart/alternative; boundary="' + bnd + '"');
    var body = ["--" + bnd, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(o.text)),
      "--" + bnd, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(o.html)), "--" + bnd + "--", ""];
    return h.join("\r\n") + "\r\n\r\n" + body.join("\r\n");
  }
  function raw(o) { return b64url(build(o)); }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Plain text from the composer -> simple HTML: paragraphs, line breaks, links. No images, no scripts. */
  function textToHtml(text) {
    return String(text).replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).map(function (p) {
      return '<p style="margin:0 0 14px">' + esc(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* ---------- Google sign-in ---------- */
  function ready() { return !!(root.google && root.google.accounts && root.google.accounts.oauth2); }
  function load() {
    if (ready()) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = GSI; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("Could not load Google sign-in. Check your connection or ad blocker.")); };
      document.head.appendChild(s);
    });
  }
  /* Must be called straight from a tap (so the browser lets the Google window open). Call load() earlier so ready() is true. */
  function connect(clientId, hint, opts) {
    var wantRead = !!(opts && opts.read);
    return new Promise(function (resolve, reject) {
      if (!ready()) { reject(new Error("Google sign-in is still loading. Tap again in a second.")); return; }
      var c = root.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPES + (wantRead ? " " + READ : ""),
        callback: function (r) {
          if (!r || r.error) { reject(new Error((r && (r.error_description || r.error)) || "Google sign-in failed.")); return; }
          if (String(r.scope || "").indexOf("gmail.send") < 0) { reject(new Error("Gmail permission was not given. On the Google screen, tick the box that lets Realtor OS send email.")); return; }
          if (wantRead && String(r.scope || "").indexOf("gmail.readonly") < 0) { reject(new Error("Reading replies was not allowed. On the Google screen, tick the box that lets Realtor OS read email, or use Paste a reply instead.")); return; }
          st.scope = String(r.scope || ""); st.token = r.access_token; st.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 120000; resolve();
        },
        error_callback: function (e) {
          var t = e && e.type;
          reject(new Error(t === "popup_closed" ? "The Google window was closed before finishing." : t === "popup_failed_to_open" ? "Your browser blocked the Google window. Allow pop-ups for this site and try again." : ((e && e.message) || "Google sign-in failed.")));
        }
      });
      c.requestAccessToken(hint ? { login_hint: hint } : {});
    }).then(function () {
      return fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + st.token } }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.email) throw new Error("Connected, but could not read your Gmail address.");
        st.email = String(j.email).toLowerCase(); return st.email;
      });
    });
  }
  function disconnect() { var t = st.token; st.token = ""; st.exp = 0; st.email = ""; st.scope = ""; try { if (t && ready()) root.google.accounts.oauth2.revoke(t, function () {}); } catch (e) {} }
  function token() { return st.token && Date.now() < st.exp ? st.token : ""; }
  /* Drop the saved token without contacting Google (used when Gmail says the token is no good). */
  function forget() { st.token = ""; st.exp = 0; st.scope = ""; }
  function canRead() { return !!token() && st.scope.indexOf("gmail.readonly") >= 0; }

  /* ---------- sending ---------- */
  /* Error kinds: auth (token expired), limit (Gmail says slow down / daily limit), bad (this one address is invalid),
     denied (permission), server (Gmail had a problem: the email may or may not have gone), network (same), other. */
  function classify(status, j) {
    var e = (j && j.error) || {}, reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || "", msg = e.message || "";
    var err = new Error(msg || ("Gmail error " + status)); err.status = status; err.reason = reason;
    var m = (msg + " " + reason).toLowerCase();
    if (status === 401) err.kind = "auth";
    else if (status === 429 || (status === 403 && /ratelimit|rate limit|quota|sending limit|too many|dailylimit/.test(m))) err.kind = "limit";
    else if (status === 400 && /to header|recipient|address/.test(m)) err.kind = "bad";
    else if (status === 403) err.kind = "denied";
    else if (status >= 500) err.kind = "server";
    else err.kind = "other";
    return err;
  }
  function send(rawMsg) {
    var t = token(); if (!t) { var e0 = new Error("Gmail is not connected."); e0.kind = "auth"; return Promise.reject(e0); }
    return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ raw: rawMsg })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok) return { id: j.id || "", threadId: j.threadId || "" }; throw classify(r.status, j); });
    }, function () { var e = new Error("Could not reach Gmail."); e.kind = "network"; throw e; });
  }


  /* ---------- reading (only when connected with opts.read) ---------- */
  function api(path) {
    var t = token(); if (!t) { var e0 = new Error("Gmail is not connected."); e0.kind = "auth"; return Promise.reject(e0); }
    return fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + path, { headers: { Authorization: "Bearer " + t } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok) return j; throw classify(r.status, j); });
    }, function () { var e = new Error("Could not reach Gmail."); e.kind = "network"; throw e; });
  }
  function getThread(id) { return api("threads/" + encodeURIComponent(id) + "?format=full"); }
  function getMessage(id) { return api("messages/" + encodeURIComponent(id) + "?format=full"); }
  function search(q, max) { return api("messages?maxResults=" + (max || 25) + "&q=" + encodeURIComponent(q)).then(function (j) { return (j.messages || []).map(function (m) { return m.id; }); }); }
  function unb64url(s) {
    try { var b = atob(String(s || "").replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder("utf-8").decode(u); } catch (e) { return ""; }
  }
  function walk(part, out) {
    if (!part) return;
    var mt = String(part.mimeType || "").toLowerCase();
    if (part.parts && part.parts.length) part.parts.forEach(function (p) { walk(p, out); });
    else if (part.body && part.body.data) { if (mt === "text/plain") out.text.push(unb64url(part.body.data)); else if (mt === "text/html") out.html.push(unb64url(part.body.data)); }
  }
  /* Gmail API message -> the few fields we use. Attachments are ignored. */
  function parseMessage(m) {
    var h = {}; ((m.payload && m.payload.headers) || []).forEach(function (x) { h[String(x.name).toLowerCase()] = x.value; });
    var out = { text: [], html: [] }; walk(m.payload, out);
    return { id: m.id, threadId: m.threadId, from: h.from || "", to: h.to || "", subject: h.subject || "", date: h.date || "", internalDate: m.internalDate ? new Date(+m.internalDate).toISOString() : "",
      autoSubmitted: h["auto-submitted"] || "", messageId: h["message-id"] || "", labels: m.labelIds || [], text: out.text.join("\n"), html: out.html.join("\n"), snippet: m.snippet || "" };
  }

  root.CDMail = { SCOPES: SCOPES, build: build, raw: raw, textToHtml: textToHtml, encWord: encWord, load: load, ready: ready, connect: connect, disconnect: disconnect, forget: forget, token: token,
    email: function () { return st.email; }, expiresAt: function () { return st.exp; }, send: send, classify: classify,
    canRead: canRead, getThread: getThread, getMessage: getMessage, search: search, parseMessage: parseMessage };
})(typeof window !== "undefined" ? window : globalThis);
