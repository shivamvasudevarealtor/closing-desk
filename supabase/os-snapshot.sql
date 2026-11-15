-- Closing Desk numbers for the Daily 3 Tasks page. READ-ONLY: this only selects, it changes nothing.
-- Claude runs it (Supabase SQL) on a schedule and copies the one result row into the Daily 3 page.
-- It is the same definition as osStats() in app.js (the Reached card on Today). Keep the two in step.
--   reached   = a contact (not Dead) with at least one log entry that starts with Talked, Sent a message, Call:, Text:,
--               WhatsApp:, Email:, Meeting:, "Mass email: ", Birthday wishes, Family birthday or Home anniversary.
--               "No answer", "Note:" and "Added" do not count.
--   touchesToday = today's log entries that start with Talked, Sent a message, No answer, Call:, Text:, WhatsApp: or Meeting:
--   emailsToday  = today's log entries that start with "Mass email: " (a rejected one starts "Mass email rejected" and is not counted)
-- "today" is Edmonton time.
with p as (
  select (now() at time zone 'America/Edmonton')::date::text as today
), st as (
  select coalesce((select data from public.settings where id = 'main' limit 1), '{}'::jsonb) as d
), c as (
  select data from public.contacts where coalesce(data ->> 'stage', '') <> 'Dead'
), ev as (
  select e ->> 't' as t, e ->> 'd' as d
  from c, jsonb_array_elements(case when jsonb_typeof(c.data -> 'log') = 'array' then c.data -> 'log' else '[]'::jsonb end) as e
), n as (
  select
    (select count(*) from c)::int as contacts,
    (select count(*) from c where exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(c.data -> 'log') = 'array' then c.data -> 'log' else '[]'::jsonb end) as e
        where coalesce(e ->> 't', '') ~ '^(Talked|Sent a message|Call:|Text:|WhatsApp:|Email:|Meeting:|Mass email: |Birthday wishes|Family birthday|Home anniversary)'
    ))::int as reached,
    (select count(*) from c where coalesce(data ->> 'email', '') <> '')::int as with_email,
    (select count(*) from c where coalesce(data ->> 'phone', '') <> '')::int as with_phone,
    (select count(*) from c where coalesce(data ->> 'consent', '') <> '')::int as consented,
    (select count(*) from c, p where coalesce(data ->> 'next', '') <> '' and data ->> 'next' <= p.today)::int as due_today,
    (select count(*) from ev, p where ev.d = p.today and coalesce(ev.t, '') ~ '^(Talked|Sent a message|No answer|Call:|Text:|WhatsApp:|Meeting:)')::int as touches_today,
    (select count(*) from ev, p where ev.d = p.today and coalesce(ev.t, '') ~ '^Mass email: ')::int as emails_today
)
select jsonb_build_object(
  'asOf', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'contacts', n.contacts,
  'reached', n.reached,
  'left', n.contacts - n.reached,
  'pct', case when n.contacts = 0 then 0 else round(100.0 * n.reached / n.contacts)::int end,
  'withEmail', n.with_email,
  'withPhone', n.with_phone,
  'consented', n.consented,
  'touchesToday', n.touches_today,
  'emailsToday', n.emails_today,
  'dueToday', n.due_today,
  'goalYear', coalesce((st.d ->> 'goalYear')::int, 2027),
  'dealsListings', (select count(*) from jsonb_array_elements(coalesce(st.d -> 'deals', '[]'::jsonb)) x
                    where x ->> 'type' = 'listing' and left(coalesce(x ->> 'date', ''), 4) = coalesce(st.d ->> 'goalYear', '2027'))::int,
  'dealsBuyers', (select count(*) from jsonb_array_elements(coalesce(st.d -> 'deals', '[]'::jsonb)) x
                  where x ->> 'type' = 'buyer' and left(coalesce(x ->> 'date', ''), 4) = coalesce(st.d ->> 'goalYear', '2027'))::int,
  'goalListings', coalesce((st.d ->> 'listingsGoal')::int, 20),
  'goalBuyers', coalesce((st.d ->> 'buyersGoal')::int, 30)
) as snapshot
from n, st;
