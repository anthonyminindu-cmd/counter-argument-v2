-- Caller supplies the trusted renderer's output for an existing result in pg_temp.portrait_inputs.
-- Preserve the originally moderated artwork, owner, visibility, and registration identity.
do $project$
declare
  candidate record;
  source public.dk_infographics%rowtype;
  total integer;
begin
  for candidate in select * from pg_temp.portrait_inputs order by slug loop
    select * into strict source from public.dk_infographics p where p.slug=candidate.slug
      and p.owner_id is not null and p.point_digest=candidate.source_point_digest
      and encode(sha256(convert_to(p.artwork,'UTF8')),'hex')=candidate.source_artwork_sha256 for update;
    if candidate.artwork not like '%data-poster-format="impact-v2"%' then raise exception 'Unexpected poster format'; end if;
    with cells as (
      select * from xmltable('//*[local-name()="g" and @data-argument-id]' passing xmlparse(document candidate.artwork)
        columns id text path '@data-argument-id',impact integer path '@data-impact',shared_rank integer path '@data-rank',pick integer path '@data-pick')
    )
    select count(distinct cell.id) into total from public.automatic_debate_results a
      cross join jsonb_array_elements(a.ranking) r
      join cells cell on cell.id=r->>'id' and cell.impact=(r->>'impactScore')::integer
        and cell.shared_rank=(r->>'impactRank')::integer and cell.pick=(r->>'ordinal')::integer+1
      join dk_safety.points pt on pt.slug=source.slug and pt.id=cell.id and pt.title=r->>'title' and pt.detail=r->>'description'
      where a.session_id=candidate.session_id and a.stage='complete' and r->>'scoringVersion'='impact-v2';
    if total<>20 then raise exception 'Registered arguments and rendered rows must match the completed result'; end if;
    update dk_safety.points pt set impact_rank=(r->>'impactRank')::integer
      from public.automatic_debate_results a cross join jsonb_array_elements(a.ranking) r
      where a.session_id=candidate.session_id and pt.slug=source.slug and pt.id=r->>'id';
    get diagnostics total=row_count;
    if total<>20 then raise exception 'Missing registered arguments'; end if;
    insert into dk_safety.portrait_artwork(slug,source_artwork_sha256,source_point_digest,artwork)
      values(source.slug,candidate.source_artwork_sha256,source.point_digest,candidate.artwork)
      on conflict(slug) do update set source_artwork_sha256=excluded.source_artwork_sha256,
        source_point_digest=excluded.source_point_digest,artwork=excluded.artwork;
  end loop;
end $project$;
