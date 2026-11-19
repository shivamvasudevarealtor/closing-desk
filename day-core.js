/* Today's three tasks from Claude, read from the Board document (os_docs row "main").
   Same rule as the Tasks page: the plan for the real today, with each task marked done, doing now or to do. Missed tasks are skipped.
   Pure function: it reads the document it is given and changes nothing. Needs tasks-plan.js (ROS) and tasks-info.js (TASK_INFO). */
window.CDDay = (function () {
  "use strict";
  function head(title) {
    var TI = window.TASK_INFO || {}, x = TI[title];
    if (x) return x.head;
    var m = /^(.*?[.!?:])\s+(.*)$/.exec(title || "");
    return m ? m[1].replace(/[.:]$/, "") : (title || "").replace(/\.$/, "");
  }
  function keyOf(t) { return t.oid || t.id; }

  /* doc: the "main" document (or null). td: today as YYYY-MM-DD in Edmonton. */
  function plan(doc, td) {
    var R = window.ROS;
    if (!R || td < R.START || td > R.END) return [];
    var outcomes = (doc && doc.outcomes && typeof doc.outcomes === "object") ? doc.outcomes : {};
    var placements = (doc && doc.placements && typeof doc.placements === "object") ? doc.placements : {};
    var doing = doc && doc.doing || null;
    var D;
    try { D = R.derive(outcomes, placements, R.clamp(td)); } catch (e) { return []; }
    var arr = D.eff[td] || [], oc = outcomes[td] || [], dk = null;
    if (doing && doing.d === td) {
      for (var i = 0; i < arr.length; i++) { if (keyOf(arr[i]) === doing.key && !oc[i]) { dk = doing.key; break; } }
    }
    var out = [];
    arr.forEach(function (t, i) {
      var st = oc[i];
      if (st === "missed") return;
      out.push({ title: head(t.title), state: st === "done" ? "done" : (dk && keyOf(t) === dk ? "doing" : "todo"), mins: t.mins || null });
    });
    return out;
  }
  return { plan: plan, head: head };
})();
