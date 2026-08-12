-- Veloci Global Markets — visitor context on support conversations
--
-- Captured when a conversation starts and refreshed each time the chat is
-- opened, so support sees where someone is, what they are using, and which
-- page they opened the chat from. Deliberately not a per-page tracking log.

alter table public.chat_conversations
  add column if not exists visitor_country   text,
  add column if not exists visitor_city      text,
  add column if not exists visitor_region    text,
  add column if not exists visitor_tz        text,
  add column if not exists visitor_device    text,
  add column if not exists visitor_os        text,
  add column if not exists visitor_browser   text,
  add column if not exists visitor_screen    text,
  add column if not exists visitor_language  text,
  add column if not exists visitor_page      text,
  add column if not exists visitor_referrer  text,
  add column if not exists chat_opens        integer not null default 0,
  add column if not exists context_at        timestamptz;

-- Users cannot write their conversation row directly, so context arrives
-- through a definer function that only ever touches the caller's own row.
create or replace function public.chat_update_context(
  p_country  text default null,
  p_city     text default null,
  p_region   text default null,
  p_tz       text default null,
  p_device   text default null,
  p_os       text default null,
  p_browser  text default null,
  p_screen   text default null,
  p_language text default null,
  p_page     text default null,
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
  if v_uid is null then
    return;
  end if;
  update public.chat_conversations
     set visitor_country  = coalesce(nullif(left(p_country , 2  ), ''), visitor_country),
         visitor_city     = coalesce(nullif(left(p_city    , 80 ), ''), visitor_city),
         visitor_region   = coalesce(nullif(left(p_region  , 80 ), ''), visitor_region),
         visitor_tz       = coalesce(nullif(left(p_tz      , 60 ), ''), visitor_tz),
         visitor_device   = coalesce(nullif(left(p_device  , 20 ), ''), visitor_device),
         visitor_os       = coalesce(nullif(left(p_os      , 40 ), ''), visitor_os),
         visitor_browser  = coalesce(nullif(left(p_browser , 40 ), ''), visitor_browser),
         visitor_screen   = coalesce(nullif(left(p_screen  , 20 ), ''), visitor_screen),
         visitor_language = coalesce(nullif(left(p_language, 20 ), ''), visitor_language),
         visitor_page     = coalesce(nullif(left(p_page    , 200), ''), visitor_page),
         visitor_referrer = coalesce(nullif(left(p_referrer, 200), ''), visitor_referrer),
         chat_opens       = chat_opens + 1,
         context_at       = now()
   where user_id = v_uid;
end;
$$;

revoke execute on function public.chat_update_context(text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant  execute on function public.chat_update_context(text,text,text,text,text,text,text,text,text,text,text) to authenticated;
