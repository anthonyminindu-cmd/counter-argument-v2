-- Stable catalog IDs are shared by signup, settings and debate classification.
create table public.dk_feed_topics (
  id text primary key,
  label text not null,
  parent_id text references public.dk_feed_topics(id),
  aliases text[] not null,
  sort_order smallint not null unique
);
alter table public.dk_feed_topics enable row level security;
revoke all on public.dk_feed_topics from public, anon, authenticated;
grant select on public.dk_feed_topics to anon, authenticated;
create policy feed_topics_read on public.dk_feed_topics for select to anon, authenticated using (true);

insert into public.dk_feed_topics (id,label,parent_id,aliases,sort_order) values
  ('government', 'Government & Politics', null, array['elections','election','voting rights','public policy','campaign finance','government services'], 1),
  ('elections', 'Elections & voting', 'government', array['elections','election','ranked choice voting','electoral college','ballot access'], 2),
  ('immigration', 'Immigration policy', 'government', array['immigration','border security','asylum','path to citizenship','visas'], 3),
  ('public-spending', 'Public spending & government services', 'government', array['government spending','government services','public budget','public funding'], 4),
  ('law', 'Law, Rights & Public Safety', null, array['civil rights','public safety','legal system','law enforcement'], 5),
  ('courts', 'Courts & justice', 'law', array['supreme court','jury duty','criminal sentencing','prison reform','criminal justice','legal aid'], 6),
  ('rights', 'Civil & consumer rights', 'law', array['civil rights','free speech','consumer protection','disability rights','right to repair'], 7),
  ('policing', 'Policing & public safety', 'law', array['law enforcement','police','policing','firearms','gun control','fire safety'], 8),
  ('world', 'World Affairs & Defense', null, array['foreign policy','world affairs','geopolitics','national security','military'], 9),
  ('diplomacy', 'Diplomacy & international aid', 'world', array['diplomacy','foreign aid','international aid','united nations','diplomatic sanctions'], 10),
  ('military', 'Military policy & conflicts', 'world', array['military','armed conflict','war powers','defense spending','military service','conscription'], 11),
  ('money', 'Business, Economy & Money', null, array['business','economy','finance','personal finance','credit cards','affordability'], 12),
  ('taxes-trade', 'Taxes & trade', 'money', array['tariff','tariffs','trade policy','import duties','sales tax','gas tax','income tax','trade agreement'], 13),
  ('living-costs', 'Cost of living', 'money', array['cost of living','inflation','grocery prices','gas prices','minimum wage'], 14),
  ('investing', 'Saving & investing', 'money', array['investing','retirement savings','index fund','stocks','401k','pension','budgeting'], 15),
  ('small-business', 'Small business', 'money', array['small business','entrepreneurship','startup','franchise','business loans'], 16),
  ('work', 'Work & Careers', null, array['careers','workplace','workplaces','employers','employees','workers'], 17),
  ('remote-work', 'Remote & hybrid work', 'work', array['remote work','wfh','work from home','hybrid work','return to office','telework'], 18),
  ('workplace-policies', 'Workplace policies', 'work', array['workplace policy','workplace policies','work apps','four day workweek','workweek','work schedule','office dress code'], 19),
  ('hiring-pay', 'Hiring & pay', 'work', array['hiring','pay transparency','salary','salaries','job interview','overtime'], 20),
  ('labor', 'Unions & labor', 'work', array['labor unions','trade unions','collective bargaining','union contracts','worker strike'], 21),
  ('education', 'Education & Learning', null, array['education','school district','schools','students','learning'], 22),
  ('schools', 'K–12 & school schedules', 'education', array['school starts','school start times','school schedules','schedule for schools','high school','elementary school','homework','standardized testing','school uniforms'], 23),
  ('college', 'College & student debt', 'education', array['college','student debt','student loans','university','tuition'], 24),
  ('training', 'Trades & training', 'education', array['apprenticeship','trade school','vocational training','career training'], 25),
  ('technology', 'Technology & AI', null, array['technology','tech','broadband','digital privacy','cloud computing'], 26),
  ('ai', 'Artificial intelligence', 'technology', array['artificial intelligence','ai','chatgpt','generative ai','large language model','ai tools'], 27),
  ('cybersecurity', 'Cybersecurity & privacy', 'technology', array['cybersecurity','ransomware','hacking','multi factor authentication','data privacy','data breach','passkeys'], 28),
  ('data-centers', 'Data centers & cloud', 'technology', array['data center','data centers','cloud outage','cloud outages','cloud computing','server farms'], 29),
  ('devices', 'Devices & connectivity', 'technology', array['smartphone','smartphones','broadband','fiber internet','net neutrality','consumer electronics'], 30),
  ('science', 'Science & Space', null, array['science','scientific research','scientific discovery','research funding'], 31),
  ('space', 'Astronomy & spaceflight', 'science', array['astronomy','spaceflight','space exploration','space travel','moon landing','mars colony','nasa'], 32),
  ('biology', 'Biology & genetics', 'science', array['genetics','genome','biology','evolution','dna','dna testing'], 33),
  ('physical-science', 'Physics & chemistry', 'science', array['physics','chemistry','particle accelerator','scientific method'], 34),
  ('health', 'Health & Wellbeing', null, array['health','wellbeing','well being','healthcare','health care'], 35),
  ('healthcare', 'Healthcare & insurance', 'health', array['health insurance','healthcare','health care','medicare','medicaid','prescription drugs','hospitals'], 36),
  ('mental-health', 'Mental health', 'health', array['mental health','therapy','counseling','depression','anxiety'], 37),
  ('sleep-nutrition', 'Sleep & nutrition', 'health', array['sleep','school sleep','nutrition','healthy diet','ultra processed food'], 38),
  ('public-health', 'Public health', 'health', array['public health','vaccination','vaccines','infectious disease','public health policy'], 39),
  ('environment', 'Environment & Energy', null, array['environment','energy','climate','ecology'], 40),
  ('electricity', 'Electricity & utilities', 'environment', array['electricity','power bills','power upgrades','electric grid','power grid','substation','substations','grid reliability','nuclear power'], 41),
  ('climate', 'Climate & fuels', 'environment', array['climate change','global warming','fossil fuels','fossil fuel','carbon emissions','renewable energy','solar power'], 42),
  ('conservation', 'Conservation & pollution', 'environment', array['conservation','pollution','plastic waste','recycling','wildlife','water quality','national parks'], 43),
  ('disasters', 'Weather & disasters', 'environment', array['natural disaster','disaster response','flooding','hurricane','wildfire','weather'], 44),
  ('places', 'Cities, Housing & Transportation', null, array['cities','city council','city planning','local infrastructure','transportation'], 45),
  ('land-use', 'Zoning & land use', 'places', array['zoning','land use','apartments on','urban planning','housing development'], 46),
  ('housing', 'Housing & rent', 'places', array['housing','rent control','tenants','affordable housing','homelessness','mortgage','apartments'], 47),
  ('transit', 'Transit & roads', 'places', array['public transit','bike lane','bike lanes','highways','public transportation','traffic','parking minimums','commuter rail'], 48),
  ('society', 'Society, Relationships & Beliefs', null, array['society','social norms','community life','relationships','friendship'], 49),
  ('parenting', 'Parenting & families', 'society', array['parenting','childcare','screen time','teenagers','parents','family rules','parental controls'], 50),
  ('faith', 'Faith & beliefs', 'society', array['faith','religion','religious','spirituality','house of worship'], 51),
  ('ethics', 'Ethics & relationships', 'society', array['ethics','relationships','dating','marriage','friendship','community volunteering'], 52),
  ('entertainment', 'Arts, Entertainment & Media', null, array['entertainment','arts','cultural history','celebrities'], 53),
  ('tv-streaming', 'TV & streaming', 'entertainment', array['streaming services','tv shows','netflix','streaming','television','binge watch','whole seasons'], 54),
  ('film', 'Movies & film', 'entertainment', array['movies','film','cinema','movie theaters','oscars'], 55),
  ('music', 'Music', 'entertainment', array['music','music festivals','concerts','songwriters','record labels'], 56),
  ('books-journalism', 'Books & journalism', 'entertainment', array['books','reading','journalism','news coverage','local newspapers','book bans'], 57),
  ('arts-history', 'Art & cultural history', 'entertainment', array['museums','visual arts','public art','cultural history','historical monuments'], 58),
  ('gaming', 'Gaming & Internet Culture', null, array['gaming','internet culture','online communities'], 59),
  ('video-games', 'Video games & esports', 'gaming', array['video games','video game','gaming','esports','loot boxes','game consoles','console gaming'], 60),
  ('tabletop', 'Tabletop games', 'gaming', array['board games','tabletop games','dungeons and dragons','role playing games'], 61),
  ('social-platforms', 'Creators, memes & social platforms', 'gaming', array['social media','social platforms','autoplay','memes','content creators','influencers','tiktok','youtube'], 62),
  ('sports', 'Sports & Recreation', null, array['sports','athletes','recreation','league rules','athletics'], 63),
  ('golf', 'Golf', 'sports', array['golf','golfers','golfing','mulligan','scramble tournament','golf handicaps'], 64),
  ('football', 'Football', 'sports', array['football','nfl','ncaa football','touchdowns','quarterbacks'], 65),
  ('basketball', 'Basketball', 'sports', array['basketball','nba','wnba','march madness'], 66),
  ('other-sports', 'Other sports & outdoor recreation', 'sports', array['soccer','baseball','mlb','cricket','tennis','hockey','running clubs','outdoor recreation'], 67),
  ('youth-sports', 'Youth & school sports', 'sports', array['youth sports','school sports','travel sports','student athletes','sports scholarships'], 68),
  ('everyday', 'Food, Shopping & Everyday Life', null, array['everyday life','etiquette','lifestyle'], 69),
  ('food', 'Food & cooking', 'everyday', array['food','cooking','groceries','meal planning','food delivery','recipes','vegetarian'], 70),
  ('dining', 'Restaurants & tipping', 'everyday', array['restaurants','restaurant','tipping','service charge','dining','tips for servers'], 71),
  ('shopping', 'Shopping & fashion', 'everyday', array['shopping','black friday','buying online','online shopping','fast fashion','clothing','return policy'], 72),
  ('hobbies', 'Travel, Hobbies & Pets', null, array['hobbies','leisure time','travel','pets'], 73),
  ('travel', 'Travel & vacations', 'hobbies', array['vacations','tourism','airline fees','cruises','travel rewards','hotel'], 74),
  ('hobbies-crafts', 'Hobbies, crafts & home projects', 'hobbies', array['photography','gardening','diy','collecting','woodworking','hobby','home improvement'], 75),
  ('pets', 'Pets & animals', 'hobbies', array['pets','pet','dogs','dog','cats','cat','animal welfare','pet adoption','pet ownership'], 76);

