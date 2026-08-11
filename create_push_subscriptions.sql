-- Veloci Global Markets — Web Push subscriptions for ops admins
--
-- Lets support get a phone notification when a user writes in while the ops
-- console is fully closed, which realtime cannot do because no page is running.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_admin_id_idx
  on public.push_subscriptions (admin_id);

alter table public.push_subscriptions enable row level security;

-- Only admins register, and only for themselves.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (admin_id = (select auth.uid()) and (select private.is_support_admin()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (admin_id = (select auth.uid()) and (select private.is_support_admin()));

-- re-registering the same device upserts on the unique endpoint
drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using      (admin_id = (select auth.uid()) and (select private.is_support_admin()))
  with check (admin_id = (select auth.uid()) and (select private.is_support_admin()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (admin_id = (select auth.uid()) and (select private.is_support_admin()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ── fire the push sender when a user writes ──────────────────────────────────
-- pg_net posts asynchronously, so a slow push service can never delay or fail
-- the customer's message insert.
create or replace function public.chat_notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url   text := private.chat_setting('push_function_url', '');
  v_key   text := private.chat_setting('push_function_key', '');
  v_name  text;
begin
  if new.sender <> 'user' or v_url = '' then
    return new;
  end if;

  select coalesce(c.visitor_name, 'A user') into v_name
    from public.chat_conversations c where c.id = new.conversation_id;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'conversation_id', new.conversation_id,
                 'sender_name',     v_name,
                 'preview',         case
                                      when btrim(new.body) <> '' then left(new.body, 120)
                                      else 'Sent an attachment'
                                    end
               ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

drop trigger if exists chat_messages_push on public.chat_messages;
create trigger chat_messages_push
  after insert on public.chat_messages
  for each row execute function public.chat_notify_push();
