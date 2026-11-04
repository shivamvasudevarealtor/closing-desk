-- Closing Desk: Tell Claude (v1.6). Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- Three tables with the same shape as contacts: one JSON document per row, only the signed-in owner can read or write.
--   inbox    : every note you send to Claude, its suggestions and what you applied
--   tasks    : to-dos created from notes
--   requests : ideas for your workspace, picked up into the Build Roadmap by Claude Code

do $$
declare t text;
begin
  foreach t in array array['inbox', 'tasks', 'requests'] loop
    execute format('create table if not exists public.%I (
      id          text primary key,
      owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
      data        jsonb not null default ''{}''::jsonb,
      updated_at  timestamptz not null default now())', t);
    execute format('create index if not exists %I on public.%I (owner, updated_at desc)', t || '_owner_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
