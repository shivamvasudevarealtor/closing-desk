// Supabase Edge Function: calendar-feed
// Reads Shivam's iCloud "Public Calendar" link and returns the events for ONE day (America/Edmonton).
// It is read only: it never writes to the database and never stores the link. Deploy with JWT verification ON,
// so only the signed-in Closing Desk user can call it.
//
// Body: { "url": "webcal://p12-caldav.icloud.com/published/2/...", "date": "2026-11-19" }
// Reply: { "events": [{ id, title, allDay, start, end, startMs, endMs, location }], "fetchedAt": "ISO time" }
// Errors: { "error": "bad_url" | "bad_date" | "fetch_failed" | "not_calendar" | "too_big" | "parse_failed" }
import ICAL from "npm:ical.js@1.5.0";
import { eventsForDay } from "./ical-today.mjs";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://shivamvasudevarealtor.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const MAX_BYTES = 5_000_000;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}
/** Only iCloud calendar hosts over https. webcal:// is the same address as https://. */
function cleanUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!/^([a-z0-9-]+\.)*icloud\.com$/i.test(u.hostname)) return null;
  return u;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "bad_request" });
  let body: { url?: unknown; date?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: "bad_request" }); }
  let u = cleanUrl(body.url);
  if (!u) return reply(400, { error: "bad_url" });
  const date = typeof body.date === "string" ? body.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(400, { error: "bad_date" });

  let text = "";
  try {
    // Follow at most 3 redirects, and only to other iCloud hosts.
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(u.toString(), { redirect: "manual", headers: { accept: "text/calendar, */*", "user-agent": "ClosingDesk/1.0" }, signal: AbortSignal.timeout(8000) });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        const nu = loc ? cleanUrl(new URL(loc, u).toString()) : null;
        if (!nu) return reply(502, { error: "fetch_failed" });
        u = nu; continue;
      }
      if (!res.ok) return reply(502, { error: "fetch_failed", status: res.status });
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) return reply(413, { error: "too_big" });
      text = await res.text();
      break;
    }
  } catch { return reply(502, { error: "fetch_failed" }); }
  if (text.length > MAX_BYTES) return reply(413, { error: "too_big" });
  if (!/BEGIN:VCALENDAR/i.test(text)) return reply(422, { error: "not_calendar" });

  try {
    const events = eventsForDay(ICAL, text, date);
    return reply(200, { events, fetchedAt: new Date().toISOString() });
  } catch { return reply(422, { error: "parse_failed" }); }
});
