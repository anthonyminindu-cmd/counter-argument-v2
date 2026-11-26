-- Run with psql against a disposable database with the V2 migrations installed.
begin;
insert into auth.users (id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.dk_infographics (slug,title,artwork,owner_id,published_at) values
 ('interest-test-golf','Should golf allow a mulligan?','<svg>Ranking test fixture</svg>',null,now()-interval '2 days'),
 ('interest-test-film','Should movie theaters offer assigned seating?','<svg>Ranking test fixture</svg>',null,now()-interval '1 day'),
 ('interest-test-space','Should NASA fund more space exploration?','<svg>Ranking test fixture</svg>',null,now()-interval '3 days'),
 ('interest-test-private','Should golf use a shot clock?','<svg>Ranking test fixture</svg>','10000000-0000-4000-8000-000000000001',null),
 ('interest-test-other-private','Should the NFL change overtime?','<svg>Ranking test fixture</svg>','10000000-0000-4000-8000-000000000002',null);

insert into dk_editorial.poster_activity(slug,persona,liked,created_at)
select fixture.slug, 'interest-test-'||n, true, now()
from (values ('interest-test-golf',92),('interest-test-film',100),('interest-test-space',140)) fixture(slug,score)
cross join lateral generate_series(1,fixture.score) n;

do $$
begin
  if not array['sports','golf'] <@ (select feed_topic_ids from public.dk_infographics where slug='interest-test-golf') then
    raise exception 'Automatic golf classification failed';
  end if;
  if dk_editorial.feed_interest_weight(array['sports','golf'],array['sports','golf']) <> 115
     or dk_editorial.feed_interest_weight(array['sports','golf'],array['sports']) <> 110
     or dk_editorial.feed_interest_weight(array['sports','golf'],array['science']) <> 100 then
    raise exception 'Interest multipliers are incorrect';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare base text[]:=array['interest-test-space','interest-test-film','interest-test-golf'];
begin
  if array(select slug from public.dk_trending_posters() where slug like 'interest-test-%') <> base then
    raise exception 'An account without preferences must retain the standard ranking and exclude unpublished posts';
  end if;
  if (select selected from public.dk_feed_interest_state()) is not null then raise exception 'Signup state should be unanswered'; end if;
  insert into public.dk_member_feed_interests(owner_id,selected)
    values (auth.uid(),array['sports','golf','golf']);
  if (select selected from public.dk_feed_interest_state()) <> array['golf','sports'] then
    raise exception 'Selection should be saved and deduplicated';
  end if;
  if array(select slug from public.dk_trending_posters() where slug like 'interest-test-%')
     <> array['interest-test-space','interest-test-golf','interest-test-film'] then
    raise exception 'The golf boost should reorder close debates while keeping all eligible debates';
  end if;
  if array(select slug from public.dk_ranked_posters() where slug like 'interest-test-%' and published) <> base then
    raise exception 'Original ranking should remain available';
  end if;
  update public.dk_member_feed_interests set selected=array['basketball'] where owner_id=auth.uid();
  if array(select slug from public.dk_trending_posters() where slug like 'interest-test-%') <> base then
    raise exception 'No matching debates must retain the standard order';
  end if;
  begin
    update public.dk_member_feed_interests set selected=array['invalid-topic'] where owner_id=auth.uid();
    raise exception 'Unknown topic should be rejected';
  exception when check_violation then null;
  end;
  update public.dk_member_feed_interests set selected='{}' where owner_id=auth.uid();
  if (select selected from public.dk_feed_interest_state()) <> '{}'::text[]
     or array(select slug from public.dk_trending_posters() where slug like 'interest-test-%') <> base then
    raise exception 'Clearing interests must keep the usual feed and record completion';
  end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
begin
  if exists(select 1 from public.dk_member_feed_interests) then raise exception 'Another account can see private choices'; end if;
  begin
    insert into public.dk_member_feed_interests(owner_id,selected)
    values ('10000000-0000-4000-8000-000000000001',array['golf']);
    raise exception 'Another account can write private choices';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  if has_table_privilege('public.dk_member_feed_interests','select')
     or has_function_privilege('public.dk_feed_interest_state()','execute')
     or has_function_privilege('public.dk_trending_posters()','execute') then
    raise exception 'Guest can access member personalization';
  end if;
end $$;
rollback;
