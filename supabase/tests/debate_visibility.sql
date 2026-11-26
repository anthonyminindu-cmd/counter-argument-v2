-- Run against a database with a completed two-person result and a completed AI result.
-- All writes roll back, including the newly created debate and its feed entry.
begin;
do $$
declare
  friend record; solo record; outsider uuid:=gen_random_uuid(); new_id uuid; request_id uuid;
  state jsonb; claim jsonb; staged jsonb; points jsonb; blocked boolean; initial_date timestamptz;
begin
  select r.*,v.slug into strict friend from dk_safety.publication_results r
    join dk_safety.debate_visibility v using(debate_id) where r.partner is not null and v.wants_public and v.slug is not null limit 1;
  perform set_config('request.jwt.claim.sub',friend.owner::text,true);
  state:=public.dk_change_visibility(friend.debate_id,'private');
  request_id:=(state->>'request')::uuid;
  if request_id is null or not (state->>'public')::boolean then raise exception 'Request must leave debate public'; end if;
  blocked:=false;
  begin perform public.dk_change_visibility(friend.debate_id,'acknowledge',request_id);
  exception when others then blocked:=sqlerrm like 'Only the other participant%'; end;
  if not blocked then raise exception 'Requester cannot acknowledge'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if public.dk_result_visibility(friend.slug) is not null then raise exception 'Only original participants can manage privacy'; end if;
  perform set_config('request.jwt.claim.sub',friend.partner::text,true);
  if not exists(select from public.dk_visibility_inbox() where request=request_id) then raise exception 'Partner missing notification'; end if;
  state:=public.dk_change_visibility(friend.debate_id,'acknowledge',request_id);
  if (state->>'public')::boolean or state->>'request' is not null then raise exception 'Acknowledgement did not take effect'; end if;
  if exists(select from dk_safety.debate_poster_links link join public.dk_infographics p using(slug)
    where link.debate_id=friend.debate_id and p.published_at is not null) then raise exception 'A public duplicate remained'; end if;
  if not public.dk_can_read_poster(friend.slug) then raise exception 'Partner lost private access'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if public.dk_can_read_poster(friend.slug) then raise exception 'Private result is publicly readable'; end if;
  perform set_config('request.jwt.claim.sub',friend.partner::text,true);
  state:=public.dk_change_visibility(friend.debate_id,'public');
  if (state->>'public')::boolean or state->>'request' is null then raise exception 'Republishing needs partner approval'; end if;
  perform set_config('request.jwt.claim.sub',friend.owner::text,true);
  state:=public.dk_change_visibility(friend.debate_id,'decline',(state->>'request')::uuid);
  if (state->>'public')::boolean or state->>'request' is not null then raise exception 'Decline failed'; end if;

  select r.*,d.topic_id into strict solo from dk_safety.publication_results r join public.debates d on d.id=r.debate_id
    where r.partner is null and jsonb_array_length(r.ranking)=20 limit 1;
  insert into public.debates(topic_id,participant_a) values(solo.topic_id,solo.owner) returning id into new_id;
  perform set_config('request.jwt.claim.sub',solo.owner::text,true);
  state:=public.dk_result_visibility(new_id::text);
  if not ((state->>'public')::boolean and (state->>'automatic')::boolean) or state->>'slug' is not null then raise exception 'Incorrect default for new debate'; end if;
  insert into public.debate_workflows(debate_id,user_id,snapshot,ranking,stage)
    values(new_id,solo.owner,replace(solo.snapshot::text,solo.debate_id::text,new_id::text)::jsonb,
      replace(solo.ranking::text,solo.debate_id::text,new_id::text)::jsonb,'complete');
  if (public.dk_result_visibility(new_id::text)->>'job')<>'queued' then raise exception 'Completed debate was not queued'; end if;
  update dk_safety.debate_visibility set due='-infinity' where debate_id=new_id;
  claim:=public.dk_claim_publication();
  if (claim->>'debate')::uuid is distinct from new_id then raise exception 'New result was not claimed'; end if;
  select jsonb_agg(jsonb_build_object('id',j->>'id','rank',(j->>'rank')::int,
    'side',case when j->>'owner'='ai' then solo.snapshot->'positions'->>1 else solo.snapshot->'positions'->>0 end,
    'title',j->>'title','detail',j->>'description','sources','[]'::jsonb)) into points
    from jsonb_array_elements(claim->'ranking') j;
  staged:=public.dk_stage_publication(new_id,(claim->>'token')::uuid,'<svg xmlns="http://www.w3.org/2000/svg"><text>Visibility workflow test</text></svg>',points);
  if staged->'fields' is null or staged->>'slug' is null then raise exception 'Worker staging failed'; end if;
  perform public.dk_finish_publication(new_id,(claim->>'token')::uuid,staged->'fields','allow');
  select published_at into strict initial_date from public.dk_infographics where slug=staged->>'slug';
  if initial_date is null then raise exception 'Approved new result missing from feed'; end if;
  state:=public.dk_change_visibility(new_id,'private');
  if (state->>'public')::boolean or state->>'request' is not null then raise exception 'Solo privacy should be immediate'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if public.dk_can_read_poster(staged->>'slug') then raise exception 'Hidden AI result still public'; end if;
end $$;
rollback;
