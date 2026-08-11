-- Veloci Global Markets — pre-chat form, auto messages, online/offline status
--
-- Settings used (public.system_settings):
--   chat_status            online | offline
--   chat_prechat_enabled   true | false   require the form before chatting
--   chat_welcome_enabled   true | false
--   chat_welcome_message   text, sent once per conversation
--   chat_offline_enabled   true | false
--   chat_offline_message   text, auto-reply when a user writes while offline

alter table public.chat_conversations
  add column if not exists visitor_name       text,
  add column if not exists visitor_phone      text,
  add column if not exists visitor_email      text,
  add column if not exists prechat_at         timestamptz,
  add column if not exists welcome_sent_at    timestamptz,
  add column if not exists last_auto_reply_at timestamptz;

-- ── helper: read a setting without tripping over RLS ─────────────────────────
create or replace function private.chat_setting(p_key text, p_default text default '')
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(nullif((select value from public.system_settings where key = p_key), ''), p_default);
$$;

revoke execute on function private.chat_setting(text, text) from public, anon;
grant  execute on function private.chat_setting(text, text) to authenticated;

-- ── post an automatic support message ────────────────────────────────────────
create or replace function private.chat_post_auto(p_conversation uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_body), '') = '' then
    return;
  end if;
  insert into public.chat_messages (conversation_id, sender, sender_name, body)
  values (p_conversation, 'admin', 'Veloci Support', left(p_body, 4000));
end;
$$;

revoke execute on function private.chat_post_auto(uuid, text) from public, anon, authenticated;

-- ── pre-chat form submission ─────────────────────────────────────────────────
create or replace function public.chat_submit_prechat(p_name text, p_phone text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_sent  timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if length(v_name) < 2 then
    raise exception 'Please enter your name';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please enter a valid email address';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then
    raise exception 'Please enter a valid phone number';
  end if;

  select id into v_id from public.chat_conversations where user_id = v_uid;
  if v_id is null then
    insert into public.chat_conversations (user_id) values (v_uid) returning id into v_id;
  end if;

  update public.chat_conversations
     set visitor_name  = left(v_name, 120),
         visitor_phone = left(v_phone, 40),
         visitor_email = left(v_email, 160),
         prechat_at    = coalesce(prechat_at, now())
   where id = v_id
   returning welcome_sent_at into v_sent;

  -- greet once, immediately after the form
  if v_sent is null and private.chat_setting('chat_welcome_enabled', 'true') = 'true' then
    update public.chat_conversations set welcome_sent_at = now() where id = v_id;
    perform private.chat_post_auto(
      v_id,
      private.chat_setting('chat_welcome_message',
        'Hi there, thanks for reaching out to Veloci Global Markets. How can we help you today?')
    );
    -- a greeting is not something support needs to answer
    update public.chat_conversations set unread_admin = 0 where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.chat_submit_prechat(text, text, text) from public, anon;
grant  execute on function public.chat_submit_prechat(text, text, text) to authenticated;

-- ── counters + auto replies ──────────────────────────────────────────────────
create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_welcome_sent timestamptz;
  v_last_auto    timestamptz;
begin
  update public.chat_conversations
     set last_message = case
           when btrim(new.body) <> '' then left(new.body, 200)
           else coalesce('[file] ' || new.attachment_name, '[file] Attachment')
         end,
         last_sender     = new.sender,
         last_message_at = new.created_at,
         status          = 'open',
         unread_admin    = case when new.sender = 'user'  then unread_admin + 1 else unread_admin end,
         unread_user     = case when new.sender = 'admin' then unread_user  + 1 else unread_user  end
   where id = new.conversation_id
   returning welcome_sent_at, last_auto_reply_at into v_welcome_sent, v_last_auto;

  /* Only a real user message can trigger an automatic reply. The messages we
     post below are sender='admin', so this cannot recurse. */
  if new.sender = 'user' then

    -- greeting, for the case where the pre-chat form is switched off
    if v_welcome_sent is null and private.chat_setting('chat_welcome_enabled', 'true') = 'true' then
      update public.chat_conversations set welcome_sent_at = now() where id = new.conversation_id;
      perform private.chat_post_auto(
        new.conversation_id,
        private.chat_setting('chat_welcome_message',
          'Hi there, thanks for reaching out to Veloci Global Markets. How can we help you today?')
      );
    end if;

    -- away notice, at most once every 10 minutes per conversation
    if private.chat_setting('chat_status', 'online') = 'offline'
       and private.chat_setting('chat_offline_enabled', 'true') = 'true'
       and (v_last_auto is null or v_last_auto < now() - interval '10 minutes')
    then
      update public.chat_conversations set last_auto_reply_at = now() where id = new.conversation_id;
      perform private.chat_post_auto(
        new.conversation_id,
        private.chat_setting('chat_offline_message',
          'Our team is offline right now. Leave your message here and we will reply as soon as we are back.')
      );
    end if;
  end if;

  return new;
end;
$$;

-- ── defaults ─────────────────────────────────────────────────────────────────
insert into public.system_settings (key, value, updated_at) values
  ('chat_status',          'online', now()),
  ('chat_prechat_enabled', 'true',   now()),
  ('chat_welcome_enabled', 'true',   now()),
  ('chat_welcome_message', 'Hi there, thanks for reaching out to Veloci Global Markets. How can we help you today?', now()),
  ('chat_offline_enabled', 'true',   now()),
  ('chat_offline_message', 'Our team is offline right now. Leave your message here and we will reply as soon as we are back.', now())
on conflict (key) do nothing;

-- Let the widget react to the online/offline switch without a reload. This also
-- makes the existing maintenance-mode realtime watcher work, which was
-- subscribing to a table that was never in the publication.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'system_settings') then
    alter publication supabase_realtime add table public.system_settings;
  end if;
end $$;
