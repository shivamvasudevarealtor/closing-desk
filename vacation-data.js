/* Vacation week plan, Nov 18 to 29, 2026. Entered by Shivam (not demonstration data).
   Source: the plan text Shivam pasted on Nov 19, 2026. No vacation-week-tasks.json existed, so this file is the source.
   Parent ids VW-01 to VW-12, subtask ids VW-xx.n (n = the number in the plan, so it never changes).
   Item shape: [time, title, category, details]. time "" means no time given (shown as "Anytime"). */
(function () {
  "use strict";

  var WAKE = ["6:30-6:45 AM", "Wake up, phone stays outside the bedroom", "reset", ""];
  var SON = ["7:30-8:00 AM", "Time with your son", "family", ""];
  var BREAKFAST = ["8:00-8:20 AM", "Breakfast", "fuel", "3 eggs (or paneer bhurji), 1 roti or oats, 1 banana, chai or coffee (cup 1)."];

  function weekend(extra, lastItems) {
    var list = [
      WAKE,
      ["6:45-7:10 AM", "At-home workout, 25 min", "body", "3 rounds: 15 pushups, 20 squats, 10 lunges per leg, 30-second plank. If late, do 10 min and keep going."],
      SON,
      BREAKFAST,
      ["8:30-10:30 AM", "Study block", "study", "New material at the desk, phone in another room."],
      ["10:30 AM-12:30 PM", "Prospecting block", "prospecting", "Calls, texts, voice notes from the call list."]
    ].concat(lastItems || [["12:30 PM on", "Rest of the day is family time", "family", "No work."]]);
    return extra ? list.concat(extra) : list;
  }

  function weekday(lunchText, extra) {
    var list = [
      WAKE,
      ["6:45-7:10 AM", "At-home workout, 25 min", "body", "3 rounds: 15 pushups, 20 squats, 10 lunges per leg, 30-second plank. If late, do 10 min and still start at 8:30."],
      ["7:10-7:30 AM", "Shower and get ready", "reset", ""],
      ["7:30-8:00 AM", "Time with your son", "family", "Spouse does the 9:30 dayhome drop-off."],
      BREAKFAST,
      ["8:30-10:30 AM", "Study block 1", "study", "Desk, door closed. Son is home until 9:30: use earbuds and do lighter review first, then new material."],
      ["10:30-10:45 AM", "Snack at the block change", "fuel", "Apple and a handful of almonds. Water or plain tea, no coffee here."],
      ["10:30 AM-12:30 PM", "Prospecting block 1", "prospecting", "Calls, texts, voice notes from last night's list. Log each in Closing Desk."],
      ["12:30-12:55 PM", "Lunch from the fridge", "fuel", lunchText],
      ["12:55-1:00 PM", "Fill the thermos and grab the packed bag", "admin", "Laptop, charger, headphones, notebook, snack, water bottle."],
      ["1:00-1:15 PM", "Leave for Airdrie Public Library", "study", "805 Main St S. Backup: Ground Press Coffee and Books. Ask at the desk about a private space the first day."],
      ["1:15-3:45 PM", "Study block 2 at the library", "study", "Practice questions. Coffee from the thermos around 1:30. No coffee after 2:30. Yogurt and banana at 3:00."],
      ["3:45-4:45 PM", "Prospecting block 2", "prospecting", "Follow-ups, door-knock or calls. Log everything in Closing Desk."],
      ["4:45-5:15 PM", "Admin slot", "admin", "Client messages, 20 min Instagram on the laptop, empty the parking-lot notebook."],
      ["5:15-5:30 PM", "Plan tomorrow and pack the library bag", "admin", "Set tomorrow's call list and study topic. Bag by the door."],
      ["6:00 PM on", "Family time", "family", "Dinner and bedtime. No work, no snacking after 8."],
      ["9:45-10:00 PM", "Check tomorrow's list, close the laptop", "admin", ""],
      ["10:15-11:00 PM", "Phone on the charger outside the bedroom", "reset", "Wind down without screens, then lights out at 11."]
    ];
    return extra ? list.concat(extra) : list;
  }

  var LUNCH_A = "Lunch A: dal, rice, sabzi, salad.";
  var LUNCH_B = "Lunch B: chole or chicken curry, roti, cucumber salad.";
  var WEEKEND_DETAILS = "One study block and one prospecting block, rest is family.";
  var WEEKDAY_DETAILS = "Full study and prospecting day.";

  /* Titles for VW-04 to VW-09, VW-11 and VW-12 were not given in the plan text. They are plain labels taken from the template's own details. */
  var PARENTS = [
    { id: "VW-01", date: "2026-11-18", title: "Tonight: phone out of the bedroom", details: "", items: [
      ["", "Move the phone charger outside the bedroom", "reset", "Use a cheap alarm clock for the wake-up."],
      ["11:00 PM", "Lights out around 11:00 PM", "reset", ""]
    ] },
    { id: "VW-02", date: "2026-11-19", title: "Desk and workspace", details: "Buy by Fri at the latest. Marketplace for same-day pickup, or IKEA, Costco, Staples. Fallback: clear the kitchen table.", items: [
      ["", "Buy a stable desk and a real chair", "admin", "Any stable desk works. Do not hunt for the perfect one."],
      ["", "Set up in a room with a door", "admin", "Not the bed, not the sofa. Same spot every day."]
    ] },
    { id: "VW-03", date: "2026-11-20", title: "Friday setup before vacation", details: "", items: [
      ["5:30 PM", "Grocery run after work", "fuel", "Eggs 18 (or paneer 400 g); oats or roti flour; bananas 10; apples 5; almonds; large tub plain yogurt; lentils, rice, chickpeas (2 cans or dried); chicken or paneer; onions, tomatoes, ginger, garlic, 2 sabzi vegetables, cucumbers; chai or coffee."],
      ["", "Set up phone Focus mode", "reset", "Hide Instagram and Facebook from the home screen and log out of both on the phone. Use them on the laptop in the 4:45 admin slot only."],
      ["", "Install a site blocker on the laptop", "reset", "Freedom or Cold Turkey. Block social sites during study and prospecting blocks."],
      ["", "Build Monday's call list in Closing Desk", "prospecting", "20 to 30 names: past clients and cold leads. Refresh it each night after this."],
      ["", "Put course material and exam date in one folder", "study", "Needed for the study map."],
      ["", "Tell the family the schedule", "family", "Door closed 8:30 to 5:30, fully theirs from 6:00. Fri Nov 27 is a family day."]
    ] },
    { id: "VW-04", date: "2026-11-21", title: "Weekend day", details: WEEKEND_DETAILS, items: weekend() },
    { id: "VW-05", date: "2026-11-22", title: "Weekend day and batch cooking", details: WEEKEND_DETAILS, items: weekend([
      ["6:00-7:15 PM", "Batch cook for Mon to Wed", "fuel", "Dal, rice, one sabzi, chop salad, fill 3 containers. Bag 5 portions of almonds. Boil 6 eggs as emergency breakfast. About 75 min."]
    ]) },
    { id: "VW-06", date: "2026-11-23", title: "Study and prospecting day", details: WEEKDAY_DETAILS, items: weekday(LUNCH_A) },
    { id: "VW-07", date: "2026-11-24", title: "Study and prospecting day", details: WEEKDAY_DETAILS, items: weekday(LUNCH_B) },
    { id: "VW-08", date: "2026-11-25", title: "Study and prospecting day", details: WEEKDAY_DETAILS, items: weekday(LUNCH_A, [
      ["6:00-7:00 PM", "Cook Thursday's lunch", "fuel", "Chole or chicken curry, roti, cucumber salad. Friday is a family day, so nothing else to cook."]
    ]) },
    { id: "VW-09", date: "2026-11-26", title: "Study and prospecting day", details: WEEKDAY_DETAILS, items: weekday(LUNCH_B) },
    { id: "VW-10", date: "2026-11-27", family: true, title: "Father's birthday, family day off", details: "No study, no prospecting, no admin. Protected day.", items: [
      ["", "Go out with the family for your father's birthday", "family", "Nothing else is scheduled. Phone stays away from work."]
    ] },
    { id: "VW-11", date: "2026-11-28", title: "Weekend day and optional library study", details: WEEKEND_DETAILS, items: weekend(null, [
      ["1:15-3:45 PM", "Optional catch-up study block at the library", "study", "Makes up some of Friday. Drop it if the family plan fills the day. Check Saturday hours before leaving."],
      ["4:00 PM on", "Rest of the day is family time", "family", "No work."]
    ]) },
    { id: "VW-12", date: "2026-11-29", title: "Weekend day", details: WEEKEND_DETAILS, items: weekend() }
  ];

  window.VWDATA = {
    label: "Entered by Shivam",
    tz: "America/Edmonton",
    start: "2026-11-18",
    end: "2026-11-29",
    cats: ["reset", "body", "fuel", "study", "prospecting", "family", "admin"],
    parents: PARENTS
  };
})();
