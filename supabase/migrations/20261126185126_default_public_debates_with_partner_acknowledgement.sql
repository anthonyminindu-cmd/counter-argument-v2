-- Visibility is shared by the participants of the original debate.
create table dk_safety.debate_visibility (
  debate_id uuid primary key references public.debates(id) on delete cascade,
  automatic boolean not null default true,
  wants_public boolean not null default true,
  requester uuid references auth.users(id) on delete set null,
  request_id uuid,
  requested_public boolean,
  slug text references public.dk_infographics(slug) on delete set null,
  job text not null default 'idle' check(job in ('idle','queued','working','ready','held')),
  token uuid, due timestamptz not null default now(), attempts integer not null default 0
);
alter table dk_safety.debate_visibility enable row level security;
revoke all on dk_safety.debate_visibility from public, anon, authenticated;
create index debate_visibility_pending on dk_safety.debate_visibility(due) where job in ('working','queued');
create table dk_safety.debate_poster_links (
  slug text primary key references public.dk_infographics(slug) on delete cascade,
  debate_id uuid not null references dk_safety.debate_visibility(debate_id) on delete cascade
);
create index debate_poster_links_debate on dk_safety.debate_poster_links(debate_id);
alter table dk_safety.debate_poster_links enable row level security;
revoke all on dk_safety.debate_poster_links from public,anon,authenticated;

create view dk_safety.publication_results with (security_invoker=true) as
 select w.debate_id,w.user_id as owner,null::uuid as partner,w.snapshot,w.ranking
 from public.debate_workflows w where w.stage='complete'
 union all
 select s.debate_id,s.user_a,s.user_b,r.snapshot,r.ranking
 from public.automatic_debate_results r join public.debate_sessions s on s.id=r.session_id
 where r.stage='complete' and s.user_b is not null;
revoke all on dk_safety.publication_results from public,anon,authenticated;

create function dk_safety.track_debate_visibility() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into dk_safety.debate_visibility(debate_id) values(new.id); return new; end $$;
create trigger track_debate_visibility after insert on public.debates for each row execute function dk_safety.track_debate_visibility();
insert into dk_safety.debate_visibility(debate_id,automatic,wants_public)
select id,false,false from public.debates on conflict do nothing;

-- Match previously stored posters only to a participant's own twenty ranked arguments.
insert into dk_safety.debate_poster_links(slug,debate_id)
select p.slug,r.debate_id from public.dk_infographics p join dk_safety.publication_results r on p.owner_id in(r.owner,r.partner)
where p.point_digest is not null and (select array_agg(pt.id order by pt.id) from dk_safety.points pt where pt.slug=p.slug)
  =(select array_agg(j->>'id' order by j->>'id') from jsonb_array_elements(r.ranking) j)
on conflict do nothing;
update dk_safety.debate_visibility v set slug=l.slug,wants_public=l.published,job='ready'
from (select distinct on (x.debate_id) x.debate_id,p.slug,(p.published_at is not null) published
  from dk_safety.debate_poster_links x join public.dk_infographics p using(slug)
  order by x.debate_id,p.published_at desc nulls last,p.created_at,p.slug) l where l.debate_id=v.debate_id;

create function dk_safety.debate_from_ref(ref text) returns uuid language sql stable set search_path='' as $$
 select id from (
   select l.debate_id id from dk_safety.debate_poster_links l where l.slug=ref
   union all select s.debate_id from public.debate_sessions s where s.id::text=ref
   union all select d.id from public.debates d where d.id::text=ref
 ) choices limit 1
$$;
create function public.dk_result_visibility(p_reference text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'slug',v.slug,'automatic',v.automatic,'public',v.wants_public,'job',v.job,
 'friend',d.participant_b is not null or s.id is not null,'request',v.request_id,'mine',v.requester=auth.uid(),'requested_public',v.requested_public)
 from dk_safety.debate_visibility v join public.debates d on d.id=v.debate_id
 left join public.debate_sessions s on s.debate_id=d.id
 where v.debate_id=dk_safety.debate_from_ref(p_reference)
 and auth.uid() in(d.participant_a,d.participant_b,s.user_a,s.user_b) limit 1