-- Each account saves its whole selection atomically. An empty row records an explicit skip.
create table public.dk_member_feed_interests (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  selected text[] not null check (cardinality(selected) <= 128)
);
alter table public.dk_member_feed_interests enable row level security;
revoke all on public.dk_member_feed_interests from public, anon, authenticated;
grant select, insert, update on public.dk_member_feed_interests to authenticated;
create policy feed_interests_own on public.dk_member_feed_interests for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create function dk_editorial.validate_feed_interests() returns trigger
language plpgsql set search_path='' as $$
begin
  if cardinality(new.selected) > 128 then
    raise exception using errcode='23514', message='Too many feed interests';
  end if;
  if exists (
    select 1 from unnest(new.selected) as pick(id)
    left join public.dk_feed_topics t on t.id = pick.id where t.id is null
  ) then raise exception using errcode='23514', message='Unknown feed interest'; end if;
  new.selected := array(select distinct id from unnest(new.selected) as pick(id) order by id);
  return new;
end $$;
revoke all on function dk_editorial.validate_feed_interests() from public;
create trigger verify_feed_interests before insert or update on public.dk_member_feed_interests
for each row execute function dk_editorial.validate_feed_interests();

create table public.dk_feed_interest_release (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null default now()
);
insert into public.dk_feed_interest_release default values;
alter table public.dk_feed_interest_release enable row level security;
revoke all on public.dk_feed_interest_release from public, anon, authenticated;
grant select on public.dk_feed_interest_release to authenticated;
create policy feed_interest_release_read on public.dk_feed_interest_release
  for select to authenticated using (true);

