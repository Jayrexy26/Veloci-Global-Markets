-- Veloci Global Markets — live visitor presence
--
-- Every visitor, signed in or not, pings a definer function on a heartbeat.
-- The table itself has no grants at all: anonymous visitors cannot read, write
-- or delete it directly, which matters because it holds other people's browsing
-- location. Only support can read it back.

create table if not exists public.visitor_sessions (
  id           uuid primary key default gen_random_uuid(),
  visitor_key  uuid not null unique,     -- random per-browser id, acts as a bearer token
  user_id      uuid references auth.users(id) on delete set null,
  page         text,
  country      text,
  city         text,
  device       text,
  os           text,
  browser      text,
  referrer     text,
  page_views   integer not null default 1,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists visitor_sessions_last_seen_idx on public.visitor_sessions (last_seen_at desc);
create index if not exists visitor_sessions_user_id_idx   on public.visitor_sessions (user_id);

alter table public.visitor_sessions enable row level security;

drop policy if exists visitor_sessions_admin_read on public.visitor_sessions;
create policy visitor_sessions_admin_read on public.visitor_sessions
  for select to authenticated
  using ((select private.is_support_admin()));

revoke all on public.visitor_sessions from anon, authenticated;
grant select on public.visitor_sessions to authenticated;   -- gated to admins by policy

-- ── heartbeat ────────────────────────────────────────────────────────────────
create or replace function public.visitor_ping(
  p_key      uuid,
  p_page     text default null,
  p_country  text default null,
  p_city     text default null,
  p_device   text default null,
  p_os       text default null,
  p_browser  text default null,
  p_referrer text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if p_key is null then
    return;
  end if;

  insert into public.visitor_sessions
    (visitor_key, user_id, page, country, city, device, os, browser, referrer)
  values
    (p_key, v_uid, left(p_page,200), left(p_country,2), left(p_city,80),
     left(p_device,20), left(p_os,40), left(p_browser,40), left(p_referrer,200))
  on conflict (visitor_key) do update
    set last_seen_at = now(),
        user_id      = coalesce(v_uid, public.visitor_sessions.user_id),
        page         = coalesce(nullif(left(p_page,200), ''), public.visitor_sessions.page),
        country      = coalesce(nullif(left(p_country,2), ''), public.visitor_sessions.country),
        city         = coalesce(nullif(left(p_city,80), ''),   public.visitor_sessions.city),
        device       = coalesce(nullif(left(p_device,20), ''), public.visitor_sessions.device),
        os           = coalesce(nullif(left(p_os,40), ''),     public.visitor_sessions.os),
        browser      = coalesce(nullif(left(p_browser,40), ''),public.visitor_sessions.browser),
        page_views   = public.visitor_sessions.page_views
                       + case when nullif(left(p_page,200),'') is distinct from public.visitor_sessions.page
                              then 1 else 0 end;

  /* Opportunistic sweep so the table cannot grow without bound. Runs rarely
     rather than on every heartbeat. */
  if random() < 0.02 then
    delete from public.visitor_sessions where last_seen_at < now() - interval '1 hour';
  end if;
end;
$$;

revoke execute on function public.visitor_ping(uuid,text,text,text,text,text,text,text) from public;
grant  execute on function public.visitor_ping(uuid,text,text,text,text,text,text,text) to anon, authenticated;

-- ── leaving the site ─────────────────────────────────────────────────────────
create or replace function public.visitor_leave(p_key uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.visitor_sessions where visitor_key = p_key;
$$;

revoke execute on function public.visitor_leave(uuid) from public;
grant  execute on function public.visitor_leave(uuid) to anon, authenticated;

-- ops needs live inserts and updates
alter table public.visitor_sessions replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='visitor_sessions') then
    alter publication supabase_realtime add table public.visitor_sessions;
  end if;
end $$;

insert into public.system_settings (key, value, updated_at)
values ('visitor_alerts_enabled','true', now())
on conflict (key) do nothing;
