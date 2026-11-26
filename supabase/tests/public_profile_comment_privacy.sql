-- Verify the public API shape, published comment counts, and the owner-only history boundary.
begin;
do $$
begin
  if exists (
    select from dk_editorial.bot_accounts b
    cross join lateral public.dk_bot_profile_activity(b.id) a
    where to_jsonb(a) - array['support_given','support_received','comment_count'] <> '{}'::jsonb
       or a.comment_count is distinct from (
         select count(*) from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
         where c.persona_id=b.id and p.published_at<=now()
       )
  ) then raise exception 'Public profile totals exposed detail or counted the wrong comments'; end if;

  if not has_function_privilege('anon','public.dk_bot_profile_activity(text)','execute')
    or not has_function_privilege('authenticated','public.dk_bot_profile_activity(text)','execute')
    or has_function_privilege('anon','public.dk_profile_dashboard(text,integer)','execute')
    or not has_function_privilege('authenticated','public.dk_profile_dashboard(text,integer)','execute')
    or has_function_privilege('authenticated','dk_safety.dashboard_rows(uuid)','execute')
  then raise exception 'Unexpected profile history permissions'; end if;
end $$;

-- These fixtures exist only inside this transaction.
insert into auth.users(id) values
  ('2f695c9c-a308-4820-ac17-0fc57c7ab101'),('2f695c9c-a308-4820-ac17-0fc57c7ab102');
select public.dk_moderation_decision('2f695c9c-a308-4820-ac17-0fc57c7ab101','comment','iowa-army-detonation',
  jsonb_build_array('Comment for the profile privacy check.'::text),'allow','');
insert into public.dk_infographic_comments(id,slug,owner_id,body) values
  ('2f695c9c-a308-4820-ac17-0fc57c7ab103','iowa-army-detonation','2f695c9c-a308-4820-ac17-0fc57c7ab101','Comment for the profile privacy check.');

set local role authenticated;
do $$
declare history jsonb;
begin
  perform set_config('request.jwt.claim.sub','2f695c9c-a308-4820-ac17-0fc57c7ab101',true);
  history:=public.dk_profile_dashboard('comments',0);
  if (history->>'item_count')::int is distinct from 1
     or history#>>'{items,0,item}' is distinct from '2f695c9c-a308-4820-ac17-0fc57c7ab103'
  then raise exception 'The owner could not open their own comment'; end if;

  perform set_config('request.jwt.claim.sub','2f695c9c-a308-4820-ac17-0fc57c7ab102',true);
  history:=public.dk_profile_dashboard('comments',0);
  if history->'items' is distinct from '[]'::jsonb or (history->>'item_count')::int is distinct from 0
  then raise exception 'Another member could read the owner’s history'; end if;
end $$;
rollback;
