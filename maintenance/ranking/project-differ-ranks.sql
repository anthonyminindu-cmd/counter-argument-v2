-- Supply one trusted renderer payload in pg_temp.differ_rank_input(document jsonb).
-- Only presentation ranks and existing projections change. Permanent point IDs
-- keep their reactions, comments and shared links across the update.
do $project$
declare
  payload jsonb;
  archive record;
  touched int;
  expected int;
begin
  select document into strict payload from pg_temp.differ_rank_input;
  create temporary table dk_new_ranks(slug text, id text, rank int check(rank between 1 and 20),
    primary key(slug,id), unique(slug,rank)) on commit drop;
  insert into dk_new_ranks select * from jsonb_to_recordset(payload->'updates') as r(slug text,id text,rank int);
  if exists(select slug from dk_new_ranks group by slug having count(*)<>20) then
    raise exception 'Incomplete Differ Rank set';
  end if;
  for archive in select * from jsonb_to_recordset(payload->'archives')
    as a(slug text,session_id uuid,source_artwork_sha256 text,source_point_digest text,artwork text)
  loop
    with inputs as (
      select r->>'id' as id,(r->>'ordinal')::int+1 as pick,
        5*(r->>'magnitude')::int + 3*(r->>'reach')::int + 2*(r->>'duration')::int as units
      from public.automatic_debate_results a cross join jsonb_array_elements(a.ranking) r
      where a.session_id=archive.session_id and a.stage='complete' and r->>'scoringVersion'='impact-v2'
    ), ranked as (
      select *,row_number() over(order by units desc,pick,id collate "C") as rank from inputs
    ), cells as (
      select * from xmltable('//*[local-name()="g" and @data-argument-id]' passing xmlparse(document archive.artwork)
        columns id text path '@data-argument-id', rank int path '@data-rank', pick int path '@data-pick', score numeric path '@data-impact')
    )
    select count(distinct x.id) into touched from ranked x join cells c using(id,rank,pick)
      join dk_new_ranks u on u.slug=archive.slug and u.id=x.id and u.rank=x.rank
      where x.units=c.score*10;
    if touched<>20 then raise exception 'Archived projection does not match original assessments'; end if;
    update dk_safety.portrait_artwork c set artwork=archive.artwork
      from public.dk_infographics p where c.slug=archive.slug and p.slug=c.slug
      and p.point_digest=c.source_point_digest and c.source_point_digest=archive.source_point_digest
      and encode(sha256(convert_to(p.artwork,'UTF8')),'hex')=archive.source_artwork_sha256
      and c.source_artwork_sha256=archive.source_artwork_sha256;
    if not found then raise exception 'Registered artwork changed'; end if;
  end loop;
  select count(*) into expected from dk_new_ranks;
  update dk_safety.points p set impact_rank=u.rank from dk_new_ranks u where p.slug=u.slug and p.id=u.id;
  get diagnostics touched=row_count;
  if touched<>expected then raise exception 'Registered arguments changed'; end if;
end $project$;
