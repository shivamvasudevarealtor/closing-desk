/* Unsubscribe page. Sends the one-time token from the email link to the database function that marks that contact as unsubscribed.
   Nothing happens until the button is tapped, so email security scanners that open links do not unsubscribe anyone by accident. */
(function () {
  "use strict";
  var cfg = window.CD_CONFIG || {}, msg = document.getElementById("msg"), go = document.getElementById("go");
  var m = /[?&]t=([0-9a-f]{32})(?:&|$)/i.exec(location.search), token = m ? m[1].toLowerCase() : "";
  function done(text, hideBtn) { msg.textContent = text; if (hideBtn) go.hidden = true; }
  if (!token) { done("This unsubscribe link is not complete. Please use the link from the email, or reply to the email and ask to be removed.", true); return; }
  if (!cfg.url || !cfg.anonKey) { done("This page is not set up yet. Please reply to the email and ask to be removed.", true); return; }
  go.addEventListener("click", function () {
    go.disabled = true; go.textContent = "Working...";
    fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/rpc/unsubscribe_contact", {
      method: "POST", headers: { apikey: cfg.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: token }), referrerPolicy: "no-referrer"
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (r) {
      if (r.ok && r.j === true) done("You are unsubscribed. You will not get marketing emails from this sender. If you were also on other lists of mine, reply to any of my emails and I will remove you there too.", true);
      else if (r.ok) done("We could not find that link. Please reply to the email and ask to be removed.", true);
      else throw new Error("bad response");
    }).catch(function () { go.disabled = false; go.textContent = "Try again"; done("Something went wrong. Please try again, or reply to the email and ask to be removed."); });
  });
})();
