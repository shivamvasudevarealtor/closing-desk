-- Closing Desk email: unsubscribe link support. Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- Each contact gets a random 32-character token the first time it is emailed. The unsubscribe page sends only that token.
-- This function is the ONLY thing the public (not signed in) can do: it marks the one contact that owns the token as unsubscribed.
-- It cannot read anything, and a guessed token is useless (128 random bits).

create index if not exists contacts_utoken_idx on public.contacts ((data ->> 'utoken'));

create or replace function public.unsubscribe_contact(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return false;
  end if;
  update public.contacts
     set data = data || jsonb_build_object(
           'unsub', true,
           'unsubAt', case when data ->> 'unsub' = 'true' then data ->> 'unsubAt'
                           else to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
           'log', case when data ->> 'unsub' = 'true' then coalesce(data -> 'log', '[]'::jsonb)
                       else jsonb_build_array(jsonb_build_object(
                              'd', to_char(now() at time zone 'America/Edmonton', 'YYYY-MM-DD'),
                              't', 'Unsubscribed from email (link)')) || coalesce(data -> 'log', '[]'::jsonb) end)
   where data ->> 'utoken' = p_token;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.unsubscribe_contact(text) from public;
grant execute on function public.unsubscribe_contact(text) to anon, authenticated;
