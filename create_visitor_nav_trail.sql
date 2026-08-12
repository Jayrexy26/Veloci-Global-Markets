create or replace function public.visitor_ping(
  p_key uuid, p_page text default null, p_country text default null,
  p_city text default null, p_device text default null, p_os text default null,
  p_browser text default null, p_referrer text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_page text := nullif(left(p_page, 200), '');
begin
  if p_key is null then return; end if;

  insert into public.visitor_sessions
    (visitor_key, user_id, page, country, city, device, os, browser, referrer, nav)
  values
    (p_key, v_uid, v_page, left(p_country,2), left(p_city,80),
     left(p_device,20), left(p_os,40), left(p_browser,40), left(p_referrer,200),
     case when v_page is null then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object('p', v_page, 't', now())) end)
  on conflict (visitor_key) do update
    set last_seen_at = now(),
        user_id      = coalesce(v_uid, public.visitor_sessions.user_id),
        page         = coalesce(v_page, public.visitor_sessions.page),
        country      = coalesce(nullif(left(p_country,2), ''), public.visitor_sessions.country),
        city         = coalesce(nullif(left(p_city,80), ''),   public.visitor_sessions.city),
        device       = coalesce(nullif(left(p_device,20), ''), public.visitor_sessions.device),
        os           = coalesce(nullif(left(p_os,40), ''),     public.visitor_sessions.os),
        browser      = coalesce(nullif(left(p_browser,40), ''),public.visitor_sessions.browser),
        page_views   = public.visitor_sessions.page_views
                       + case when v_page is distinct from public.visitor_sessions.page then 1 else 0 end,
        nav = case
                when v_page is null or v_page is not distinct from public.visitor_sessions.page
                  then public.visitor_sessions.nav
                else coalesce((
                  -- newest 30, then re-sorted oldest-first so the trail reads
                  -- in the order the visitor actually walked it
                  select jsonb_agg(e order by ord)
                  from (
                    select e, ord
                    from jsonb_array_elements(
                           public.visitor_sessions.nav ||
                           jsonb_build_array(jsonb_build_object('p', v_page, 't', now()))
                         ) with ordinality t(e, ord)
                    order by ord desc
                    limit 30
                  ) recent
                ), '[]'::jsonb)
              end;

  if random() < 0.02 then
    delete from public.visitor_sessions where last_seen_at < now() - interval '1 hour';
  end if;
end;
$$;
revoke execute on function public.visitor_ping(uuid,text,text,text,text,text,text,text) from public;
grant  execute on function public.visitor_ping(uuid,text,text,text,text,text,text,text) to anon, authenticated;
