-- Public profiles expose a single total, including privately created discussions.
-- Participation, votes and comments do not establish authorship.
create function public.dk_discussions_created(p_profile text)
returns bigint language sql stable strict security definer set search_path = '' as $$
  select case
    when p_profile ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
      (select count(*) from public.dk_questions where author_id=p_profile::uuid)
      + (select count(*) from public.debates
         where participant_a=p_profile::uuid and status is distinct from 'cancelled')
    else (select count(*) from dk_editorial.poster_authors where persona=p_profile)
  end
$$;
revoke all on function public.dk_discussions_created(text) from public;
grant execute on function public.dk_discussions_created(text) to anon,authenticated;

-- The original Iowa debate credits its two authors in the edition's sampleDebate.
insert into dk_editorial.poster_authors(slug,persona)
select s.slug,s.persona from dk_safety.poster_positions s
where s.slug='iowa-army-detonation' and s.persona in ('person-193','person-121')
on conflict do nothing;
