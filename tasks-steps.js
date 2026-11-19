/* Sub-steps for every task on the Board. Pure functions, no page access.
   Rule: a step is one small thing you can finish in about 2 minutes. Nothing here invents facts: steps come from the task's own
   sentences, from the Closing Desk README, or from your own follow-up list (names and phone numbers you already saved). */
window.ROSSTEPS = (function () {
  function S(t, m) { return { t: t, m: m == null ? 2 : m }; }

  var HEAD_RE = /^(.*\s)?(\d\/\d|#\d)$/;               /* "Gmail setup 1/2", "Email #1" are headings, not steps */

  function sentences(title) {
    var parts = String(title || "").replace(/\s+/g, " ").trim().split(/[.!?]\s+/);
    var out = [];
    parts.forEach(function (p) {
      p = p.replace(/[.!?]+$/, "").trim();
      if (p.length < 3 || HEAD_RE.test(p)) return;
      out.push(p.charAt(0).toUpperCase() + p.slice(1));
    });
    return out;
  }

  /* Reach tasks: how many people the task asks for, and how. */
  function reachInfo(title) {
    var t = String(title || "");
    var m = /^Call or WhatsApp your (\d+) /i.exec(t); if (m) return { n: +m[1], how: "Call or WhatsApp" };
    m = /^Call (\d+) people/i.exec(t); if (m) return { n: +m[1], how: "Call" };
    m = /^WhatsApp (\d+) people/i.exec(t); if (m) return { n: +m[1], how: "WhatsApp" };
    m = /^Send (\d+) (personal holiday )?WhatsApps/i.exec(t); if (m) return { n: +m[1], how: "WhatsApp" };
    return null;
  }

  function personStep(how, p) {
    var tail = p.phone ? " · " + p.phone : "";
    return S(how + " " + p.name + tail, 2);
  }

  function reachSteps(t, people) {
    var ri = reachInfo(t.title), out = [];
    out.push(S("Open Clients. Your people due today are listed there", 1));
    if (people && people.length) {
      var pick = people.slice(0, ri.n);
      if (ri.n <= 10) {
        pick.forEach(function (p) { out.push(personStep(ri.how, p)); });
      } else {
        for (var i = 0; i < pick.length; i += 5) {
          var grp = pick.slice(i, i + 5);
          out.push(S(ri.how + " " + grp.map(function (p) { return p.name; }).join(", "), 8));
        }
      }
      if (pick.length < ri.n) out.push(S("Only " + pick.length + " people are due. Pick the rest in Clients › Everyone", 2));
    } else {
      for (var k = 1; k <= Math.min(ri.n, 10); k++) out.push(S(ri.how + " person " + k + " from the list", 2));
    }
    out.push(S("Tap Talked, Messaged or No answer on each person so it counts", 2));
    return out;
  }

  /* Hand-written steps for the tasks that were too vague. Matched on the start of the task text. */
  var HAND = [
    [/^Pick your commercial course/, [
      S("Open the Haskayne course page", 1),
      S("Confirm the total course hours", 3),
      S("Decide: Haskayne or another provider", 3),
      S("Tell Claude your pick", 1)]],
    [/^Enrol and pay for the course/, [
      S("Enrol in the course", 5),
      S("Pay, then save the login in your password manager", 3),
      S("Order the HP 10bII+ calculator", 3),
      S("Tell Claude it is paid", 1)]],
    [/^Check the course has unlocked/, [
      S("Log in to the course", 1),
      S("Check that it has unlocked", 1),
      S("Skim the outline", 8)]],
    [/^Gmail setup 1\/2/, [
      S("Open console.cloud.google.com and sign in with your Gmail", 1),
      S("Create a project named Closing Desk", 2),
      S("APIs & Services › Library › search Gmail API › Enable", 2),
      S("OAuth consent screen › External › add your app name and email", 3),
      S("On that screen, add your own Gmail under Test users", 2),
      S("Data access: add gmail.send and userinfo.email. Nothing else", 3),
      S("In Google Cloud: Clients › Create client › Web application", 2),
      S("Add https://shivamvasudevarealtor.github.io as an Authorized JavaScript origin, then Create", 2),
      S("Copy the Client ID (it is not a secret) and keep the tab open", 1)]],
    [/^Gmail setup 2\/2/, [
      S("Open Email › Set up email", 1),
      S("Paste the Client ID", 1),
      S("Fill in your name, brokerage line and mailing address", 3),
      S("Tap Test unsubscribe link. It must say Working", 2),
      S("Tap Connect Gmail", 1),
      S("Google says not verified: Advanced › Go to Closing Desk › Continue", 2),
      S("Tick the box that allows sending email", 1)]],
    [/^Email #1/, [
      S("Open Email › New campaign", 1),
      S("Pick a starter email", 2),
      S("Tap Send a test to me", 1),
      S("Open your inbox and read it on your phone", 2),
      S("Check your spam folder too", 1),
      S("If it looks right, leave the campaign unsent for now", 1)]],
    [/^Mark Client consent/, [
      S("Open Clients › Everyone", 1),
      S("Tap Select", 1),
      S("Filter to your past clients", 3),
      S("Tap Select all on the filtered list", 1),
      S("Tap Email consent, choose Client, then Apply", 2),
      S("Open one person and check the Email section shows the mark", 2)]],
    [/^Mark Said yes or Asked me/, [
      S("Open Clients › Everyone › Select", 1),
      S("Pick only people who agreed, or who contacted you", 5),
      S("Tap Email consent and choose Said yes or Asked me", 2),
      S("Skip anyone you are unsure about", 1),
      S("Open one person and check the mark", 2)]],
    [/^Count your contacts/, [
      S("Open Clients › Everyone", 1),
      S("Write down the total number of contacts", 1),
      S("Filter Has email and write the count", 1),
      S("Filter Has phone and write the count", 1),
      S("Filter by consent and write the count", 1),
      S("Tell Claude the four numbers", 1)]],
    [/^Film 2 Reels in one sitting/, [
      S("Pick 2 hooks (use the caption-generator skill)", 5),
      S("Put the phone on the stand or gimbal and check the light", 3),
      S("Film Reel 1 in one take", 5),
      S("Film Reel 2 in one take", 5),
      S("Send both raw clips to the editor", 2)]],
    [/^Schedule the banked Reels/, [
      S("Open the folder with the finished Reels", 1),
      S("Schedule the first Reel for Nov 21", 2),
      S("Schedule the rest, one per day through Nov 29", 5),
      S("Check the dates once", 1)]],
    [/^Answer every unanswered message/, [
      S("Open WhatsApp and reply to unread", 4),
      S("Open Instagram DMs and reply to unread", 4),
      S("Open Gmail and reply to the newest emails", 4)]],
    [/^Pick this week.s Reel idea/, [
      S("Open Board › Ideas and pick one idea", 2),
      S("Ask the caption-generator skill for the hook", 3),
      S("Write the hook down where you will see it when you film", 1)]],
    [/^Film one Reel in one take/, [
      S("Set up the phone and check the light", 3),
      S("Film the Reel in one take", 5),
      S("Send the raw clip to the editor", 2)]],
    [/^Message one builder/, [
      S("Pick one builder or past client", 1),
      S("Use the builder-inquiry skill to draft the message", 3),
      S("Check the draft, then send it", 2)]],
    [/^5-minute scoreboard/, [
      S("Open More › Scorecard (or the Dash page)", 1),
      S("Read reached, replies and appointments for the week", 2),
      S("Tell Claude the three numbers", 1)]],
    [/^Schedule next Saturday.s 9am Reel/, [
      S("Open the finished Reel", 1),
      S("Schedule it for Saturday 9am", 2),
      S("Reply to the comments on last week's Reel", 5)]],
    [/^Start campaign #1/, [
      S("Open Email and check Gmail is connected", 1),
      S("Open Email › New campaign and pick Clients with consent", 3),
      S("Send a test to yourself first", 2),
      S("Tap Start sending", 1),
      S("Keep the laptop open", 1)]],
    [/^Email day\./, [
      S("Open Email and check the campaign status", 1),
      S("Keep the page open and Connect Gmail if it asks", 1),
      S("Answer the newest replies in Gmail", 8)]],
    [/^Answer every reply, then message the No-answer/, [
      S("Open Gmail and WhatsApp and answer every reply", 8),
      S("Open Clients and message the people marked No answer", 8)]]
  ];

  function handFor(title) {
    for (var i = 0; i < HAND.length; i++) if (HAND[i][0].test(title)) return HAND[i][1];
    return null;
  }

  function copy(a) { return a.map(function (x) { return { t: x.t, m: x.m }; }); }

  /* The steps for one task. people: [{name, phone}] from your due list, best first (may be empty). */
  function forTask(t, people) {
    var title = String((t && t.title) || "");
    if (t && t.cls === "rest") return [S("Do something that is not work", 5)];
    if (reachInfo(title)) return reachSteps(t, people);
    var hand = handFor(title);
    if (hand) return copy(hand);
    var out = [];
    if (t && t.tag === "STUDY" && t.mins >= 45) {
      var block = Math.round(t.mins / 2);
      var parts = sentences(title);
      out.push(S("Block 1 · " + (parts[0] || "Study"), block));
      out.push(S("Break. Stand up, water, no phone", 10));
      out.push(S("Block 2 · " + (parts.slice(1).join(". ") || "Keep going on the same topic"), block));
      return out;
    }
    var s = sentences(title);
    var n = Math.max(1, s.length);
    var per = Math.max(1, Math.round((t && t.mins ? t.mins : 8) / (n + (t && t.where && /^Closing Desk/.test(t.where) ? 1 : 0))));
    if (t && t.where && /^Closing Desk/.test(t.where)) out.push(S("Open " + t.where, 1));
    s.forEach(function (x) { out.push(S(x, per)); });
    if (!s.length) out.push(S(title || "Do the task", per));
    return out;
  }

  function totalMins(steps) { return (steps || []).reduce(function (a, x) { return a + (x.d ? 0 : (x.m || 0)); }, 0); }

  return { forTask: forTask, sentences: sentences, reachInfo: reachInfo, totalMins: totalMins };
})();
