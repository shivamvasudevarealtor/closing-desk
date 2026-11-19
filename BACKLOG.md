# Closing Desk backlog

This is the one place that tracks status for planned work. Do not copy status into other files.
Status moves to **Review** only after the checks below pass, and to **Done** only after Shivam confirms.

| ID | Story | Module | Priority | Milestone | Status |
|---|---|---|---|---|---|
| PLN-001 | Vacation week plan workspace | Closing Desk / Vacation week | P0 | Vacation week | Review |
| PLN-002 | Simplify the Dashboard | Closing Desk / Dashboard | P1 | Vacation week | Review |

## PLN-001: Vacation week plan workspace

**Why:** The Nov 18 to 29, 2026 vacation plan (12 days, 114 subtasks) must be easy to see and tick off, in one place, without touching Closing Desk contacts.

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
11. Existing Closing Desk pages, contacts, settings and follow-ups are unchanged.

**Verification evidence (automated browser run, `t16`, 70 checks, 0 failed)**
- Board: 12 columns, 12 parent cards, 114 subtasks (counted in the page).
- Tick persists after reload and after clearing this device's copy (restored from the saved document). Week progress and day progress update.
- Seeding again: "Nothing to add", 12 parents and 114 subtasks, tick and note kept. Two rows deleted on purpose came back, no duplicates, tick kept.
- Next up at a mocked Edmonton time: Sat Nov 21 7:00 AM gives the workout; 7:15 AM gives Time with your son; ticking the workout at 7:00 AM moves it to Time with your son. Thu Nov 19 11:30 PM Edmonton shows Thu Nov 19 even with the browser set to UTC.
- Nov 27: family label, dashed card, no progress bar, week total is 113 not 114, ticking its item does not change progress, no "not done" on it.
- Existing data: contacts 811 before and 811 after with identical content, settings identical, the only new database row is `os_docs` id `vacation`, no write to any other table.
- Phone 390 and 360 px: no sideways page scroll on Today, Board or List; bottom bar shows all 6 items and stays fixed.
- Keyboard: Tab shows a 3 px outline on buttons and checkboxes; Space ticks the focused checkbox.

**Not verified:** on a real iPhone or the real Galaxy Tab; against the live database (the first real seed happens when Shivam opens the page).

## PLN-002: Simplify the Dashboard

**Acceptance criteria:** four go-to buttons at the top (phone and tablet), two headline cards (reached, today), today's vacation plan, everything else under a collapsed "More detail", no repeated "Live" chips.

**Verification evidence:** screenshots at 390, 800 and 1440 px; no script errors; the vacation card matches the Board card (t16 K6, K7).
