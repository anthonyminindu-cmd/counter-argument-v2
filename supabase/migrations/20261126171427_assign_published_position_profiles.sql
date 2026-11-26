-- These released discussions were edited centrally. Assign each side to a profile
-- that already expressed that position in its own public comment on this debate.
-- Keep the editorial author and the position's existing vote key intact.
do $$
declare
  assigned integer;
  fixture record;
begin
  with selected(slug, label, comment_id) as (values
    ('ai-data-centers', 'Approve with safeguards', '0ba3fab7-61ec-5f09-843f-9604ff8baa30'::uuid),
    ('ai-data-centers', 'Pause until costs are clear', '12edbfdb-b04e-55a8-8965-27ee301235e3'::uuid),
    ('grocery-tariffs', 'Remove grocery tariffs', '97949f5d-339f-5831-a390-8d72d26ea677'::uuid),
    ('grocery-tariffs', 'Keep selected grocery tariffs', '4544eae0-2c38-5f0e-9165-e3bbaf44964b'::uuid),
    ('health-insurance', 'Restore larger tax credits', '991f518b-1a7f-5100-b989-8c9cbf9fb04e'::uuid),
    ('health-insurance', 'Focus on the price of care', '2e124a5e-426f-5b8b-b134-06c1c6f16393'::uuid),
    ('teen-autoplay', 'Turn off autoplay', '6d69ba3a-4a85-55d3-a377-cc155beaebf4'::uuid),
    ('teen-autoplay', 'Let families choose', '77527090-9c67-57a7-a9f6-335372235116'::uuid),
    ('iran-war-powers', 'Require a public vote', 'ba62de57-d252-58c1-b8ec-d4f87bb4294c'::uuid),
    ('iran-war-powers', 'Allow flexibility with oversight', '2b404828-579c-5abb-ac5f-6f408929a0ce'::uuid),
    ('federal-gas-tax', 'Pause the gas tax', 'c6dde0bd-246c-522c-9811-e6271bfa474c'::uuid),
    ('federal-gas-tax', 'Keep the gas tax in place', '2d8eb889-ebd2-5d23-8e4f-2107b7ee9596'::uuid),
    ('office-land-housing', 'Allow apartments on office land', '95d7c310-67a4-5fea-8de3-43efff2d5648'::uuid),
    ('office-land-housing', 'Review each site first', 'b5bfc47f-ad3e-5884-bdbf-acba2942388f'::uuid),
    ('immigration-bill', 'A single bill', '79ac490b-f0c8-5b74-b647-af09ab3903e8'::uuid),
    ('immigration-bill', 'Vote on separate bills', 'cd72688a-bd76-5bf7-920f-cdee87aff1b8'::uuid),
    ('fossil-fuel-deadline', 'Set a shared deadline', '1351692a-2c0f-59c4-b518-18bfceef03cf'::uuid),
    ('fossil-fuel-deadline', 'Let countries choose their dates', 'f49e96ec-835a-52f0-989e-6883af3a9506'::uuid),
    ('cloud-outage-backup', 'Pay for a backup channel', '8e3ea259-4782-5b20-a876-2968cc05d6a6'::uuid),
    ('cloud-outage-backup', 'Use existing emergency contacts', '6062a588-f4e3-5410-b2c3-f550ec1e8b84'::uuid)
  ), representatives as (
    select v.slug,v.label,c.persona_id
    from selected v join dk_editorial.discussion_comments c
      on c.id=v.comment_id and c.slug=v.slug
  )
  update dk_safety.poster_positions s set persona=r.persona_id
  from representatives r where s.slug=r.slug and s.label=r.label
    and s.member is null and not s.ai and (s.persona is null or s.persona=r.persona_id);
  get diagnostics assigned=row_count;
  if assigned<>20 then raise exception 'Expected 20 editorial positions with matching public comments'; end if;

  -- Only the two project-owned accounts from the original Black Friday session
  -- lack public bylines. Preserve their account IDs and any subsequently chosen name.
  for fixture in
    select p.user_id,v.first_name from (values
      ('Wait for Friday and compare the price history first','InboxQA6936a87283Receiver','Riley'),
      ('Buy a planned gift early when the price meets your target','InboxQA6936a87283Sender','Morgan')
    ) v(label,fixture_tag,first_name)
    join dk_safety.poster_positions s on s.label=v.label and
      s.slug='poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2'
    join auth.users u on u.id=s.member and u.raw_user_meta_data->>'display_name'=v.fixture_tag
    join public.profiles p on p.user_id=u.id
    where nullif(btrim(p.display_name),'') is null and coalesce(p.username,'')='' and coalesce(p.bio,'')=''
    for update of p
  loop
    perform public.dk_moderation_decision(fixture.user_id,'profile','',
      jsonb_build_array(fixture.first_name,'',''),'allow',fixture.first_name);
    update public.profiles set display_name=fixture.first_name where user_id=fixture.user_id;
  end loop;
end $$;
