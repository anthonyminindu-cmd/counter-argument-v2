-- The picker can invite only existing members. Filter fixtures before the result limit.
create or replace function public.search_debate_partners(p_query text)
returns table(id uuid, user_id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.user_id, p.display_name, p.username, p.avatar_url
  from public.profiles as p
  join auth.users as account on account.id = p.user_id
  where (select auth.uid()) is not null
    and p.user_id <> (select auth.uid())
    and account.deleted_at is null
    and not coalesce(account.raw_app_meta_data ? 'qa_run', false)
    and lower(split_part(coalesce(account.email, ''), '@', 2)) not in ('example.com', 'example.test', 'example.invalid')
    and concat_ws(' ', p.display_name, p.username) !~* '(^|[^a-z])(qa|test(er|ing)?)([^a-z]|$)|(^|[[:space:]])(test|qa)(account|user|profile|friend|member|debate)|(^|[[:space:]])InboxQA[0-9a-f]{10}(Sender|Receiver)($|[[:space:]])'
    and length(trim(coalesce(p_query, ''))) >= 1
    and (p.display_name ilike '%' || trim(p_query) || '%' or p.username ilike '%' || trim(p_query) || '%')
  order by p.display_name nulls last, p.username nulls last, p.user_id
  limit 10
$$;

revoke all on function public.search_debate_partners(text) from public, anon;
grant execute on function public.search_debate_partners(text) to authenticated, service_role;
