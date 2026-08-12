-- Site-wide chat needs anonymous auth, which means anonymous rows land in
-- auth.users. Without this guard every passing visitor would also appear in
-- profiles — polluting the user list, user counts and admin dashboards with
-- email-less records.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;                       -- browsing visitor, not a customer
  end if;
  insert into public.profiles (id, email, full_name, created_at)
  values (new.id, new.email, split_part(new.email, '@', 1), now())
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Anonymous identities accumulate, so retire the ones that never said
-- anything. Conversations cascade from auth.users, so a purged visitor takes
-- their empty conversation with them.
create or replace function private.purge_anonymous_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with dead as (
    delete from auth.users u
    where coalesce(u.is_anonymous, false)
      and u.created_at < now() - interval '7 days'
      and not exists (
        select 1
        from public.chat_conversations c
        join public.chat_messages m on m.conversation_id = c.id
        where c.user_id = u.id
      )
    returning 1
  )
  select count(*) into v_deleted from dead;
  return v_deleted;
end;
$$;

revoke execute on function private.purge_anonymous_users() from public, anon, authenticated;
