-- Closing Desk database. Paste this whole file into Supabase > SQL Editor > New query > Run. Safe to run once on a new project.
-- Two tables hold one JSON document per row, so the contact fields can grow without changing the database.
-- Row-level security means only the signed-in owner can read or write their own rows. The public anon key alone can read nothing.

create table if not exists public.contacts (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.settings (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_owner_idx on public.contacts (owner);

alter table public.contacts enable row level security;
alter table public.settings enable row level security;

drop policy if exists "owner full access" on public.contacts;
create policy "owner full access" on public.contacts
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

drop policy if exists "owner full access" on public.settings;
create policy "owner full access" on public.settings
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

-- Nothing for the public (not signed in) role.
revoke all on public.contacts from anon;
revoke all on public.settings from anon;

-- Keep updated_at honest on every change.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Merge a few fields into one contact (so two devices editing different fields do not overwrite each other).
-- Runs as the caller, so row-level security still applies. Returns the merged contact, or null if it does not exist.
create or replace function public.patch_contact(p_id text, p_fields jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  update public.contacts
     set data = data || p_fields
   where id = p_id
  returning data;
$$;

revoke all on function public.patch_contact(text, jsonb) from public, anon;
grant execute on function public.patch_contact(text, jsonb) to authenticated;

-- Same, for many contacts in one request. p_items looks like [{"id": "c0001", "fields": {"next": "2026-11-24"}}, ...]
create or replace function public.patch_contacts(p_items jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with changed as (
    update public.contacts c
       set data = c.data || (i.value -> 'fields')
      from jsonb_array_elements(p_items) as i(value)
     where c.id = i.value ->> 'id'
    returning 1
  )
  select count(*)::integer from changed;
$$;

revoke all on function public.patch_contacts(jsonb) from public, anon;
grant execute on function public.patch_contacts(jsonb) to authenticated;

-- Live sync between your phone and your laptop.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts') then
    alter publication supabase_realtime add table public.contacts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;