create function public.dk_feed_interest_state()
returns table (enabled_at timestamptz, selected text[])
language sql stable security invoker set search_path='' as $$
  select launch.enabled_at, member.selected
  from public.dk_feed_interest_release launch
  left join public.dk_member_feed_interests member on member.owner_id = (select auth.uid());
$$;
revoke all on function public.dk_feed_interest_state() from public, anon;
grant execute on function public.dk_feed_interest_state() to authenticated;

-- Compare full words and phrases from the catalog. Long, specific phrases outrank short matches.
-- Store up to three broad categories, with the most relevant first, and the matched narrower topics.
create function dk_editorial.match_feed_topics(heading text, context text default '')
returns text[] language sql stable set search_path='' as $$
  with input as (
    select ' ' || regexp_replace(lower(coalesce(heading,'')), '[^[:alnum:]]+', ' ', 'g') || ' ' as heading,
           ' ' || regexp_replace(lower(coalesce(context,'')), '[^[:alnum:]]+', ' ', 'g') || ' ' as extra
  ), scores as (
    select topic.id, topic.parent_id, topic.sort_order,
           max(case when strpos(input.heading,' '||alias||' ') > 0 then 100 + length(alias)
                    when strpos(input.extra,' '||alias||' ') > 0 then length(alias) else 0 end) as score
    from public.dk_feed_topics topic cross join input cross join lateral unnest(topic.aliases) as hint(alias)
    group by topic.id,topic.parent_id,topic.sort_order
  ), roots as (
    select coalesce(parent_id,id) as root, max(score) as score, min(sort_order) as position
    from scores where score>0 group by coalesce(parent_id,id)
    order by max(score) desc,min(sort_order) limit 3
  )
  select array(
    select id from (
      select root as id, score, position, 0 as section from roots
      union all
      select s.id,s.score,s.sort_order,1 from scores s join roots r on r.root=s.parent_id where s.score>0
    ) as matched order by section,score desc,position
  );
