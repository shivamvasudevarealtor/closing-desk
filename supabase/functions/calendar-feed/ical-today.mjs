// Pure logic for the calendar-feed function: given the text of an iCloud .ics feed, return the events that fall on one day
// in the America/Edmonton time zone. The ICAL library is passed in so the same code runs in Deno (npm:ical.js) and in tests.

const TZ = "America/Edmonton";
const pad = (n) => String(n).padStart(2, "0");

function offsetMs(ms, tz) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}
/** The instant (ms) when the wall clock in tz reads y-m-d h:mi. */
export function zonedMs(y, m, d, h, mi, tz = TZ) {
  const guess = Date.UTC(y, m - 1, d, h, mi, 0);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}
function hhmm(ms, tz = TZ) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("hour")}:${g("minute")}`;
}
function addDay(date, k) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const dstr = (t) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

export function eventsForDay(ICAL, text, date, tz = TZ, limit = 100) {
  ICAL.TimezoneService.reset();
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents("vtimezone").forEach((vt) => ICAL.TimezoneService.register(vt));
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = zonedMs(y, m, d, 0, 0, tz);
  const dayEnd = zonedMs(...addDay(date, 1).split("-").map(Number), 0, 0, tz);
  const next = addDay(date, 1);

  /* Wall-clock time of a floating value is read as Edmonton time; zoned and UTC values carry their own offset. */
  function toMs(t) {
    if (t.zone && t.zone !== ICAL.Timezone.localTimezone) return t.toUnixTime() * 1000;
    return zonedMs(t.year, t.month, t.day, t.hour, t.minute, tz);
  }

  const masters = new Map(), exceptions = new Map();
  root.getAllSubcomponents("vevent").forEach((c) => {
    const uid = c.getFirstPropertyValue("uid") || Math.random().toString(36);
    if (c.hasProperty("recurrence-id")) { (exceptions.get(uid) || exceptions.set(uid, []).get(uid)).push(c); }
    else if (!masters.has(uid)) masters.set(uid, c);
  });

  const out = [], seen = new Set();
  function add(item, start, end) {
    if (String(item.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") return;
    const allDay = start.isDate;
    let sMs, eMs, sT, eT;
    if (allDay) {
      const s = dstr(start), e = end ? dstr(end) : addDay(s, 1);
      if (!(s <= date && date < (e > s ? e : addDay(s, 1)))) return;
      sMs = dayStart; eMs = dayEnd; sT = null; eT = null;
    } else {
      sMs = toMs(start); eMs = end ? toMs(end) : sMs;
      if (eMs <= sMs) eMs = sMs; // zero length
      if (!(sMs < dayEnd && (eMs > dayStart || (eMs === sMs && sMs >= dayStart)))) return;
      sT = hhmm(Math.max(sMs, dayStart), tz); eT = eMs > sMs ? hhmm(Math.min(eMs, dayEnd - 60000), tz) : "";
    }
    const uid = item.getFirstPropertyValue("uid") || "";
    const key = uid + "|" + (allDay ? dstr(start) : sMs);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: uid + "@" + (allDay ? date : sMs),
      title: String(item.getFirstPropertyValue("summary") || "(No title)").slice(0, 200),
      allDay, start: sT, end: eT,
      startMs: allDay ? dayStart : Math.max(sMs, dayStart), endMs: allDay ? dayEnd : Math.min(eMs, dayEnd),
      location: String(item.getFirstPropertyValue("location") || "").slice(0, 200),
    });
  }

  masters.forEach((comp, uid) => {
    let ev;
    try { ev = new ICAL.Event(comp); (exceptions.get(uid) || []).forEach((x) => ev.relateException(new ICAL.Event(x))); }
    catch (_e) { return; }
    if (!ev.isRecurring()) { add(comp, ev.startDate, ev.endDate); return; }
    const it = ev.iterator();
    let n = 0, nx;
    while ((nx = it.next()) && n++ < 20000) {
      const det = ev.getOccurrenceDetails(nx);
      const s = det.startDate;
      const startsAfter = s.isDate ? dstr(s) >= next : toMs(s) >= dayEnd;
      if (startsAfter) break;
      add(det.item.component || comp, s, det.endDate);
    }
  });
  /* A moved occurrence can sit on this day while its original slot is on another. */
  exceptions.forEach((list) => list.forEach((c) => { const e = new ICAL.Event(c); add(c, e.startDate, e.endDate); }));

  out.sort((a, b) => (a.allDay === b.allDay ? a.startMs - b.startMs : a.allDay ? -1 : 1));
  return out.slice(0, limit);
}
