# Realtor OS backlog

This is the one place that tracks status for planned work. Do not copy status into other files.
Status moves to **Review** only after the checks below pass, and to **Done** only after Shivam confirms.

| ID | Story | Module | Priority | Milestone | Status |
|---|---|---|---|---|---|
| PLN-001 | Vacation week plan workspace | Realtor OS / Vacation week | P0 | Vacation week | Review |
| PLN-002 | Simplify the Dashboard | Realtor OS / Dashboard | P1 | Vacation week | Review |
| PLN-003 | Today tab with Apple Calendar | Realtor OS / Board | P0 | Vacation week | Review |
| PLN-004 | Home page, new look, one Today list | Realtor OS / Home | P0 | v2.0 | Review |
| PLN-005 | Builders: directory, monthly ask, replies, deals, client PDF | Realtor OS / Builders | P0 | v2.1 | Review |
| PLN-006 | Vacation week card on Home (commercial licence study plan) | Realtor OS / Home | P1 | Vacation week | Review |
| PLN-007 | One Today list: every task at a glance, tap to expand, split by source at the bottom | Realtor OS / Home, Tasks | P0 | v2.2 | Review |
| PLN-008 | Five pillars: a Home card, daily habits in Today, Communication practice, steps under tasks, licence waiting | Realtor OS / Home, Tasks | P0 | v2.3 | Review |
| PLN-009 | Clients: a Leads section on top, a slim Due list (name, type, status), tap a row for an action modal | Realtor OS / Clients | P0 | v2.4 | Review |

## PLN-001: Vacation week plan workspace

**Why:** The Nov 18 to 29, 2026 vacation plan (12 days, 114 subtasks) must be easy to see and tick off, in one place, without touching Realtor OS contacts.

**Where:** `vacation.html` (open `https://shivamvasudevarealtor.github.io/closing-desk/vacation.html`), item "Vacation" in the main nav.

**Acceptance criteria**
1. Sidebar and bottom bar have a "Vacation week" item that opens the workspace.
2. Board view (default on a laptop): one column per day, Nov 18 to 29 in date order, sticky column headers, sideways scroll. One card per parent task with title, date, progress bar and its subtasks in time order.
3. Today view (default on a phone): today's parent task in America/Edmonton time, in time order, with "Next up" on the next unticked subtask. Outside the week it says there is no plan and links to the board.
4. List view: table with Date, Time, Task, Category, Status, Details.
5. Filters: category (reset, body, fuel, study, prospecting, family, admin), status, text search, Clear.
6. Each subtask has a checkbox, a time range, a title, expandable details, an optional note, and a completed-at time. All saved.
7. Overview (Board page) has a small "Today's plan" card: progress and next subtask, opens Today view, has an empty state outside the week.
8. Fri Nov 27 is a protected family day: labelled "Family day, nothing scheduled", styled differently, left out of progress and "not done" counts.
9. Data is seeded once with stable IDs (VW-01 to VW-12, VW-xx.n). Seeding again never duplicates and never overwrites ticks or notes.
10. Times show in 12-hour format. Plan is labelled "Entered by Shivam". No notifications, calendar sync or integrations.
11. Existing Realtor OS pages, contacts, settings and follow-ups are unchanged.

**Verification evidence (automated browser run, `t16`, 70 checks, 0 failed)**
- Board: 12 columns, 12 parent cards, 114 subtasks (counted in the page).
- Tick persists after reload and after clearing this device's copy (restored from the saved document). Week progress and day progress update.
- Seeding again: "Nothing to add", 12 parents and 114 subtasks, tick and note kept. Two rows deleted on purpose came back, no duplicates, tick kept.
- Next up at a mocked Edmonton time: Sat Nov 21 7:00 AM gives the workout; 7:15 AM gives Time with your son; ticking the workout at 7:00 AM moves it to Time with your son. Thu Nov 19 11:30 PM Edmonton shows Thu Nov 19 even with the browser set to UTC.
- Nov 27: family label, dashed card, no progress bar, week total is 113 not 114, ticking its item does not change progress, no "not done" on it.
- Existing data: contacts 811 before and 811 after with identical content, settings identical, the only new database row is `os_docs` id `vacation`, no write to any other table.
- Phone 390 and 360 px: no sideways page scroll on Today, Board or List; bottom bar shows all 6 items and stays fixed.
- Keyboard: Tab shows a 3 px outline on buttons and checkboxes; Space ticks the focused checkbox.

