-- Veloci Global Markets — in-house support chat (phase 1: logged-in users only)
--
-- One conversation per user. Messages are immutable. Unread counters are kept
-- by a trigger so neither side can write them directly.

-- ── admin check ──────────────────────────────────────────────────────────────
-- Lives in a private schema and is SECURITY DEFINER so it can read admin_users
-- (which has RLS) without granting anyone visibility into that table. It only
-- ever reports on the caller, never on an arbitrary user.
create schema if not exists private;

create or replace function private.is_support_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where id = (select auth.uid())
  );
$$;

revoke execute on function private.is_support_admin() from public, anon;
grant  execute on function private.is_support_admin() to authenticated;
grant  usage   on schema private to authenticated;

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  status          text not null default 'open' check (status in ('open','closed')),
  last_message    text,
  last_sender     text check (last_sender in ('user','admin')),
  last_message_at timestamptz not null default now(),
  unread_admin    integer not null default 0 check (unread_admin >= 0),
  unread_user     integer not null default 0 check (unread_user  >= 0),
  created_at      timestamptz not null default now()
);

-- ops inbox orders by recency; user_id already has an index from the unique constraint
create index if not exists chat_conversations_last_message_at_idx
  on public.chat_conversations (last_message_at desc);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender          text not null check (sender in ('user','admin')),
  sender_id       uuid,
  sender_name     text,
  body            text not null check (btrim(body) <> '' and length(body) <= 4000),
  created_at      timestamptz not null default now()
);

-- serves both the thread query and the foreign key
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

-- ── counters, maintained server-side ─────────────────────────────────────────
create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
     set last_message    = left(new.body, 200),
         last_sender     = new.sender,
         last_message_at = new.created_at,
         status          = 'open',
         unread_admin    = case when new.sender = 'user'  then unread_admin + 1 else unread_admin end,
         unread_user     = case when new.sender = 'admin' then unread_user  + 1 else unread_user  end
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_after_insert on public.chat_messages;
create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_on_message();

-- ── rpc ──────────────────────────────────────────────────────────────────────
-- The widget calls this instead of inserting conversations itself.
create or replace function public.chat_my_conversation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select id into v_id from public.chat_conversations where user_id = v_uid;
  if v_id is null then
    insert into public.chat_conversations (user_id) values (v_uid) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Clears the caller's own side of the unread counter only.
create or replace function public.chat_mark_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.chat_conversations where id = p_conversation;
  if v_owner is null then
    return;
  end if;
  if private.is_support_admin() then
    update public.chat_conversations set unread_admin = 0 where id = p_conversation;
  elsif v_owner = (select auth.uid()) then
    update public.chat_conversations set unread_user = 0 where id = p_conversation;
  end if;
end;
$$;

revoke execute on function public.chat_my_conversation()      from public, anon;
revoke execute on function public.chat_mark_read(uuid)        from public, anon;
grant  execute on function public.chat_my_conversation()      to authenticated;
grant  execute on function public.chat_mark_read(uuid)        to authenticated;

-- ── row level security ───────────────────────────────────────────────────────
alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_support_admin())
  );

-- Only support may close/reopen a thread; users never write this table directly.
drop policy if exists chat_conversations_admin_update on public.chat_conversations;
create policy chat_conversations_admin_update on public.chat_conversations
  for update to authenticated
  using      ((select private.is_support_admin()))
  with check ((select private.is_support_admin()));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    (select private.is_support_admin())
    or exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- A user may only post as themselves, into their own conversation.
drop policy if exists chat_messages_insert_user on public.chat_messages;
create policy chat_messages_insert_user on public.chat_messages
  for insert to authenticated
  with check (
    sender = 'user'
    and sender_id = (select auth.uid())
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists chat_messages_insert_admin on public.chat_messages;
create policy chat_messages_insert_admin on public.chat_messages
  for insert to authenticated
  with check (
    sender = 'admin'
    and (select private.is_support_admin())
  );

-- No update or delete policies: messages are an immutable log.

grant select         on public.chat_conversations to authenticated;
grant update         on public.chat_conversations to authenticated;  -- gated to admins by policy
grant select, insert on public.chat_messages      to authenticated;

-- ── realtime ─────────────────────────────────────────────────────────────────
alter table public.chat_conversations replica identity full;
alter table public.chat_messages      replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='chat_conversations') then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;
