/* The "reached" numbers, worked out in one place so Today (Clients) and the Tasks page always agree.
   "Reached" = the contact has at least one logged touch that means a real conversation or message went out.
   No answer, Note and Added do not count. The same definition is written as SQL in supabase/os-snapshot.sql; keep the two in step. */
(function () {
  "use strict";
  var REACH_RE = /^(Talked|Sent a message|Call:|Text:|WhatsApp:|Email:|Meeting:|Mass email: |Birthday wishes|Family birthday|Home anniversary)/;
  var ATTEMPT_RE = /^(Talked|Sent a message|No answer|Call:|Text:|WhatsApp:|Meeting:)/;
  var MASS_RE = /^Mass email: /;

  /* contacts: array of contact records. td: today as YYYY-MM-DD. */
  function compute(contacts, td) {
    var s = { contacts: 0, reached: 0, withEmail: 0, withPhone: 0, consented: 0, touchesToday: 0, emailsToday: 0, dueToday: 0 };
    (contacts || []).forEach(function (c) {
      if (c.stage === "Dead") return;
      s.contacts++;
      if (c.email) s.withEmail++;
      if (c.phone) s.withPhone++;
      if (c.consent) s.consented++;
      if (c.next && c.next <= td) s.dueToday++;
      var got = false;
      (c.log || []).forEach(function (l) {
        var t = (l && l.t) || "", d = (l && l.d) || "";
        if (REACH_RE.test(t)) got = true;
        if (ATTEMPT_RE.test(t) && d === td) s.touchesToday++;
        if (MASS_RE.test(t) && d === td) s.emailsToday++;
      });
      if (got) s.reached++;
    });
    s.left = s.contacts - s.reached;
    s.pct = s.contacts ? Math.round(s.reached * 100 / s.contacts) : 0;
    return s;
  }

  window.CDStats = { compute: compute };
})();