$$;
revoke all on function dk_editorial.match_feed_topics(text,text) from public;

alter table public.dk_infographics add column feed_topic_ids text[] not null default '{}';
alter table public.dk_questions add column feed_topic_ids text[] not null default '{}';
alter table public.topics add column feed_topic_ids text[] not null default '{}';

create function dk_editorial.set_feed_topics() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name = 'dk_questions' then
    new.feed_topic_ids := dk_editorial.match_feed_topics(new.question,new.category);
  elsif tg_table_name = 'topics' then
    new.feed_topic_ids := dk_editorial.match_feed_topics(new.title,concat_ws(' ',new.category,new.description));
  else
    new.feed_topic_ids := dk_editorial.match_feed_topics(new.title,new.category);
  end if;
  return new;
end $$;
revoke all on function dk_editorial.set_feed_topics() from public;
create trigger tag_poster_feed_topics before insert or update of title, category on public.dk_infographics
for each row execute function dk_editorial.set_feed_topics();
create trigger tag_newly_published_poster before update of published_at on public.dk_infographics
for each row when (new.published_at is not null and old.published_at is null and cardinality(new.feed_topic_ids)=0)
execute function dk_editorial.set_feed_topics();
create trigger tag_question_feed_topics before insert or update of question, category on public.dk_questions
for each row execute function dk_editorial.set_feed_topics();
create trigger tag_debate_feed_topics before insert or update of title, category, description on public.topics
for each row execute function dk_editorial.set_feed_topics();