**Not verified:** on a real iPhone or the real Galaxy Tab. Live database: read-only check done, `os_docs` accepts any text id, owner defaults to the signed-in user, row-level security is owner only, so the new `vacation` row can be saved; the first real seed still happens when Shivam opens the page.

**Open question for Shivam:** the plan gave titles for VW-01, 02, 03 and 10 only. The other eight day titles ("Weekend day", "Weekend day and batch cooking", "Study and prospecting day", "Weekend day and optional library study") are taken from the plan's template names and extra items. Rename in `vacation-data.js` if you want different words.

## PLN-002: Simplify the Dashboard

**Acceptance criteria:** four go-to buttons at the top (phone and tablet), two headline cards (reached, today), today's vacation plan, everything else under a collapsed "More detail", no repeated "Live" chips.

**Verification evidence:** screenshots at 390, 800 and 1440 px; no script errors; the vacation card matches the Board card (t16 K6, K7).

## PLN-003: Today tab with Apple Calendar

**Why:** One list for today that mixes Apple Calendar events, tasks Shivam adds, and the tasks Claude gives (today's Board plan), so nothing is missed.

**Where:** Board page, new "Today" tab (`tasks.html#today`). Code: `tasks-today.js`; server: Supabase Edge Function `calendar-feed`.

**Acceptance criteria**
1. New tab next to Board. Shows today only (Edmonton date and time, 12-hour).
2. Calendar: connect with an iCloud Public Calendar share link. Events show in Scheduled with times, labelled Calendar. Repeating, moved, cancelled, all-day and overnight events are handled.
3. Add a task with an optional time; tick it; remove it. Timed tasks sit among calendar events by time. Saved and restored on reload and from the server.
4. Today's Board plan tasks appear labelled "From Claude", with their state, and open the Board.
5. Unfinished tasks from earlier days carry over with their date.
6. Disconnect clears the link. Errors are plain sentences and keep the last copy of events.
7. Existing Board, Plan, Ideas, Notes, Clients, Pipeline and Email behave as before.

**Verification evidence**
- Browser run `t17`, 44 checks, 0 failed: tab order, connect and bad-link refusal, events with 12-hour times, all-day first, timed task between events, count excludes events, tick and remove persist after reload and after clearing this device, errors (iCloud and sign-in), disconnect in two taps, carry-over, 11:30 PM Edmonton with the browser in UTC, no sideways scroll at 360, 390, 800, 1138 and 1440 px, visible focus.
- Calendar reading logic `ical-today.mjs`: 20 checks against sample iCloud-style feeds (weekly repeat with a skipped day, moved occurrence, cancelled event, all-day, overnight, UTC and floating times, a daylight-saving day in Toronto).
- Edge Function deployed to the closing-desk project (active, JWT required). Link checks: only https `*.icloud.com`, no credentials or ports, 12 sample links tested.

**Not verified:** a real iCloud link (this sandbox cannot reach iCloud or Supabase); the deployed function end to end. First real test: paste your share link and tap Connect.

## PLN-004: Home page, new look, one Today list

**Why:** The app was hard to read at speed: four places to look, a six-button bar, and the numbers page buried. Shivam wants one screen that shows who to reach, his day, and what must get done, with tasks split by where they came from (calendar, his own, Claude's), in a look that reads as a finished product. Also: rename Closing Desk to Realtor OS.

**Where:** `home.html` (first screen on a fresh launch), Tasks > Today (`tasks.html#today`), every page (look and bottom bar). Code: `home.js`, `home.css`, `ros.css`, `crm-core.js`, `day-core.js`, `tasks-info.js`, `tasks-today.js`.

**Acceptance criteria**
1. Home shows, in this order: three tiles, Do this next, vacation card, Reach out (top 5 due), My day, Must work on (with add box), Deals in motion, folded numbers. No horizontal scroll from 360px to 1920px.
2. Reach out lists the same people in the same order as Clients > Due today. The count matches the Clients badge.
3. Tapping a person gives Talked / Messaged / No answer / Later. It saves the same fields as Clients, shows what happened with Undo, and a refused save changes nothing and says so.
4. Tasks > Today is the first Tasks tab. Filter All / Calendar / Mine / Claude with counts. Calendar events, tasks he adds and Claude's tasks are in one list with a label each. Home and Tasks show the same tasks, ticks and counts.
5. Bottom bar has 5 buttons (Home, Tasks, Clients, Pipeline, Email). Settings stays reachable on every page. On laptops the left menu has the same items plus Settings.
6. Dark and light themes on every page, text contrast at least 4.5:1 for the main text, muted, accent and status colors (checked by calculation).
7. Name: Realtor OS in the page titles, headers, manifest and text. `dashboard.html` opens Home. A fresh launch opens Home. Signed out opens the sign-in page.
8. Nothing new is stored. No database or server change.

**Verification evidence** (browser runs against a copy of the database)
- `t18` Home, 61 checks: first screen content and order, tiles, same top 5 as Clients, outcome logging and Undo saved exactly, Later, refused save rolls back, add/tick/persist/reload, shared with Tasks, calendar events and the "now" event, nobody-due state, signed-out redirect, old dashboard address, theme switch, Edmonton time at 11:30 PM with the browser in UTC, six screen sizes in both themes, tap targets at least 38px.
- `t17` Tasks > Today, 48 checks (rewritten for the new list and filters). `t16` Vacation, 70. `t15` layouts at nine screen sizes, 74. `t14` Board and launch, 12. `t13` navigation and Board, 62. `t12` Email, 98.
- Screens of every page in dark and light at 390 and 1440 wide were looked at, and fixes made from them (sidebar marker, calendar setup card order, nav width on Home).

**Not verified:** a real iPhone or Galaxy Tab; the live GitHub Pages site after deploy; a real iCloud calendar; the live database write path. The new name only appears on a phone after the app is closed and reopened once; the Home Screen icon label changes only if the icon is removed and added again.

## PLN-005: Builders: directory, monthly ask, replies, deals, client PDF

**Why:** Shivam wants every builder's email, sorted by community and Calgary quadrant, a monthly Gmail ask for deals, spec homes and quick possessions, the replies read into separate fields he can filter, and a client-ready PDF for any deal.

**Where:** `builders.html` (6th bottom-bar button), Home card (`home.js`). Code: `builders-core.js` (rules, no browser needed), `builders-data.js` (saving, sending, reading), `builders-ui.js`, `builders.js`, `builders-views.js`, `builders-pdf.js`, `builders.css`, `gmail.js` (read scope added), `supabase/functions/parse-builder-reply/` (optional Claude reading, not deployed).

**Acceptance criteria**
1. Directory lists builders by community, city and quadrant (Calgary only). Airdrie, Chestermere and Cochrane have no quadrant. Filters: city, quadrant, community, email status. Each email shows its source.
2. Email checks: format, no-reply and placeholder addresses, domain mail records, source confirmation, bounce and reply evidence. The screen says plainly that a mailbox cannot be proven without sending.
3. Monthly ask is semi-automatic: prepared on the chosen day, sent only when Shivam taps Send, one at a time, inside sending hours, under a daily limit, never twice to the same address in a month, STOP honoured, a send that may have happened is marked "uncertain" and never resent automatically.
4. Replies are read while the app is open (or pasted). Each deal has separate fields; commission stays internal; unreadable parts are kept, not guessed; Claude reading, when on, is checked against the email text and anything not in it is dropped.
5. Deals filter by city, quadrant, community, builder, home type, price, bedrooms, possession, offer end, missing details. Edits survive re-reading. CSV export has one column per field and no commission.
6. Client PDF: one home or a shortlist, only builder-stated facts, the date, brokerage details, a confirm-in-writing note. No commission, no builder email, no personal name unless switched on.
7. Same data on two devices: changes merge, a refused save says so and can be retried.
8. Phone, tablet and laptop layouts, dark and light, no horizontal scroll, labelled controls.

**Verification evidence** (browser runs against a copy of the database, Gmail and DNS mocked)
- `t19a` core rules, 187 checks. `t19b` directory, 38. `t19c` sending, 41 (19 failure and edge cases). `t19d` replies and deals, 48. `t19e` PDF, paste, Claude reading and fallbacks, 37. `t19f` settings, two devices, refused save, 21. `t19g` layouts and labels at five sizes. `t19h` Home card, 13.
- Older suites updated for the 6th bottom-bar button: `t12` to `t18`.

**Not verified:** a real Gmail send or read; a real mailbox check; real DNS lookups (mocked); Claude reading with a real key (function not deployed); the live database write path; a real iPhone or tablet. Google must be set to allow `gmail.readonly` (README).

## PLN-007: One Today list: every task at a glance, tap to expand, split by source at the bottom

**Why:** The task screens disagreed with each other. One place said "no tasks", another said "1 task" and showed a very long carried-over note at full length, and the vacation and study days were not in "My day" at all. Shivam wants everything at a glance, each row able to open to its subtasks, with the split by source kept as a card at the bottom.

**Where:** Home (`home.html`) and Tasks > Today (`tasks.html#today`). Code: `tasks-all.js` and `tasks-all.css` (new: the one list and the Task lists card), `tasks-today.js` (own tasks, calendar, add and remove), `day-core.js` and `tasks.js` (Claude's tasks now carry description and steps), `home.js`, `home.css`. Supersedes the Home order and the filter chips in PLN-004 (criteria 1 and 4).

**Acceptance criteria**
1. One list holds every task for today: yours, Claude's, today's study day, today's vacation day, and calendar events. The count on the top tile, the list header, the Tasks ring and the Task lists card all agree. Events are shown but not counted as tasks.
2. Order: happening now, timed, carried over, yours, Claude, study, vacation, past, done. A ticked task sinks to the bottom and stays counted as done for today, including an older task ticked today.
3. Every row opens: study and vacation days to their subtasks (with times, ticks saved), Claude tasks to description, steps and a link to the Board, your tasks to their full text and Remove with Undo. Closed rows show at most two lines.
4. Task lists card at the bottom of Home and on the Tasks tab: Mine, Claude, Study, Vacation week, Calendar, each with its count. Tapping one filters the list and says so; tapping it again, or Show all, clears it.
5. Add box has an outline, a date (today by default, a later date goes under Coming up) and a 15-minute time stepper with a clear button. An empty title is not added.
6. Next up names what comes after it and never shows more than three lines of a long note.
7. Study ticks are saved in the day document and never counted as yours. Vacation ticks are saved in the vacation plan.
8. No new table, key or server change. No horizontal scroll from 360 px to 1920 px; dark and light; no console errors.

**Verification evidence** (browser runs against a copy of the database; his real day and vacation documents were loaded for the main run)
- `t22_tasks`: 55 checks, Home on his real data (six or seven rows in order, counts agree, long note clipped, vacation and study ticks saved and kept after reload, Claude row details, tick, remove and undo, filter, add with date and time stepper, calendar events, family day, empty day, after the vacation week, 360 / 390 / 800 / 1440 widths, both themes) and the Tasks tab parity.
- Older suites rewritten for the new list: `t16` (71), `t17` (49), `t18` (61), `t21_vwk` (22).

**Not verified:** the live GitHub Pages site after deploy; a real iPhone or Galaxy Tab. Reopen the app once to pick up the new offline cache (`realtor-os-v22`).

## PLN-008: Five pillars on the dashboard

**Why:** Shivam's goals for next year are five pillars: (1) the commercial licence, (2) a proper prospecting set-up, (3) communication (he talks too much, does not know when to end a conversation), (4) an ongoing project of improving this app, (5) physical and mental health. The dashboard should show them, with work for this week, until the licence course is approved.

**Where:** Home (`home.html`, Five pillars card `#hmPillars`) and Tasks > Today (`tasks.html#today`). Code: `pillars-data.js` (new: the pillars, week plans, habits, rules, closing lines, word budgets), `tasks-all.js` and `tasks-all.css` (the Pillar habits row, the Five pillars card, steps under your tasks), `tasks-today.js` (`flag(id, val, title, kind)`, `addSub`, `toggleSub`, `removeSub`), `day-core.js` and `tasks.js` (plan items carry `tag` and `role`), `home.js`, `home.css`.

**Acceptance criteria**
1. Home has a Five pillars card: five rows in order, each opening to its why, this week's work and today's habits. The licence row says Waiting for course approval and On hold.
2. Today has one Pillar habits row (after Claude's tasks), grouped by pillar. Habit ticks are saved in the `today` document as entries with `k:"pl"`. They never count as your tasks and the same habit shows on the row and the card with one state.
3. Until "I'm approved" is tapped, the study day and Claude's study tasks (plan tag STUDY) are paused, not deleted. The Study list says Paused with why, and the vacation card says On hold. Approving brings them back. The approval flag is never cleaned up by the 45-day rule. Undo works.
4. Communication: three rules, five ways to end a conversation, a Stop test (Short, Close, Over; one score a day; a 7-day strip) and a Word check (Text 40, Email 90, Voice note 75, counted live, typing never interrupted).
5. Your own tasks take steps: type, Enter. Steps tick on their own, show as n/m on the row, and sync with the task (newest edit wins). A half-typed step survives a redraw.
6. Prospecting shows the yearly target (20 deals x $15,000 = $300,000) and asks for the two conversion numbers. Weekly counts are not guessed.
7. A paint that would change nothing (a save finishing) is skipped, so a tap in flight is not lost.
8. No new table or key. Nothing guessed: builder-run stops are labelled to confirm on site.

**Open:** the two conversion numbers (conversations per appointment, appointments per deal); the approval date so the study dates can be reset; whether a Take supplements reminder exists.

**Verification evidence** (browser runs against a copy of the database; his real day, vacation and Board documents were loaded)
- `t23_pillars`: 61 checks. Five pillars card, licence On hold and approved (including the 45-day clean-up), paused study day and study tasks, Pillar habits row and ticks (saved as `k:"pl"`, not counted as tasks, one state on row and card), Stop test, Word check (typing not interrupted), steps under your tasks (Enter, drafts survive a redraw), a 10-stop builder-run task, next-day reset, filter, Tasks page, 360 px / laptop / light theme, 44 px buttons, the pillars file missing.
- Older suites updated for the new row and the licence state: `t17` (49), `t21_vwk` (22), `t22_tasks` (55). The rest of the 19 suites pass unchanged.
- Found and fixed while testing: a save finishing redrew the card and wiped a half-typed step; a redraw that changes nothing is now skipped.

**Not verified:** the live GitHub Pages site after deploy; a real iPhone or Galaxy Tab. Reopen the app once to pick up the new offline cache (`realtor-os-v23`).

## PLN-009: Clients: Leads on top, slim Due list, action modal

**Why:** The Clients page was too big for the people due (each was a tall card with the phone line and four buttons). Shivam wants a Leads section first, then a concise Due section showing only name, type of lead and status, and a modal opened by tapping a row where he does what he wants.

**Where:** Clients (`index.html#today`). Code: `app.js` (`isLead`, `leadList`, `crow`, `leadsSection`, `dueShort`, `openAct`, `refreshAct`, `saveActContact`, the click and keydown handlers), `app.css` (block "Clients: Leads and Due as slim rows, and the action modal"). `sw.js` cache `realtor-os-v24`.

**Definition used (his to change):** a lead is a contact with relationship Lead whose stage is not Nurture, Past client, Dead, Closed or Under contract. New and newest first. A lead that is also due appears in both lists; the due list, its order and its count are unchanged, so Home's Reach card and the Clients badge still agree.

**Acceptance criteria**
1. Order on Clients: Leads, Due today, then Moments and Your numbers. On a laptop the numbers panel stays beside the list.
2. Leads show 5, with Show all N leads and Show fewer. Each row: name, type (or No type), status, a New tag for untouched leads, or how late it is.
3. Due rows are slim (about 58 px, was about 150), show name, type, status and when due, and have no inline buttons.
4. Tapping a row opens a dialog named after the person. Escape, Close or tapping outside closes it. Focus moves into it.
5. In the modal: Copy / Call / WhatsApp / Email when saved; Talked, Messaged, No answer, Later (log, move the next date, close); a note (Enter saves, history updated); a missing phone or email can be added (phone needs 10 digits, email must look like one, nothing is saved if either is wrong, contact tags added); Buyer / Seller / Investor chips only when no type; Open full profile.
6. A half-typed note is not wiped by a save redrawing the modal.
7. No sideways scroll at 360 / 390 / 768 / 1440, both themes, controls at least 44 px on the rows and 34 px in the modal.

**Verification evidence** (browser runs against a copy of the database; the 811 real contacts were loaded)
- `t24_clients`: 44 checks covering all of the above.
- Older suites that assumed the tall cards were updated: `t14` (section order) and `t15` (tablet: one column, not two across). The other 17 suites pass unchanged (t12, t12b, t13, t16, t17, t18, t19a-h, t21_vwk, t22_tasks, t23_pillars).

**Not verified:** the live GitHub Pages site after deploy; a real iPhone or Galaxy Tab. Reopen the app once to pick up the new offline cache (`realtor-os-v24`).