$$;
create function public.dk_visibility_inbox() returns table(id uuid,title text,request uuid,requested_public boolean)
language sql stable security definer set search_path='' as $$
 select distinct d.id, coalesce(t.title,'Debate'),v.request_id,v.requested_public from dk_safety.debate_visibility v
 join public.debates d on d.id=v.debate_id left join public.topics t on t.id=d.topic_id
 left join public.debate_sessions s on s.debate_id=d.id
 where v.requester<>auth.uid() and v.request_id is not null and auth.uid() in(d.participant_a,d.participant_b,s.user_a,s.user_b)
$$;
create function public.dk_change_visibility(p_debate uuid,p_action text,p_request uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v dk_safety.debate_visibility%rowtype; actor uuid:=auth.uid(); info jsonb; target boolean;
begin
 select * into v from dk_safety.debate_visibility where debate_id=p_debate for update;
 info:=public.dk_result_visibility(p_debate::text);
 if info is null or actor is null then raise exception 'This debate is unavailable'; end if;
 if p_action in ('cancel','decline','acknowledge') then
   if v.requester is null or v.request_id is distinct from p_request then raise exception 'This request has already changed'; end if;
   if (p_action='cancel') is distinct from (v.requester=actor) then raise exception 'Only the other participant can respond to this request'; end if;
   if p_action='acknowledge' then target:=v.requested_public; end if;
 elsif p_action in ('private','public') then
   target:=p_action='public';
   if v.wants_public=target then return info; end if;
   if v.request_id is not null then raise exception 'A visibility request is already pending'; end if;
   if (info->>'friend')::boolean then
     update dk_safety.debate_visibility set requester=actor,request_id=gen_random_uuid(),requested_public=target where debate_id=p_debate;
     return public.dk_result_visibility(p_debate::text);
   end if;
 elsif p_action='retry' and v.job='held' then
   update dk_safety.debate_visibility set job='queued',attempts=0,due=now() where debate_id=p_debate;
   return public.dk_result_visibility(p_debate::text);
 else raise exception 'Unknown visibility action'; end if;
 update dk_safety.debate_visibility set requester=null,request_id=null,requested_public=null,
   wants_public=coalesce(target,wants_public),
   job=case when target=true and exists(select from dk_safety.publication_results r where r.debate_id=p_debate) then 'queued' else job end,
   due=case when target=true then now() else due end,
   attempts=case when target=true then 0 else attempts end
 where debate_id=p_debate;
 if target=false then
   update public.dk_infographics set published_at=null where published_at is not null and slug in
     (select l.slug from dk_safety.debate_poster_links l where l.debate_id=p_debate);
 end if;
 return public.dk_result_visibility(p_debate::text);
end $$;

-- Old clients must use the same acknowledgement rule for any linked poster.
create or replace function public.dk_share_poster(p_slug text,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
declare d uuid;
begin
 select debate_id into d from dk_safety.debate_poster_links where slug=p_slug;
 if d is not null then
   perform public.dk_change_visibility(d,case when p_publish then 'public' else 'private' end); return;
 end if;
 update public.dk_infographics set published_at=case when p_publish then coalesce(published_at,now()) end
 where slug=p_slug and owner_id=auth.uid();
 if not found then raise exception 'Infographic unavailable'; end if;
end $$;

create function dk_safety.queue_completed_result() returns trigger language plpgsql security definer set search_path='' as $$
declare d uuid;
begin
 if tg_table_name='debate_workflows' then d:=new.debate_id;
 else select debate_id into d from public.debate_sessions where id=new.session_id; end if;
 update dk_safety.debate_visibility set job='queued',due=now() where debate_id=d and automatic and job='idle';
 return new;
end $$;
create trigger publish_completed_solo after insert or update of stage on public.debate_workflows for each row when(new.stage='complete') execute function dk_safety.queue_completed_result();
create trigger publish_completed_friend after insert or update of stage on public.automatic_debate_results for each row when(new.stage='complete') execute function dk_safety.queue_completed_result();

create function public.dk_claim_publication() returns jsonb language plpgsql security definer set search_path='' as $$
declare v dk_safety.debate_visibility%rowtype; work jsonb;
begin
 select * into v from dk_safety.debate_visibility where job in ('queued','working') and due<=now()
 order by due,debate_id for update skip locked limit 1;
 if not found then return null; end if;
 update dk_safety.debate_visibility set job='working',attempts=attempts+1,token=gen_random_uuid(),due=now()+interval '3 minutes'
 where debate_id=v.debate_id returning * into v;
 select jsonb_build_object('debate',v.debate_id,'token',v.token,'slug',v.slug,'owner',r.owner,'partner',r.partner,
   'snapshot',r.snapshot,'ranking',r.ranking,'names',(select jsonb_object_agg(p.user_id,coalesce(nullif(p.display_name,''),p.username))
    from public.profiles p where p.user_id in(r.owner,r.partner)))
 into work from dk_safety.publication_results r where r.debate_id=v.debate_id;
 if work is null then update dk_safety.debate_visibility set job='idle',token=null where debate_id=v.debate_id; end if;
 return work;
end $$;

-- Register from the worker's trusted completed result. Both participants reuse this slug.
create function public.dk_stage_publication(p_debate uuid,p_token uuid,p_svg text,p_points jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v dk_safety.debate_visibility%rowtype; r record; target text; screen record;
begin
 select * into v from dk_safety.debate_visibility where debate_id=p_debate and token=p_token and job='working' for update;
 if not found then raise exception 'Publication lease expired'; end if;
 select * into strict r from dk_safety.publication_results where debate_id=p_debate;
 target:=v.slug;
 if target is null then
   perform set_config('request.jwt.claim.sub',r.owner::text,true);
   perform set_config('dk.publication_job',v.token::text,true);
   if r.partner is null then
     target:=public.dk_register_solo_poster(r.snapshot->>'topic',p_svg,p_points,r.snapshot->'positions'->>0,r.snapshot->'positions'->>1);
   else
     target:=public.dk_register_points(r.snapshot->>'topic',p_svg,p_points);
   end if;
   insert into dk_safety.debate_poster_links values(target,p_debate);
   update dk_safety.debate_visibility set slug=target where debate_id=p_debate;
 end if;
 if not v.wants_public then
   update dk_safety.debate_visibility set job='ready',token=null where debate_id=p_debate;
   return jsonb_build_object('private',true);
 end if;
 select * into strict screen from public.dk_poster_screen_input((select owner_id from public.dk_infographics where slug=target),target);
 return jsonb_build_object('slug',target,'fields',screen.fields,'content',screen.content);
end $$;
create function public.dk_finish_publication(p_debate uuid,p_token uuid,p_fields jsonb,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare v dk_safety.debate_visibility%rowtype; poster public.dk_infographics%rowtype; current_fields jsonb;
begin
 select * into v from dk_safety.debate_visibility where debate_id=p_debate and token=p_token and job='working' for update;
 if not found then return; end if;
 if p_outcome='retry' then
   update dk_safety.debate_visibility set job=case when attempts<5 then 'queued' else 'held' end,token=null,
    due=now()+interval '1 minute'*least(30,attempts*attempts) where debate_id=p_debate; return;
 end if;
 if p_outcome not in ('allow','hold') or p_outcome is null then raise exception 'Unknown moderation outcome'; end if;
 if v.wants_public and p_outcome='allow' then
   select * into strict poster from public.dk_infographics where slug=v.slug for update;
   select fields into strict current_fields from public.dk_poster_screen_input(poster.owner_id,poster.slug);
   if current_fields is distinct from p_fields then raise exception 'Poster changed during screening'; end if;
   perform public.dk_moderation_decision(poster.owner_id,'poster',poster.slug,p_fields,'allow',null);
   update public.dk_infographics set published_at=coalesce(published_at,now()) where slug=poster.slug;
 end if;
 update dk_safety.debate_visibility set job=case when wants_public and p_outcome='hold' then 'held' else 'ready' end,token=null
 where debate_id=p_debate;
end $$;

create function dk_safety.tick_publication() returns void language plpgsql security definer set search_path='' as $$
declare base text; credential text;
begin
 if not exists(select from dk_safety.debate_visibility where job in ('queued','working') and due<=now()) then return; end if;
 select decrypted_secret into strict base from vault.decrypted_secrets where name='debate_project_url';
 select decrypted_secret into strict credential from vault.decrypted_secrets where name='debate_worker_secret';
 perform net.http_post(url:=rtrim(base,'/')||'/functions/v1/publish-debate-result',headers:=jsonb_build_object('Content-Type','application/json','x-debate-worker-secret',credential),body:='{}'::jsonb,timeout_milliseconds:=90000);
end $$;
select cron.schedule('dk-publish-completed-debates','* * * * *','select dk_safety.tick_publication()');

revoke all on function dk_safety.track_debate_visibility(),dk_safety.debate_from_ref(text),dk_safety.queue_completed_result(),dk_safety.tick_publication() from public,anon,authenticated;
revoke all on function public.dk_result_visibility(text),public.dk_visibility_inbox(),public.dk_change_visibility(uuid,text,uuid),
 public.dk_claim_publication(),public.dk_stage_publication(uuid,uuid,text,jsonb),public.dk_finish_publication(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.dk_result_visibility(text),public.dk_visibility_inbox(),public.dk_change_visibility(uuid,text,uuid) to authenticated;
grant execute on function public.dk_claim_publication(),public.dk_stage_publication(uuid,uuid,text,jsonb),public.dk_finish_publication(uuid,uuid,jsonb,text) to service_role;

-- Route previous clients and either participant to the same saved result.
alter function public.dk_register_points(text,text,jsonb) set schema dk_safety;
revoke all on function dk_safety.dk_register_points(text,text,jsonb) from public,anon,authenticated;
create function public.dk_register_points(p_title text,p_svg text,p_points jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare ref text:=split_part(p_points->0->>'id',':',1); d uuid; v dk_safety.debate_visibility%rowtype; target text;
begin
 d:=dk_safety.debate_from_ref(ref);
 if d is not null and exists(select from dk_safety.publication_results r where r.debate_id=d and auth.uid() in(r.owner,r.partner)
   and (select array_agg(j->>'id' order by j->>'id') from jsonb_array_elements(r.ranking) j)
       =(select array_agg(j->>'id' order by j->>'id') from jsonb_array_elements(p_points) j)) then
   select * into strict v from dk_safety.debate_visibility where debate_id=d for update;
   if v.slug is not null then return v.slug; end if;
   if v.automatic and current_setting('dk.publication_job',true) is distinct from v.token::text then
     raise exception 'The finished debate poster is being prepared';
   elsif v.automatic and v.token is null then raise exception 'The finished debate poster is being prepared'; end if;
 else d:=null; end if;
 target:=dk_safety.dk_register_points(p_title,p_svg,p_points);
 if d is not null and not v.automatic and v.token is null then
   insert into dk_safety.debate_poster_links values(target,d) on conflict do nothing;
   update dk_safety.debate_visibility set slug=target,job='ready' where debate_id=d;
 end if;
 return target;
end $$;
revoke all on function public.dk_register_points(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dk_register_points(text,text,jsonb) to authenticated;

create or replace function public.dk_can_read_poster(p_slug text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.dk_infographics p where p.slug=p_slug and
   (p.published_at<=now() or p.owner_id=auth.uid() or public.dk_result_visibility(p_slug) is not null));
$$;

create or replace function public.dk_read_poster(p_slug text)
returns table(slug text,title text,artwork text,category text,mine boolean,published boolean)
language sql stable security definer set search_path='' as $$
  select p.slug, p.title, coalesce(c.artwork,p.artwork), p.category,
         p.owner_id=auth.uid(), p.published_at is not null
  from public.dk_infographics p
  left join dk_safety.portrait_artwork c on c.slug=p.slug
    and c.source_point_digest=p.point_digest
    and c.source_artwork_sha256=encode(sha256(convert_to(p.artwork,'UTF8')),'hex')
  where p.slug=p_slug and public.dk_can_read_poster(p.slug);
$$;


-- Keep the active support aggregation and attach an explicit opponent-role flag.
do $$
declare definition text:=pg_get_functiondef('public.dk_position_support(text[])'::regprocedure);
begin
 if position('when s.ai then ''Differ Kindly AI''' in definition)=0 then raise exception 'Review the current AI byline before updating the support projection'; end if;
 definition:=replace(definition,'''author'',case when s.ai then ''Differ Kindly AI''','''ai'',s.ai,''author'',case when s.ai then ''Diff AI''');
 execute definition;
end $$;