-- Classify existing public items. Private drafts and debates are tagged on creation or edits.
update public.dk_infographics set feed_topic_ids=dk_editorial.match_feed_topics(title,category)
where published_at is not null;
update public.dk_questions set feed_topic_ids=dk_editorial.match_feed_topics(question,category);
-- Review the launch edition against the decision in each question.
update public.dk_infographics p set feed_topic_ids=edition.topic_ids from (values
 ('ai-data-centers',array['places','technology','environment','land-use','data-centers','electricity']),
 ('cloud-outage-backup',array['work','technology','workplace-policies','data-centers']),
 ('office-land-housing',array['places','land-use','housing']),
 ('health-insurance',array['health','government','healthcare','public-spending']),
 ('teen-autoplay',array['gaming','society','social-platforms','parenting']),
 ('iran-war-powers',array['world','government','military']),
 ('federal-gas-tax',array['money','government','taxes-trade','living-costs']),
 ('grocery-tariffs',array['money','everyday','taxes-trade','food']),
 ('fossil-fuel-deadline',array['environment','world','climate','diplomacy']),
 ('immigration-bill',array['government','law','immigration','rights'])
) as edition(slug,topic_ids) where p.slug=edition.slug and p.owner_id is null;

create function dk_editorial.feed_interest_weight(tags text[], picks text[]) returns integer
language sql stable set search_path='' as $$
  select coalesce(max(case when topic.parent_id is null then 110 else 115 end),100)
  from public.dk_feed_topics topic where topic.id=any(tags) and topic.id=any(picks);
$$;
revoke all on function dk_editorial.feed_interest_weight(text[],text[]) from public;

-- Keep the existing popularity calculation and tie breakers in one function.
-- A hundred-point scale makes the percentage boost exact without a float.
create function dk_editorial.rank_posters(p_personalize boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable set search_path='' as $$
 with picks as (
   select coalesce((select selected from public.dk_member_feed_interests where owner_id=(select auth.uid())), '{}') as ids
   where p_personalize
 )
 select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
 l.total+seed.likes,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug),
 (select count(*) from public.dk_infographic_views v where v.slug=p.slug)+seed.views,l.mine,p.published_at
 from public.dk_infographics p cross join lateral (
 select count(*) total,count(*) filter(where created_at>=now()-interval '7 days') recent,
 coalesce(bool_or(owner_id=auth.uid()),false) mine from public.dk_infographic_likes where slug=p.slug) l
 cross join lateral (
 select count(*) views,count(*) filter(where liked) likes,
 count(*) filter(where liked and created_at>=now()-interval '7 days') recent
 from dk_editorial.poster_activity a where a.slug=p.slug) seed
 left join picks on true
 where p.published_at<=now() or (not p_personalize and p.owner_id=auth.uid())
 order by (l.recent+seed.recent) *
   case when cardinality(picks.ids)>0 then dk_editorial.feed_interest_weight(p.feed_topic_ids,picks.ids) else 100 end desc,
   p.published_at desc nulls last,p.created_at desc,p.slug;
$$;
revoke all on function dk_editorial.rank_posters(boolean) from public;

create or replace function public.dk_ranked_posters()
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable security definer set search_path='' as $$
  select * from dk_editorial.rank_posters(false);
$$;

create function public.dk_trending_posters()
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable security definer set search_path='' as $$
  select * from dk_editorial.rank_posters(true);
$$;
revoke all on function public.dk_trending_posters() from public, anon;
grant execute on function public.dk_trending_posters() to authenticated;
