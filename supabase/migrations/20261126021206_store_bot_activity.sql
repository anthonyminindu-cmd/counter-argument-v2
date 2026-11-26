-- The existing public bot profiles provide the stable account IDs for stored actions.
create table dk_editorial.bot_accounts (id text primary key);
insert into dk_editorial.bot_accounts(id)
select 'person-'||lpad(i::text,3,'0') from generate_series(1,300) i;
alter table dk_editorial.bot_accounts enable row level security;
revoke all on dk_editorial.bot_accounts from public,anon,authenticated;

alter table dk_editorial.poster_activity
  add constraint poster_activity_bot foreign key(persona) references dk_editorial.bot_accounts(id);
create index poster_activity_bot_likes on dk_editorial.poster_activity(persona,slug) where liked;
alter table dk_editorial.discussion_comments
  add constraint discussion_comments_bot foreign key(persona_id) references dk_editorial.bot_accounts(id),
  add column parent_id uuid,
  add column sort_order integer not null default 0,
  add column created_at timestamptz not null default now(),
  add unique(slug,id),
  add foreign key(slug,parent_id) references dk_editorial.discussion_comments(slug,id) on delete cascade,
  add check(parent_id is distinct from id);
create index discussion_comments_bot_history on dk_editorial.discussion_comments(persona_id,created_at desc);
create index discussion_comments_bot_parent on dk_editorial.discussion_comments(slug,parent_id);

-- Preserve the full text, order, author, and link of every published discussion contribution.
with comments(id,slug,persona,body,parent_id,sort_order) as (values
 ('dec7c7b7-7e33-5c26-970e-840537826373'::uuid,'ai-data-centers','person-033','Who pays for the substation?',null::uuid,1),
 ('31591288-3006-5c82-a727-025671788197'::uuid,'ai-data-centers','person-120','I keep coming back to the same question: what does the town get in exchange for hosting it?',null::uuid,2),
 ('12edbfdb-b04e-55a8-8965-27ee301235e3'::uuid,'ai-data-centers','person-111','A construction boom and a permanent jobs program are two different things. I want to see the staffing plan for year five before we promise a twenty-year tax break.',null::uuid,3),
 ('6861b341-b8f9-5b8b-9baf-fe8bbd4e822c'::uuid,'ai-data-centers','person-013','Why count only the jobs inside the building? Construction crews and nearby businesses get work too.','12edbfdb-b04e-55a8-8965-27ee301235e3'::uuid,4),
 ('d9d71363-f834-50e1-a6be-44381a30355a'::uuid,'ai-data-centers','person-111','Those jobs count. My question is how many are still there after the crews leave.','6861b341-b8f9-5b8b-9baf-fe8bbd4e822c'::uuid,5),
 ('ae07f49a-3805-5f57-a1b8-af1bc89c1af5'::uuid,'ai-data-centers','person-013','Fair. I''d ask for a separate estimate of temporary and permanent jobs before voting.','d9d71363-f834-50e1-a6be-44381a30355a'::uuid,6),
 ('52b6bbab-a887-56c7-8694-ced7c58e279d'::uuid,'ai-data-centers','person-013','Would the town get a say in expansions, or would the first permit cover them all?',null::uuid,7),
 ('29d33546-b8d6-5af6-bd00-23c3812afd86'::uuid,'ai-data-centers','person-096','I was a yes until I saw that the utility upgrade could go into everyone’s rates. If the operator pays for the capacity it needs, I''m back to a maybe.',null::uuid,8),
 ('d95bd477-82f7-5b8a-b3db-3c42fa52df2d'::uuid,'ai-data-centers','person-124','The offer should include who pays to restore the site if the operator leaves.',null::uuid,9),
 ('3ee9f194-93b8-5e6e-b785-8d7a124acbb4'::uuid,'ai-data-centers','person-271','Water would be my first question, especially in August.',null::uuid,10),
 ('e1a8fcb9-d575-5489-8231-a61568534da6'::uuid,'ai-data-centers','person-182','Water use depends on the cooling system. I''d ask what they''re installing before assuming the worst.','3ee9f194-93b8-5e6e-b785-8d7a124acbb4'::uuid,11),
 ('61c8e756-764c-573a-8caa-d9655dc9a0aa'::uuid,'ai-data-centers','person-271','Agreed. I''d still want a cap for drought days written into the deal.','e1a8fcb9-d575-5489-8231-a61568534da6'::uuid,12),
 ('f95b30e6-30ba-52d4-be1f-be4467a270a3'::uuid,'ai-data-centers','person-182','What happens if a cheaper power rate for the site lasts longer than its commitment to hire locally?',null::uuid,13),
 ('dea0adad-3289-5900-b42e-ca4654cc04c2'::uuid,'ai-data-centers','person-299','If we wait for a project with zero downside, nothing is getting built here.',null::uuid,14),
 ('1ab3656b-d050-58a9-9b0a-bc6a60db4531'::uuid,'ai-data-centers','person-186','Maybe the public meeting should start with a map of the nearest homes and schools.',null::uuid,15),
 ('dc2f3e41-40f6-588c-909c-30bbffadcb1c'::uuid,'ai-data-centers','person-218','Could a town test the deal by budgeting for fewer jobs and more power use than the company expects?',null::uuid,16),
 ('1bee26fe-2739-5d95-bc68-48d5bf429d57'::uuid,'ai-data-centers','person-038','The poll question was about banning all new centers. I could oppose a ban and still vote no on one site.',null::uuid,17),
 ('79b0108a-63e9-5605-8a80-4727cf62ecee'::uuid,'ai-data-centers','person-258','I would prefer a site on land already zoned for industry, even if the approvals take longer.',null::uuid,18),
 ('c357160b-210c-5515-953b-9795e40589c5'::uuid,'ai-data-centers','person-267','I don''t want the town to say no just because the project has AI in the name. I''d apply the same noise, water and traffic rules to any big industrial user.',null::uuid,19),
 ('f781c4df-3d66-5611-97e6-69cff8d6e378'::uuid,'ai-data-centers','person-123','I''d ask for someone outside the project to review the water and power promises.',null::uuid,20),
 ('77f2204d-c872-5460-ae31-9345e410c2f6'::uuid,'ai-data-centers','person-178','The tax deal should kick in after the jobs show up.

If the company walks away, the agreement should also say who gets stuck with the site and what they have to do to clean it up.',null::uuid,21),
 ('0ba3fab7-61ec-5f09-843f-9604ff8baa30'::uuid,'ai-data-centers','person-043','If the developer can fully cover the cost, I''d lean yes. I still want to see the details.',null::uuid,22),
 ('af2273de-fbe8-561f-87da-d014704f2dc8'::uuid,'ai-data-centers','person-108','Can they put it in the old industrial park? That''s a different conversation from putting it behind somebody''s house.',null::uuid,23),
 ('73e44919-cbfe-59bc-a393-d8f351f8a76b'::uuid,'ai-data-centers','person-080','Local training sounds good if there are actual roles for people who finish it.',null::uuid,24),
 ('7dcb8a77-cf08-5d71-826e-aaf9b19cc2b5'::uuid,'ai-data-centers','person-159','I''d take the tax revenue. Our town has been cutting services for years.',null::uuid,25),
 ('fbd9e155-0a1b-50b2-a14a-d5ae02ad1c2d'::uuid,'grocery-tariffs','person-207','Take them off coffee, at least.',null::uuid,1),
 ('e02c7287-b084-5627-a19f-6eb05e38d4b6'::uuid,'grocery-tariffs','person-188','How long would we give a change before checking the prices and deciding what to keep?',null::uuid,2),
 ('b4bb2df5-c9ca-568e-b2c3-cd9e2518fbb1'::uuid,'grocery-tariffs','person-048','Would the savings reach the checkout line? I''d love to see a store put its prices before and after the change next to each other.',null::uuid,3),
 ('11e59d8c-31a3-5955-bcd9-6a06fcdfcd1d'::uuid,'grocery-tariffs','person-271','Prices can move because of a bad harvest too. A before-and-after photo won''t tell you what the tariff did.','b4bb2df5-c9ca-568e-b2c3-cd9e2518fbb1'::uuid,4),
 ('eb95d7af-16c2-590d-b225-e29b0d69ef2d'::uuid,'grocery-tariffs','person-048','True. I''d compare several products that got the cut with similar products that didn''t.','11e59d8c-31a3-5955-bcd9-6a06fcdfcd1d'::uuid,5),
 ('35ac6c65-b239-5c36-96a4-7feaafaf0ce7'::uuid,'grocery-tariffs','person-271','That would help, especially if the stores show what they paid their suppliers.','eb95d7af-16c2-590d-b225-e29b0d69ef2d'::uuid,6),
 ('9b16620e-5bdc-531f-9874-289922ff0496'::uuid,'grocery-tariffs','person-271','Could the rules be easier to follow for a small importer?',null::uuid,7),
 ('1ee0e6d3-8511-556c-be1d-9f526a41992c'::uuid,'grocery-tariffs','person-081','My grocery bill is due Friday. I''m more interested in relief now than in what a tariff might accomplish in three years.',null::uuid,8),
 ('926f201e-f7c8-5a1a-99f9-a34fa1289dfd'::uuid,'grocery-tariffs','person-038','If the tariff exists to give producers breathing room, how do we know when they''ve had enough?',null::uuid,9),
 ('3a6985db-cb13-5b8e-86ba-62d0ce4e5f36'::uuid,'grocery-tariffs','person-102','Leave fresh produce alone during the local harvest and revisit it in winter.',null::uuid,10),
 ('55fe6f15-8a40-5e95-951c-e67b26793300'::uuid,'grocery-tariffs','person-088','Seasonal rules sound simple until a freeze wipes out the local crop.','3a6985db-cb13-5b8e-86ba-62d0ce4e5f36'::uuid,11),
 ('ac222849-4711-5fd3-b373-b456c8502e96'::uuid,'grocery-tariffs','person-102','Then give stores a way to request a temporary exception.','55fe6f15-8a40-5e95-951c-e67b26793300'::uuid,12),
 ('0342fea9-d87f-5f67-bde8-6473c16c3f97'::uuid,'grocery-tariffs','person-088','If we''re going to keep exceptions, who gets to decide which ones? The biggest producers will have someone in the room. Small shops probably won''t.',null::uuid,13),
 ('4f02e830-ab82-5bf8-8e28-5b0c84d43e4c'::uuid,'grocery-tariffs','person-154','Can someone walk through who pays when a shipment comes in?',null::uuid,14),
 ('97949f5d-339f-5831-a390-8d72d26ea677'::uuid,'grocery-tariffs','person-270','I keep hearing that we can protect farmers by making imports expensive. I''d rather pay for that support through the budget where we can all see the cost.

That also gives us a chance to ask which farms actually need the help.',null::uuid,15),
 ('e7bc3997-4f42-5be9-9d39-4188efd05609'::uuid,'grocery-tariffs','person-035','If shoppers get relief and growers get an adjustment period, I could see a deal.',null::uuid,16),
 ('83c31f54-c01b-5916-a14e-5699f3f495ab'::uuid,'grocery-tariffs','person-060','I''m for dropping the tariffs on foods we barely grow here. For crops where growers are making planting decisions months ahead, give them a date they can plan around.',null::uuid,17),
 ('55cd0535-7608-58a5-bb75-b5e2992c8495'::uuid,'grocery-tariffs','person-132','I don''t want a tax meant for luxury products driving up an everyday staple by accident.',null::uuid,18),
 ('4544eae0-2c38-5f0e-9165-e3bbaf44964b'::uuid,'grocery-tariffs','person-121','I buy groceries too, but a cheap season of imports doesn''t help much if the local growers are gone by next year.',null::uuid,19),
 ('45e89fe4-73f8-5a70-9a07-1ef82709bdd5'::uuid,'health-insurance','person-190','Yes. People budget around that monthly premium.',null::uuid,1),
 ('0dad2aea-685a-5a47-bf3c-0193c782c8f4'::uuid,'health-insurance','person-170','I''d start with people facing the steepest jump and see if the design can scale.',null::uuid,2),
 ('2e124a5e-426f-5b8b-b134-06c1c6f16393'::uuid,'health-insurance','person-020','The premium is only half my problem. I can afford the plan and still put off a visit because of the deductible.',null::uuid,3),
 ('2c5d1f5b-5762-5e5f-859d-c2aaf652977f'::uuid,'health-insurance','person-106','Wouldn''t smaller deductibles just push the premiums back up?','2e124a5e-426f-5b8b-b134-06c1c6f16393'::uuid,4),
 ('f25fb8f8-5edb-5689-930e-d039e63b8178'::uuid,'health-insurance','person-020','They could. I''d compare the yearly cost for someone who actually uses the plan.','2c5d1f5b-5762-5e5f-859d-c2aaf652977f'::uuid,5),
 ('c1acfe5a-070c-5e5b-aca2-ce358eb35a72'::uuid,'health-insurance','person-106','That comparison would be more useful to me than the monthly price alone.','f25fb8f8-5edb-5689-930e-d039e63b8178'::uuid,6),
 ('452c0ae3-3429-52be-b17d-57d3e49ed00c'::uuid,'health-insurance','person-106','I would ask how the plan handles an income change halfway through the year.',null::uuid,7),
 ('991f518b-1a7f-5100-b989-8c9cbf9fb04e'::uuid,'health-insurance','person-031','I''d renew the help for a year while Congress works on prices. The hospital billing problem won''t be resolved by the next enrollment deadline.

Give people a date and a clear estimate of what next year''s coverage will cost them.',null::uuid,8),
 ('6552ccb8-1326-585f-be96-0c76e2e6fb5e'::uuid,'health-insurance','person-187','If a proposal saves money on premiums, I''d also ask whether it changes which plans stay available.',null::uuid,9),
 ('4a0313d8-835f-5f40-add6-6aa8a05d9c3c'::uuid,'health-insurance','person-220','How about a smaller credit that lasts? The annual cliff is exhausting.',null::uuid,10),
 ('384a9996-0aea-54f3-bace-1eee78d0338e'::uuid,'health-insurance','person-121','A smaller credit still leaves some people facing a bill they can''t pay.','4a0313d8-835f-5f40-add6-6aa8a05d9c3c'::uuid,11),
 ('b471ca3c-e3ef-5a9d-af23-ca4a7e11704f'::uuid,'health-insurance','person-220','I''d taper it with income. I care as much about avoiding a sudden drop as the dollar amount.','384a9996-0aea-54f3-bace-1eee78d0338e'::uuid,12),
 ('4a4fa7d2-0814-570b-bb55-af07d9eb207f'::uuid,'health-insurance','person-121','Would anyone choose a narrower provider network if it meant keeping their current monthly payment?',null::uuid,13),
 ('88e853bc-a8d4-57fe-b59e-2f3b7167b373'::uuid,'health-insurance','person-126','A person between jobs may need a different kind of help than someone buying insurance year after year.',null::uuid,14),
 ('cf0217b9-d18d-52fe-b724-e3894c1180c9'::uuid,'health-insurance','person-047','I’d put the money into cheaper plans with smaller networks. I know that’s a tough sell in a rural county where there might be one specialist.',null::uuid,15),
 ('da0b1e61-4b18-50b2-8db9-75a3e1a7dce2'::uuid,'health-insurance','person-093','I''d like a cost estimate per household alongside the estimate for the whole program.',null::uuid,16),
 ('8f92564c-5322-5321-89b3-6555a9f09c81'::uuid,'health-insurance','person-176','I''m wary of another temporary extension. At some point you have to say what it costs over ten years and where the money comes from.',null::uuid,17),
 ('3be4d982-e0e1-5124-8a43-808020488221'::uuid,'health-insurance','person-040','Can existing credits reach people with very low incomes in every state?',null::uuid,18),
 ('dda269af-b6e3-525a-a20d-013223c3a8a2'::uuid,'health-insurance','person-083','What happens to someone who gets a small raise and loses a big chunk of the credit?',null::uuid,19),
 ('a5e5be64-a291-5fb4-9de6-61e08e3fcd42'::uuid,'health-insurance','person-299','What would it take to simplify the forms so more eligible people can actually get help?',null::uuid,20),
 ('94882359-a7aa-5c7d-93f4-afc885eeea33'::uuid,'health-insurance','person-139','I want help for people close to losing their coverage. I’m less sold on making the broader subsidies permanent.',null::uuid,21),
 ('3c9ab02e-ebe9-5f07-b072-b6927e5f1e67'::uuid,'health-insurance','person-238','Both sides seem to agree coverage should be affordable even when you change jobs.',null::uuid,22),
 ('0e5e2213-e01f-53db-92c2-9754deb4d1b8'::uuid,'teen-autoplay','person-096','Give me the off switch too. I''m 38.',null::uuid,1),
 ('5d8cd069-ed0e-51d8-8012-6392e27327ce'::uuid,'teen-autoplay','person-135','Should platforms have to show teens how many times autoplay sent them to a new video?',null::uuid,2),
 ('5c4bf6d9-118c-5eb8-83bd-dfe100c7175a'::uuid,'teen-autoplay','person-181','I use a playlist to follow a full drawing lesson. Having to tap every two minutes would make that harder, especially with paint all over my hands.',null::uuid,3),
 ('bf7adade-2230-5c86-b5ff-a4fe33c68b43'::uuid,'teen-autoplay','person-174','A drawing playlist feels different from a feed that keeps picking new clips.','5c4bf6d9-118c-5eb8-83bd-dfe100c7175a'::uuid,4),
 ('98b43805-15aa-504a-8976-e4ec3e0d03f5'::uuid,'teen-autoplay','person-181','It does. My worry is that a broad rule would treat them the same.','bf7adade-2230-5c86-b5ff-a4fe33c68b43'::uuid,5),
 ('80189ae1-7c5c-5aff-b172-e09d4c125c4b'::uuid,'teen-autoplay','person-174','Then I''d keep autoplay for playlists the viewer deliberately starts.','98b43805-15aa-504a-8976-e4ec3e0d03f5'::uuid,6),
 ('798127a9-0e03-5112-a510-2dfd80e3f814'::uuid,'teen-autoplay','person-174','A button that says Play next sounds like enough of a pause to think about it.',null::uuid,7),
 ('b2968cf2-e56d-56ca-bf2e-6243ff75f01d'::uuid,'teen-autoplay','person-120','I''d distinguish between the next video in a playlist you picked and an endless stream the app picked.

The first helps you finish something. The second makes it hard to tell when you''re done.',null::uuid,8),
 ('69dac439-2d86-5c02-8047-f02f0e163868'::uuid,'teen-autoplay','person-240','My issue is bedtime. I''d take a setting that stops the stream at a time we agree on.',null::uuid,9),
 ('07b37447-001a-5d54-a7f2-7dd809922a95'::uuid,'teen-autoplay','person-147','Our family can decide, sure. But changing one setting on every app after every update is a lot of work for a parent.',null::uuid,10),
 ('d7dc8d44-77a8-522f-b1e1-119e81ad0969'::uuid,'teen-autoplay','person-040','Why should every family have to accept the same default?','07b37447-001a-5d54-a7f2-7dd809922a95'::uuid,11),
 ('ce910dbc-6cd9-5c3f-8f4f-6002d0e6ef7a'::uuid,'teen-autoplay','person-147','They could choose a different setting. An off default just gives families a starting point.','d7dc8d44-77a8-522f-b1e1-119e81ad0969'::uuid,12),
 ('3e18b9e6-5a3b-56b1-8060-f8ace56c78d3'::uuid,'teen-autoplay','person-040','This feels like something families can decide.',null::uuid,13),
 ('77527090-9c67-57a7-a9f6-335372235116'::uuid,'teen-autoplay','person-196','I''d let families make household choices as long as every option is easy to find.',null::uuid,14),
 ('76c65ab4-38f2-5516-8c89-83b0ca99b84c'::uuid,'teen-autoplay','person-123','How does the app know who''s under 16? I wouldn''t upload my kid''s ID just to change this setting.',null::uuid,15),
 ('33eea032-6890-579b-9aa1-1bf97d274363'::uuid,'teen-autoplay','person-179','I wonder if pauses between videos would matter as much as turning off late-night notifications.',null::uuid,16),
 ('6d69ba3a-4a85-55d3-a377-cc155beaebf4'::uuid,'teen-autoplay','person-143','Default it off. Kids who want another video already know where the play button is.',null::uuid,17),
 ('24085cbe-9cd6-5c74-b4b6-588a377d80aa'::uuid,'teen-autoplay','person-202','I''d like the debate to include teenagers who use these apps every day.',null::uuid,18),
 ('ba62de57-d252-58c1-b8ec-d4f87bb4294c'::uuid,'iran-war-powers','person-031','Yes. Put every member''s vote on the record.',null::uuid,1),
 ('ea9351a3-3d14-50e4-9163-167c0357a865'::uuid,'iran-war-powers','person-254','My answer hinges on how much room is left for diplomacy and who oversees that plan.',null::uuid,2),
 ('c213aa47-62cc-50af-bafb-81b262976f1b'::uuid,'iran-war-powers','person-112','I worry a rigid deadline would give the other side an incentive to wait out the vote. I''d want a way to extend it briefly if troops are in immediate danger.',null::uuid,3),
 ('cfb30ead-4adb-5dd5-ae86-55defef02080'::uuid,'iran-war-powers','person-188','If there’s always an exception for danger, what stops the exception from lasting months?','c213aa47-62cc-50af-bafb-81b262976f1b'::uuid,4),
 ('ea603edc-73c5-5351-b407-548290108c59'::uuid,'iran-war-powers','person-112','Give the extension its own short expiration and say what it covers.','cfb30ead-4adb-5dd5-ae86-55defef02080'::uuid,5),
 ('9c493041-e82b-589d-964b-78cbd9fe81b4'::uuid,'iran-war-powers','person-188','I could live with that if Congress still has to vote on the wider mission.','ea603edc-73c5-5351-b407-548290108c59'::uuid,6),
 ('fa6d6a1f-c2d4-5d9e-9321-46ed53ae2e48'::uuid,'iran-war-powers','person-188','What choice does a voter have if the president and Congress blame each other for the next decision?',null::uuid,7),
 ('bebfd1da-66e7-5809-8208-31227a082498'::uuid,'iran-war-powers','person-068','Give Congress a deadline and let classified briefings cover sensitive details. The public should still hear the basic objective, the expected cost and when lawmakers have to vote again.

Otherwise a broad authorization can become a blank check for the next president too.',null::uuid,8),
 ('1237710c-79bc-5d6e-a17e-977f6733cc1c'::uuid,'iran-war-powers','person-102','I have more trust in a decision that explains the costs along with the goal.',null::uuid,9),
 ('362afcc7-7139-5b86-80b3-527456a20699'::uuid,'iran-war-powers','person-220','Members can already demand answers. I''d like to see them use the authority they have.',null::uuid,10),
 ('99c1eff5-b83d-5155-8c24-c6f8040b463b'::uuid,'iran-war-powers','person-207','Hearings can get answers. I still want a vote on whether a campaign continues.','362afcc7-7139-5b86-80b3-527456a20699'::uuid,11),
 ('c2c919ad-6728-5a86-b6c6-dcd24fb1642e'::uuid,'iran-war-powers','person-220','I''d want both. Give lawmakers the facts before making them take a position.','99c1eff5-b83d-5155-8c24-c6f8040b463b'::uuid,12),
 ('d7c1a9e3-df34-500d-9b91-8551ae3181b4'::uuid,'iran-war-powers','person-207','Would a time-limited authorization make compromise more likely?',null::uuid,13),
 ('13fe6222-640e-5c1f-ac26-ae48a78584bf'::uuid,'iran-war-powers','person-299','A regular report would make it easier for voters to understand why leaders picked a course of action.',null::uuid,14),
 ('b02e701c-b489-517e-bedc-bad9f9159e70'::uuid,'iran-war-powers','person-264','Would the authorization include a requirement to come back for a new vote if the mission expands?',null::uuid,15),
 ('10400f4e-2831-53f0-9f62-e18c357d7464'::uuid,'iran-war-powers','person-186','A public disagreement can be uncomfortable. I''d still rather hear the reasoning on the record.',null::uuid,16),
 ('2b404828-579c-5abb-ac5f-6f408929a0ce'::uuid,'iran-war-powers','person-123','I’d let the executive handle a short operation and require a vote for anything that becomes a campaign.',null::uuid,17),
 ('c0ba7513-58cc-536d-a2c9-db361dc92cbb'::uuid,'iran-war-powers','person-174','I understand why someone would prefer flexibility. I''d be willing to define an emergency in more detail.',null::uuid,18),
 ('a78ab431-ed9f-5ce4-b69b-2eb7207c8656'::uuid,'iran-war-powers','person-202','Okay, but what''s the goal we''re voting on? “Keep going” doesn''t tell me what success looks like.',null::uuid,19),
 ('4c703c36-a1fb-5bbc-afd8-cc2d3d4e7832'::uuid,'iran-war-powers','person-251','If the authority is broad, I''d want regular hearings so the public can follow the policy.',null::uuid,20),
 ('1319bcd3-a435-5bee-9349-b08aaf820f43'::uuid,'iran-war-powers','person-030','A commander has to protect troops in an emergency. Congress can still decide whether the fighting continues after that emergency.',null::uuid,21),
 ('eaf745ab-f09a-5504-a2f5-5ccf3db0ab03'::uuid,'federal-gas-tax','person-013','How much would I actually save on one fill-up?',null::uuid,1),
 ('ffdf6907-cdb7-5602-9edc-cae0e39df773'::uuid,'federal-gas-tax','person-241','The idea is easier to support if Congress puts the road replacement funding in the same bill.',null::uuid,2),
 ('0dd365cf-2131-5f2e-81b2-99bea3748dd4'::uuid,'federal-gas-tax','person-236','If stations don''t pass through the whole cut, we give up road money and still pay almost the same at the pump.',null::uuid,3),
 ('61d25024-15a5-56ea-90f4-e185f4c60d31'::uuid,'federal-gas-tax','person-177','Stations down the street compete with each other. Why wouldn''t they pass it through?','0dd365cf-2131-5f2e-81b2-99bea3748dd4'::uuid,4),
 ('f5e0bd33-160c-559b-9dba-fa9b3aabb4b8'::uuid,'federal-gas-tax','person-236','They might. I''d want to see how quickly prices move and by how much.','61d25024-15a5-56ea-90f4-e185f4c60d31'::uuid,5),
 ('666f9568-1bcc-5382-8efa-1b5bdec5c830'::uuid,'federal-gas-tax','person-177','Fair enough. I''d especially want to see what happens in towns with only one station.','f5e0bd33-160c-559b-9dba-fa9b3aabb4b8'::uuid,6),
 ('a4d9f178-0d5c-54e9-8b1c-b6e796a72bf2'::uuid,'federal-gas-tax','person-177','I''d compare it with targeted relief and see which gets more help to people on tight budgets.',null::uuid,7),
 ('2d8eb889-ebd2-5d23-8e4f-2107b7ee9596'::uuid,'federal-gas-tax','person-079','I''d keep the revenue and give temporary help to households that spend a big share of their income commuting.

The catch is that people need the money while prices are high. A credit that arrives next spring doesn''t do much for this week''s bill.',null::uuid,8),
 ('d3336ecf-edfa-5787-a9e8-1f7f89469ffe'::uuid,'federal-gas-tax','person-192','I drive very little in this scenario, so I''d care more about the bridge funding than the price per gallon.',null::uuid,9),
 ('c6dde0bd-246c-522c-9811-e6271bfa474c'::uuid,'federal-gas-tax','person-292','I''d support a short pause if Congress replaces every dollar it takes from road repairs and sets an end date now.',null::uuid,10),
 ('a0c67aa4-fff1-535f-8d36-80306d8da510'::uuid,'federal-gas-tax','person-101','Where does the replacement road money come from?','c6dde0bd-246c-522c-9811-e6271bfa474c'::uuid,11),
 ('394328c7-f380-5a16-b2fc-37d735e0c917'::uuid,'federal-gas-tax','person-292','That should be in the same bill. If lawmakers can''t name a source, I''d drop the pause.','a0c67aa4-fff1-535f-8d36-80306d8da510'::uuid,12),
 ('f386c84a-3aba-5919-8095-527164cd6e09'::uuid,'federal-gas-tax','person-101','Anyone who barely drives gets almost nothing out of it.',null::uuid,13),
 ('440011e5-3ec0-5798-abb8-4f39b21e9578'::uuid,'federal-gas-tax','person-090','Maybe the policy should expire when prices fall back below the original trigger.',null::uuid,14),
 ('fae87574-176e-5f6b-b717-331400a33c35'::uuid,'federal-gas-tax','person-038','Please just fix the roads near me.',null::uuid,15),
 ('7bcbf611-0ea9-5697-8434-9b0a17cae605'::uuid,'federal-gas-tax','person-030','If the federal tax pauses, do state gas taxes keep working the same way?',null::uuid,16),
 ('4bb85d66-3101-558c-864b-e8c776e77b4e'::uuid,'federal-gas-tax','person-008','What would trigger the pause? A nationwide average misses the fact that prices swing a lot by region.',null::uuid,17),
 ('6d918e33-98d6-56bd-ac25-a38661d542af'::uuid,'federal-gas-tax','person-006','Can we show past prices with and without the federal tax for scale?',null::uuid,18),
 ('537e7cfe-1d70-5ee3-b594-4a57478fafdb'::uuid,'federal-gas-tax','person-031','I''d take a few dollars back this week. I drive to work before the buses start running.',null::uuid,19),
 ('35860a09-52df-5110-8430-9e480183b3d7'::uuid,'federal-gas-tax','person-151','I''d want a simple report afterward on how much people saved and how much revenue was lost.',null::uuid,20),
 ('95d7c310-67a4-5fea-8de3-43efff2d5648'::uuid,'office-land-housing','person-258','Apartments near jobs make sense to me.',null::uuid,1),
 ('6c6f63ed-1b86-5b94-84e6-7d1352ee8287'::uuid,'office-land-housing','person-202','A safe walking route from home to work seems like a win worth designing for.',null::uuid,2),
 ('b5bfc47f-ad3e-5884-bdbf-acba2942388f'::uuid,'office-land-housing','person-236','I’d allow it near transit and grocery stores. A strip of offices on a six-lane road with no sidewalk needs a different plan.',null::uuid,3),
 ('5734ec15-423c-543e-9f1f-f542f3008ef2'::uuid,'office-land-housing','person-173','If we wait for sidewalks and stores, people may never get the housing.','b5bfc47f-ad3e-5884-bdbf-acba2942388f'::uuid,4),
 ('b4afa818-8172-54fc-a7e9-bc9870dcfeab'::uuid,'office-land-housing','person-236','Allow the housing and make the road crossing part of the project.','5734ec15-423c-543e-9f1f-f542f3008ef2'::uuid,5),
 ('ab0fa77a-c37e-5f0c-93e4-1004ac569a5d'::uuid,'office-land-housing','person-173','That works if the crossing is open by move-in day.','b4afa818-8172-54fc-a7e9-bc9870dcfeab'::uuid,6),
 ('e9642ac8-0e4e-5140-b616-5b29e7567f28'::uuid,'office-land-housing','person-173','I''d be more inclined to say yes if the site keeps a corner for shops.',null::uuid,7),
 ('d6735f5d-466a-5153-9a22-a683cf864bb7'::uuid,'office-land-housing','person-223','Try it on the lots that have sat empty longest.

I''d ask the developer for a safe path to the nearest bus stop and enough housing at prices that people working nearby can actually pay.',null::uuid,8),
 ('7ba24dff-69d3-55d0-9a07-132ff8f7d31f'::uuid,'office-land-housing','person-196','Mixed-use would be my first choice. Give people a place to live and a couple of useful stores at street level.',null::uuid,9),
 ('468a4efb-18a1-5570-9ddf-5f12396317c6'::uuid,'office-land-housing','person-283','Keeping an empty parking lot because the map says “office” feels like a waste.',null::uuid,10),
 ('f6219909-570d-52e8-b823-6e22a3c44337'::uuid,'office-land-housing','person-013','Some of those lots may fill up again. Who decides what''s truly vacant?','468a4efb-18a1-5570-9ddf-5f12396317c6'::uuid,11),
 ('fbb757e6-55c8-52be-b28d-d19bf15c71e7'::uuid,'office-land-housing','person-283','Start with lots that have been empty for years and publish how they''re picked.','f6219909-570d-52e8-b823-6e22a3c44337'::uuid,12),
 ('f2e98561-32c6-5745-8292-fb59e71a974a'::uuid,'office-land-housing','person-013','If the schools are full today, show me where the extra seats will come from.',null::uuid,13),
 ('3bec66c0-0172-528a-9244-0b86bdf8c737'::uuid,'office-land-housing','person-267','What is the tradeoff if small businesses rely on deliveries at hours the new neighbors find disruptive?',null::uuid,14),
 ('5e635e28-6cdb-5203-8e27-18a31d36be2f'::uuid,'office-land-housing','person-106','My concern is what happens to small businesses when every cheap office lot turns into expensive housing.',null::uuid,15),
 ('28cf605e-c826-56ea-8316-39cf3af1b9e3'::uuid,'office-land-housing','person-120','I''d ask how many apartments the new rule would realistically add.',null::uuid,16),
 ('d09c8896-5417-5b8d-a631-5b4a74b0c105'::uuid,'office-land-housing','person-240','Check the bus schedule before calling it walkable.',null::uuid,17),
 ('cd72688a-bd76-5bf7-920f-cdee87aff1b8'::uuid,'immigration-bill','person-202','Two votes. Let people see where their lawmakers stand.',null::uuid,1),
 ('0e6b160a-494c-5a4c-93c7-5493c775a38f'::uuid,'immigration-bill','person-080','I''d like the debate to say what would count as a good outcome for both parts.',null::uuid,2),
 ('548f9baf-12e0-5221-ad42-b75f31f5df9a'::uuid,'immigration-bill','person-225','A single bill can still have different start dates. I''d want the application process and staffing spelled out before anyone is told to sign up.',null::uuid,3),
 ('524d3b6f-5244-561d-a004-5593181ebe90'::uuid,'immigration-bill','person-271','Different start dates could mean one part takes effect while the other keeps getting delayed.','548f9baf-12e0-5221-ad42-b75f31f5df9a'::uuid,4),
 ('ea848bea-9fdd-503c-86d2-76a1f636185c'::uuid,'immigration-bill','person-225','That''s why I''d put dates and staffing commitments in the bill itself.','524d3b6f-5244-561d-a004-5593181ebe90'::uuid,5),
 ('11673b27-fa71-50be-be19-3961f97f2394'::uuid,'immigration-bill','person-271','I''d also ask Congress to publish progress on both parts so we can see what''s slipping.','ea848bea-9fdd-503c-86d2-76a1f636185c'::uuid,6),
 ('1903c71c-f38b-586f-bc4a-5a596f2b0318'::uuid,'immigration-bill','person-271','Could a bill lay out a plan for processing applications as well as deciding who''s eligible?',null::uuid,7),
 ('ff67dc31-0db2-5267-a7ac-f948d81d9a64'::uuid,'immigration-bill','person-035','I''d take a narrower bill that can actually pass. I''ve watched big packages fall apart over one provision too many times.

If Congress splits it, schedule both votes up front so the second one can''t simply disappear.',null::uuid,8),
 ('ffb5924c-584f-589a-9bd3-cd164b57bf6e'::uuid,'immigration-bill','person-254','I wonder how long the text would be and whether people would have time to read what was added.',null::uuid,9),
 ('4d01dcec-acd1-514a-a3c4-d4fa2c4fb83a'::uuid,'immigration-bill','person-220','A combined bill makes sense if the two parts can work independently after it passes. One missed hiring deadline shouldn''t freeze everything else.',null::uuid,10),
 ('38b81195-31e7-52e5-ba9a-dee57356a4eb'::uuid,'immigration-bill','person-186','If the parts can work independently, why bundle them at all?','4d01dcec-acd1-514a-a3c4-d4fa2c4fb83a'::uuid,11),
 ('3b85de2c-add1-5eda-8cfb-fef90a3833b6'::uuid,'immigration-bill','person-220','The votes to pass them may depend on each other. The agencies can still run them separately.','38b81195-31e7-52e5-ba9a-dee57356a4eb'::uuid,12),
 ('415c8bf6-edd4-5cf0-9ccf-12de3b0085a6'::uuid,'immigration-bill','person-186','I can see an argument for linking the policies if it makes a deal last past the next election.',null::uuid,13),
 ('55fee610-b45c-5af7-8694-ddb6e7e64b00'::uuid,'immigration-bill','person-270','What measures would tell us the border provision was working?',null::uuid,14),
 ('ab42b510-f0ed-572c-9049-6b3a576a13a7'::uuid,'immigration-bill','person-047','I''d want the bill to say clearly who qualifies and who handles appeals.',null::uuid,15),
 ('05a2280f-b274-5246-8e20-06b44e8d1c4e'::uuid,'immigration-bill','person-154','A careful rollout matters whether the two pieces are in one bill or two.',null::uuid,16),
 ('ab4fca11-ab3f-52c2-b846-a09e655a3c55'::uuid,'immigration-bill','person-177','I''d start with quicker hearings. Waiting years helps almost nobody.',null::uuid,17),
 ('a2848a22-84d4-557f-84c1-5d32d0b7c431'::uuid,'immigration-bill','person-176','If one measure has support already, should it wait for another one that needs more work?',null::uuid,18),
 ('b0bea07d-e7dd-5c5d-a775-be05d1110368'::uuid,'immigration-bill','person-102','I care more about clear eligibility than how many bills it takes.',null::uuid,19),
 ('b3296738-1fe9-5036-9576-4cb210ccee30'::uuid,'immigration-bill','person-299','I''d look at what happens to families during the gap between passing a law and starting a new process.',null::uuid,20),
 ('9b9c5899-8d72-5362-add7-82ee08f21b07'::uuid,'immigration-bill','person-139','Who''s handling the backlog while the new rules roll out?',null::uuid,21),
 ('17b563ef-bb38-52cf-acd5-0b118127d679'::uuid,'immigration-bill','person-187','If it takes years to meet a milestone, does that mean the other half is on hold all that time?',null::uuid,22),
 ('79ac490b-f0c8-5b74-b647-af09ab3903e8'::uuid,'immigration-bill','person-133','I''d keep them together. Each side is more likely to follow through when both parts are in the same agreement.',null::uuid,23),
 ('2f464cfe-6a7f-55ac-a6dd-d868a8c9d9c3'::uuid,'fossil-fuel-deadline','person-208','Yes, give utilities a date they can plan around.',null::uuid,1),
 ('29c16a46-af7e-5e39-a921-853b38a6f5e5'::uuid,'fossil-fuel-deadline','person-267','I''d start the discussion by asking what countries can commit to this decade.',null::uuid,2),
 ('092d7b37-84de-58f6-9b38-515d20cf3ee2'::uuid,'fossil-fuel-deadline','person-068','I''d start with a shared target for coal and let the timelines for gas vary with the grid.',null::uuid,3),
 ('d534381e-4481-5609-a49e-871ecc320bb5'::uuid,'fossil-fuel-deadline','person-177','A later gas deadline could become an excuse to build plants that run for decades.','092d7b37-84de-58f6-9b38-515d20cf3ee2'::uuid,4),
 ('1f9c10f2-921c-54fb-a0b1-ef8a8acd4553'::uuid,'fossil-fuel-deadline','person-068','Then distinguish new plants from ones already keeping the lights on.','d534381e-4481-5609-a49e-871ecc320bb5'::uuid,5),
 ('4ce3205f-be81-5a92-aa26-b8bf2d80aa37'::uuid,'fossil-fuel-deadline','person-177','I''d put that distinction in the agreement so the exception has an endpoint.','1f9c10f2-921c-54fb-a0b1-ef8a8acd4553'::uuid,6),
 ('db5b01eb-6962-5672-ac44-b462c5624ca9'::uuid,'fossil-fuel-deadline','person-177','I''d like to see how a community around one large employer would handle the change.',null::uuid,7),
 ('1351692a-2c0f-59c4-b518-18bfceef03cf'::uuid,'fossil-fuel-deadline','person-139','I''d back a shared deadline if wealthier countries help finance the switch and actually deliver the money.

If that support comes late, the agreement needs a way to help a country catch up without making households absorb the whole cost.',null::uuid,8),
 ('f49e96ec-835a-52f0-989e-6883af3a9506'::uuid,'fossil-fuel-deadline','person-088','A country still expanding access to electricity should be part of deciding what an achievable plan looks like.',null::uuid,9),
 ('132fbb59-cf3e-516e-8681-6376a3f32292'::uuid,'fossil-fuel-deadline','person-196','I work around heavy equipment. I''d like to see a plan for backup power and parts before anyone announces a shutdown date.',null::uuid,10),
 ('43f36624-b42f-5b4d-a39e-5468a9a0224c'::uuid,'fossil-fuel-deadline','person-261','Does backup power have to use the same fuel as the main system?','132fbb59-cf3e-516e-8681-6376a3f32292'::uuid,11),
 ('7b4e880a-6fc2-524d-a2d2-4ce3983ce285'::uuid,'fossil-fuel-deadline','person-196','No. I''d want to see what can run long enough during an outage and how we''d keep it supplied.','43f36624-b42f-5b4d-a39e-5468a9a0224c'::uuid,12),
 ('5a19dee5-3cc6-581f-a3fe-1a07f19ce5ca'::uuid,'fossil-fuel-deadline','person-261','Waiting for every alternative to be perfect also has a cost. I''d set the date and review progress every few years.',null::uuid,13),
 ('21ac04bf-dee2-5d51-bd27-cf4bfcfe6333'::uuid,'fossil-fuel-deadline','person-221','I''d want the plan to spell out what counts as meeting the deadline.',null::uuid,14),
 ('dd6526b6-62e4-5623-8e3b-98bcf8cc9c44'::uuid,'fossil-fuel-deadline','person-292','Some places will promise anything at a summit. What would we measure next year?',null::uuid,15),
 ('90cf9c12-f148-591b-a5bc-4b0a15cbed74'::uuid,'fossil-fuel-deadline','person-040','The timing might be easier to negotiate if independent reports track progress along the way.',null::uuid,16),
 ('3dc11be9-e5de-5187-bb4d-bdace1f3e681'::uuid,'fossil-fuel-deadline','person-258','Who''s paying for the transmission lines and storage?',null::uuid,17),
 ('cf88ba6f-4ef2-5856-91e3-b742930b561b'::uuid,'fossil-fuel-deadline','person-190','A temporary exception could make sense if everyone knows when it expires.',null::uuid,18),
 ('f6467716-747f-545f-b36d-7e92e4cc44ae'::uuid,'fossil-fuel-deadline','person-151','A deadline means something very different in a country with reliable electricity than it does where many people are still waiting for it.',null::uuid,19),
 ('8e3ea259-4782-5b20-a876-2968cc05d6a6'::uuid,'cloud-outage-backup','person-180','Yes. My team can''t read outage instructions inside the app that''s down.',null::uuid,1),
 ('8c6da564-414d-5170-bc5f-ec20a494fbce'::uuid,'cloud-outage-backup','person-002','I''d try one short drill before paying for a new tool.',null::uuid,2),
 ('ccb4b3e7-a673-5f1d-9041-164ecf359367'::uuid,'cloud-outage-backup','person-088','The big question is whether the backup uses the same login. If the login service is down too, you''re back where you started.',null::uuid,3),
 ('2269b3ff-38eb-58df-b964-f7902afb36a0'::uuid,'cloud-outage-backup','person-228','An independent login is another password people might forget.','ccb4b3e7-a673-5f1d-9041-164ecf359367'::uuid,4),
 ('34b30b0e-896d-58f2-9580-63f15b54b1d6'::uuid,'cloud-outage-backup','person-088','Exactly why I''d run a drill. We''d find out who can actually get in.','2269b3ff-38eb-58df-b964-f7902afb36a0'::uuid,5),
 ('760de11c-a40f-5f51-bbf3-77407de3ced6'::uuid,'cloud-outage-backup','person-228','I''d keep a phone list too for anyone who still gets locked out.','34b30b0e-896d-58f2-9580-63f15b54b1d6'::uuid,6),
 ('9540e8dd-86c3-5841-924b-16b985ab0926'::uuid,'cloud-outage-backup','person-228','How would a new hire find instructions if the normal intranet were down?',null::uuid,7),
 ('3f4dea40-db4f-5522-9693-17307e2fe0e0'::uuid,'cloud-outage-backup','person-148','For a hospital or a dispatch center, pay for a separate system and drill it. A six-person office can probably get by with a call tree.

Either way, try it during an ordinary workday before you count on it in an emergency.',null::uuid,8),
 ('65d21103-16ff-54fd-87c0-c476c00905b6'::uuid,'cloud-outage-backup','person-057','If a service is easy to maintain, I''m more inclined to make it part of the everyday plan.',null::uuid,9),
 ('5f1a06a6-ae5d-5d0f-bdf9-b735799a37d9'::uuid,'cloud-outage-backup','person-225','An SMS notification is fine for “check the status page.” Please keep customer details out of it.',null::uuid,10),
 ('cbb9c2f1-cb78-5894-956c-dda23844f133'::uuid,'cloud-outage-backup','person-177','What if the status page is down too?','5f1a06a6-ae5d-5d0f-bdf9-b735799a37d9'::uuid,11),
 ('e95129ad-9c23-543f-8567-b40d877fa2ff'::uuid,'cloud-outage-backup','person-225','Put the basic next step in the text and keep the status page on a separate service.','cbb9c2f1-cb78-5894-956c-dda23844f133'::uuid,12),
 ('167a9dd0-93a6-5085-8b5f-26eaf7848d72'::uuid,'cloud-outage-backup','person-177','I''d want to make sure the backup is accessible to people who can''t use a voice call.',null::uuid,13),
 ('be42d6cf-05c3-5abb-8d3f-c37906580d2f'::uuid,'cloud-outage-backup','person-168','I''d compare a separate paid service with a well-maintained contact tree.',null::uuid,14),
 ('6e1a8a5f-96ac-559c-8e58-022bbe9781f9'::uuid,'cloud-outage-backup','person-020','What message needs to go out in the first ten minutes?',null::uuid,15),
 ('413f77a5-6fc0-5b16-9331-1c9f3a919b16'::uuid,'cloud-outage-backup','person-085','Employees should know which number or channel to trust before anything breaks.',null::uuid,16),
 ('04635290-c1d9-5e47-bac5-37c25551408b'::uuid,'cloud-outage-backup','person-008','Could we agree who sends the first message? During our last outage three people sent three different instructions.',null::uuid,17),
 ('f0933836-c858-50ce-953a-ed72787fc110'::uuid,'cloud-outage-backup','person-173','A short outage can cost more if customers and staff all rely on the same tool.',null::uuid,18),
 ('924f1223-170d-5ea4-8f7e-62e241dc5c61'::uuid,'cloud-outage-backup','person-174','When the alternative is another app nobody remembers to check, save the money.',null::uuid,19),
 ('212a3e4e-9a04-5181-9468-f1e9d31911be'::uuid,'cloud-outage-backup','person-048','I''d tell people in advance what information belongs in the backup channel and what stays out.',null::uuid,20),
 ('dfa703e1-6244-5e9c-9984-8da75c534acc'::uuid,'cloud-outage-backup','person-181','I don''t want my personal number on a spreadsheet that gets emailed around. Let staff opt in and make it easy to update or remove their number.',null::uuid,21),
 ('bbb090d2-1baf-5ec3-8c71-3e34a2f992f7'::uuid,'cloud-outage-backup','person-292','It might help to write separate plans for an office outage and a regional power outage.',null::uuid,22),
 ('6062a588-f4e3-5410-b2c3-f550ec1e8b84'::uuid,'cloud-outage-backup','person-281','A phone tree and a printed list would do for a shop our size.',null::uuid,23),
 ('c12f1de2-6cd9-5437-98a2-b0e6fb0632eb'::uuid,'cloud-outage-backup','person-179','The best backup for the scenario might be the one people use with the fewest new steps.',null::uuid,24),
 ('b092d762-999d-5b80-8e8b-3576634ec981'::uuid,'poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','person-002','If the same model was cheaper in October, the percentage on the sign tells me very little. I''d start with the price history.',null::uuid,1),
 ('de412b73-e652-5d96-b09b-47e6d5a103a8'::uuid,'poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','person-001','I''d still buy today if it meets the price I set and I can pick it up locally. What would make you stop waiting?','b092d762-999d-5b80-8e8b-3576634ec981'::uuid,2),
 ('e330f066-5df0-5abc-a344-bb464afe7ba4'::uuid,'poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','person-004','The return window changes my answer. If it ends before the gift is opened, an early deal is less appealing.',null::uuid,3),
 ('8ac72376-7883-5d9b-ba46-367e5c53a4cf'::uuid,'poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2','person-006','I''d add delivery and membership fees to both prices. That''s the comparison I want to see.',null::uuid,4),
 ('3da98a2a-0777-5388-9c42-d8eb8041b7cb'::uuid,'iowa-army-detonation','person-193','I’d have gone ahead on Wednesday. At the help desk, waiting for the perfect diagnosis sometimes leaves everybody without a backup. Here the Army said the hazard could go off without warning and moving it was too risky. The better weather and people on the ground made the planned option easier for me to defend.',null::uuid,1),
 ('2d5bf75f-ff93-5ca1-beb2-d5c5f8ce48b0'::uuid,'iowa-army-detonation','person-121','I’m glad the early monitors didn’t pick up lead. My question is why the case for a deadline was so hard to inspect until the last minute. If a short review and clearer instructions could have cut the risk, I’d have wanted them before signing off. I don’t think a no-detection reading settles what might have landed on a farm.','3da98a2a-0777-5388-9c42-d8eb8041b7cb'::uuid,2),
 ('ffc557ff-8142-588b-90fa-b9a2a69fe871'::uuid,'iowa-army-detonation','person-193','Fair. An air monitor can’t tell you everything that happened at ground level. Compare the soils and surfaces to the EPA baseline, publish the map and limits, and say who handles cleanup. I can defend the response on Wednesday and still want answers about the years before it.','2d5bf75f-ff93-5ca1-beb2-d5c5f8ce48b0'::uuid,3),
 ('ef68e520-17f5-518c-9f62-260fd44f2078'::uuid,'iowa-army-detonation','person-121','We’re close on the cleanup. If an independent review shows those extra hours really raised the chance of a surprise explosion, I’ll give the Army more credit for the timing. I’d also like the residents who had to leave to tell us whether the support actually worked.','ffc557ff-8142-588b-90fa-b9a2a69fe871'::uuid,4),
 ('86a8539e-242f-5bda-a558-d58ea0a0003d'::uuid,'iowa-army-detonation','person-153','The first air results are a relief. I look at claims after storms, and I still want to see a table showing which soil and dust samples can be compared to the same places before the blast. A map and a table answer different questions.',null::uuid,5),
 ('84187e0a-329b-5621-8655-2282544c2d1a'::uuid,'iowa-army-detonation','person-074','What would persuade me is follow-up sampling with the locations and detection limits spelled out. An air reading can be reassuring on the day and still leave a question about what settled somewhere else.','86a8539e-242f-5bda-a558-d58ea0a0003d'::uuid,6),
 ('aba5dd57-29be-537d-8847-ec681a4e986a'::uuid,'iowa-army-detonation','person-212','At a farmers market, one vague answer can turn into ten different crop rumors. I’d rather get a plain update that says which local lab results are back, which are pending, and when the next update is due.',null::uuid,7),
 ('8de74bab-d01c-5cb1-a7d6-f3c9cb82556f'::uuid,'iowa-army-detonation','person-034','Giving a date is useful, but give people an update time too. When a plan moves, a person about to start a shift needs to know when to check again and whether their arrangements still make sense.',null::uuid,8),
 ('b61bc9f7-f4e9-5e1a-af95-b974491e9044'::uuid,'iowa-army-detonation','person-200','I’d like an after-action review to include the people who made the closure and reopening calls at schools and other public buildings. What information reached them, and what did they have to guess?','8de74bab-d01c-5cb1-a7d6-f3c9cb82556f'::uuid,9),
 ('0a1c59d7-e340-5f6c-8e0e-decdf43035a3'::uuid,'iowa-army-detonation','person-241','I think moving the operation to a better window was defensible. I’d still read a timeline of when the Army identified the issue, who was told and when alternatives were rejected. Those records would let us argue about the decision with something firmer than a hunch.',null::uuid,10)
)
insert into dk_editorial.discussion_comments(id,slug,persona_id,excerpt,parent_id,sort_order,created_at)
select c.id,c.slug,c.persona,c.body,c.parent_id,c.sort_order,coalesce(p.published_at,p.created_at)
from comments c join public.dk_infographics p on p.slug=c.slug
on conflict(id) do update set persona_id=excluded.persona_id,excerpt=excluded.excerpt,
  parent_id=excluded.parent_id,sort_order=excluded.sort_order,created_at=excluded.created_at;

-- Persist each account's debate impression and any support it gave. An impression and a
-- support on the same poster can only count once each for a bot account.
with audience(persona,liked) as (values
 ('person-011',false),
 ('person-015',false),
 ('person-018',false),
 ('person-030',true),
 ('person-031',false),
 ('person-032',false),
 ('person-034',true),
 ('person-039',false),
 ('person-042',false),
 ('person-043',false),
 ('person-044',false),
 ('person-046',false),
 ('person-049',false),
 ('person-057',false),
 ('person-060',false),
 ('person-068',false),
 ('person-074',true),
 ('person-089',false),
 ('person-097',false),
 ('person-110',false),
 ('person-115',false),
 ('person-118',false),
 ('person-119',false),
 ('person-121',true),
 ('person-124',false),
 ('person-138',false),
 ('person-139',false),
 ('person-153',true),
 ('person-154',false),
 ('person-157',false),
 ('person-160',true),
 ('person-163',false),
 ('person-169',false),
 ('person-170',false),
 ('person-176',false),
 ('person-178',false),
 ('person-188',false),
 ('person-193',true),
 ('person-196',true),
 ('person-198',false),
 ('person-200',true),
 ('person-203',false),
 ('person-211',false),
 ('person-212',true),
 ('person-213',false),
 ('person-214',false),
 ('person-223',false),
 ('person-224',false),
 ('person-228',false),
 ('person-236',false),
 ('person-240',false),
 ('person-241',true),
 ('person-292',false),
 ('person-296',false),
 ('person-298',true)
)
insert into dk_editorial.poster_activity(slug,persona,liked,created_at)
select p.slug,a.persona,a.liked,coalesce(p.published_at,p.created_at)
from audience a cross join public.dk_infographics p where p.slug='iowa-army-detonation'
on conflict(slug,persona) do update set liked=poster_activity.liked or excluded.liked;

-- Black Friday can already have stored actions. Fill only a shortfall in bot support.
with poster as (
  select p.slug,p.published_at,(select count(*) from dk_editorial.poster_activity a where a.slug=p.slug and a.liked) as supported
  from public.dk_infographics p where p.slug='poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2' and p.published_at<=now()
), audience as (
  select p.slug,p.published_at,b.id
  from poster p cross join dk_editorial.bot_accounts b
  where not exists(select from dk_editorial.poster_activity a where a.slug=p.slug and a.persona=b.id and a.liked)
  order by md5(p.slug||':support:'||b.id),b.id
  limit greatest(0,8-coalesce((select supported from poster),0))
)
insert into dk_editorial.poster_activity(slug,persona,liked,created_at)
select slug,id,true,published_at from audience
on conflict(slug,persona) do update set liked=true;

create table dk_editorial.bot_comment_support(
  persona text references dk_editorial.bot_accounts(id),
  comment_id uuid references dk_editorial.discussion_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(persona,comment_id)
);
create index bot_comment_support_comment on dk_editorial.bot_comment_support(comment_id);
alter table dk_editorial.bot_comment_support enable row level security;
revoke all on dk_editorial.bot_comment_support from public,anon,authenticated;
insert into dk_editorial.bot_comment_support(persona,comment_id,created_at)
select s.persona,c.id,c.created_at from (values
 ('person-030','3da98a2a-0777-5388-9c42-d8eb8041b7cb'::uuid),
 ('person-153','3da98a2a-0777-5388-9c42-d8eb8041b7cb'::uuid),
 ('person-196','3da98a2a-0777-5388-9c42-d8eb8041b7cb'::uuid),
 ('person-034','2d5bf75f-ff93-5ca1-beb2-d5c5f8ce48b0'::uuid),
 ('person-074','2d5bf75f-ff93-5ca1-beb2-d5c5f8ce48b0'::uuid),
 ('person-193','2d5bf75f-ff93-5ca1-beb2-d5c5f8ce48b0'::uuid),
 ('person-121','86a8539e-242f-5bda-a558-d58ea0a0003d'::uuid),
 ('person-200','86a8539e-242f-5bda-a558-d58ea0a0003d'::uuid),
 ('person-241','86a8539e-242f-5bda-a558-d58ea0a0003d'::uuid),
 ('person-034','aba5dd57-29be-537d-8847-ec681a4e986a'::uuid),
 ('person-153','aba5dd57-29be-537d-8847-ec681a4e986a'::uuid),
 ('person-298','aba5dd57-29be-537d-8847-ec681a4e986a'::uuid),
 ('person-160','8de74bab-d01c-5cb1-a7d6-f3c9cb82556f'::uuid),
 ('person-193','8de74bab-d01c-5cb1-a7d6-f3c9cb82556f'::uuid),
 ('person-196','0a1c59d7-e340-5f6c-8e0e-decdf43035a3'::uuid),
 ('person-212','0a1c59d7-e340-5f6c-8e0e-decdf43035a3'::uuid),
 ('person-121','84187e0a-329b-5621-8655-2282544c2d1a'::uuid),
 ('person-212','84187e0a-329b-5621-8655-2282544c2d1a'::uuid)
) s(persona,comment_id) join dk_editorial.discussion_comments c on c.id=s.comment_id
where s.persona<>c.persona_id
on conflict do nothing;


create function dk_editorial.rank_posters(p_personalize boolean,p_bot_comments boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable set search_path='' as $$
 with picks as (
   select coalesce((select selected from public.dk_member_feed_interests where owner_id=(select auth.uid())), '{}') as ids
   where p_personalize
 )
 select p.slug,p.title,p.category,p.artwork is not null,p.published_at<=now(),p.owner_id=auth.uid(),
 l.total+seed.likes,(select count(*) from public.dk_infographic_comments c where c.slug=p.slug)
   +case when p_bot_comments and p.published_at<=now() then
     (select count(*) from dk_editorial.discussion_comments c where c.slug=p.slug and c.persona_id is not null) else 0 end,
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

-- Keep previously deployed clients on their existing comment-count contract.
create or replace function dk_editorial.rank_posters(p_personalize boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable set search_path='' as $$
  select * from dk_editorial.rank_posters(p_personalize,false);
$$;

create or replace function public.dk_member_comment_likes(p_kind text,p_ids uuid[])
returns table(id uuid,likes bigint,liked boolean,mine boolean) language sql stable security definer set search_path='' as $$
 select v.id,count(l.member)+case when p_kind='editorial' then
  (select count(*) from dk_editorial.bot_comment_support b where b.comment_id=v.id) else 0 end,coalesce(bool_or(l.member=auth.uid()),false),coalesce(v.author=auth.uid(),false)
 from dk_safety.visible_comments(p_kind,p_ids[1:110]) v left join dk_safety.member_comment_likes l
 on (p_kind='comment' and l.comment_id=v.id) or (p_kind='reply' and l.reply_id=v.id) or (p_kind='editorial' and l.editorial_id=v.id)
 group by v.id,v.author
$$;

create or replace function dk_safety.dashboard_rows(m uuid)
returns table(metric text,kind text,item text,label text,topic text,point_id text,occurred timestamptz)
language sql stable set search_path='' as $$
 with my_poster_likes as (
  select case when l.owner_id=m then 'given' else 'received' end metric,l.slug,p.title,l.created_at
  from public.dk_infographic_likes l join public.dk_infographics p using(slug)
  where (l.owner_id=m or p.owner_id=m) and l.owner_id is distinct from p.owner_id and public.dk_can_read_poster(l.slug)
 ), my_comment_likes as (
  select case when l.member=m then 'given' else 'received' end metric,'comment' kind,c.id,c.body,c.slug topic,c.point_id,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_infographic_comments c on c.id=l.comment_id
  where (l.member=m or c.owner_id=m) and public.dk_can_read_poster(c.slug)
  union all
  select case when l.member=m then 'given' else 'received' end,'reply',r.id,r.perspective,r.question_id::text,null,l.at,l.member
  from dk_safety.member_comment_likes l join public.dk_replies r on r.id=l.reply_id where l.member=m or r.author_id=m
 )
 select l.metric,'poster',l.slug,l.title,l.slug,null::text,l.created_at from my_poster_likes l
 union all select 'received','poster',p.slug,p.title,p.slug,null::text,a.created_at
 from dk_editorial.poster_activity a join public.dk_infographics p using(slug)
 where a.liked and p.owner_id=m and p.published_at<=now()
 union all select l.metric,l.kind,l.id::text,l.body,l.topic,l.point_id,l.at from my_comment_likes l
 union all select 'given','editorial',e.id::text,e.excerpt,e.slug,null,l.at
 from dk_safety.member_comment_likes l join dk_editorial.discussion_comments e on e.id=l.editorial_id where l.member=m and public.dk_can_read_poster(e.slug)
 union all select 'comments','comment',c.id::text,c.body,c.slug,c.point_id,c.created_at from public.dk_infographic_comments c where c.owner_id=m and public.dk_can_read_poster(c.slug)
 union all select 'comments','reply',r.id::text,r.perspective,r.question_id::text,null,r.created_at from public.dk_replies r where r.author_id=m
 union all select 'work','question',q.id::text,q.question,q.id::text,null,q.created_at from public.dk_questions q where q.author_id=m
 union all select 'work','debate',d.id::text,coalesce(nullif(t.title,'Friend Debate Session'),s.topic,'Friend debate'),d.id::text,null,d.created_at
 from public.debates d left join public.topics t on t.id=d.topic_id
 left join lateral (select coalesce(a.snapshot->>'topic',case when ds.user_b is not null and (ds.shared_data#>'{topic_proposal,agreed_by}') @> jsonb_build_array(ds.user_a,ds.user_b) then ds.shared_data#>>'{topic_proposal,topic}' end) topic
  from public.debate_sessions ds left join public.automatic_debate_results a on a.session_id=ds.id
  where ds.debate_id=d.id and m in(ds.user_a,ds.user_b) order by ds.created_at desc limit 1) s on true
 where m in(d.participant_a,d.participant_b) and d.status is distinct from 'cancelled'
 union all select 'friends','friend',f.peer::text,f.name,f.peer::text,null,fr.accepted_at
 from public.dk_my_friend_status() f join dk_safety.member_friends fr on fr.first_id=least(m,f.peer) and fr.second_id=greatest(m,f.peer) where f.status='friends'
$$;

-- The explicit flag lets updated clients opt into the unified comment count.
revoke all on function dk_editorial.rank_posters(boolean,boolean) from public,anon,authenticated;
create function public.dk_ranked_posters(p_bot_comments boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable security definer set search_path='' as $$
  select * from dk_editorial.rank_posters(false,p_bot_comments);
$$;
create function public.dk_trending_posters(p_bot_comments boolean)
returns table(slug text,title text,category text,has_artwork boolean,published boolean,mine boolean,
  likes bigint,comments bigint,impressions bigint,liked boolean,published_at timestamptz)
language sql stable security definer set search_path='' as $$
  select * from dk_editorial.rank_posters(true,p_bot_comments);
$$;

create function public.dk_bot_comments(p_slug text)
returns table(id uuid,persona text,parent_id uuid,body text)
language sql stable security definer set search_path='' as $$
  select c.id,c.persona_id,c.parent_id,c.excerpt
  from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
  where p.slug=p_slug and p.published_at<=now() and c.persona_id is not null
  order by c.sort_order,c.created_at,c.id;
$$;

create function public.dk_bot_profile_activity(p_persona text)
returns table(support_given bigint,support_received bigint,comments jsonb)
language sql stable security definer set search_path='' as $$
  with own_comments as materialized (
    select c.id,c.slug,c.excerpt,c.created_at,p.title
    from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
    where p.published_at<=now() and c.persona_id=p_persona
  )
  select
    (select count(*) from dk_editorial.poster_activity a join public.dk_infographics p using(slug)
     where p.published_at<=now() and a.persona=p_persona and a.liked)
    +(select count(*) from dk_editorial.bot_comment_support a join dk_editorial.discussion_comments c on c.id=a.comment_id
      join public.dk_infographics p using(slug) where p.published_at<=now() and a.persona=p_persona),
    (select count(*) from dk_editorial.bot_comment_support b join own_comments c on c.id=b.comment_id)
    +(select count(*) from dk_safety.member_comment_likes l join own_comments c on c.id=l.editorial_id),
    coalesce((select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'body',excerpt,'title',title)
      order by created_at desc,id) from own_comments),'[]'::jsonb)
  from dk_editorial.bot_accounts b where b.id=p_persona;
$$;

revoke all on function public.dk_ranked_posters(boolean), public.dk_trending_posters(boolean),
  public.dk_bot_comments(text), public.dk_bot_profile_activity(text) from public,anon,authenticated;
grant execute on function public.dk_ranked_posters(boolean), public.dk_bot_comments(text),
  public.dk_bot_profile_activity(text) to anon,authenticated;
grant execute on function public.dk_trending_posters(boolean) to authenticated;

-- Only the backend can record actions under bot identities.
create function public.dk_record_bot_poster_event(p_slug text,p_persona text,p_support boolean)
returns void language sql security definer set search_path='' as $$
  insert into dk_editorial.poster_activity(slug,persona,liked)
  select p.slug,p_persona,coalesce(p_support,false)
  from public.dk_infographics p where p.slug=p_slug and p.published_at<=now()
  on conflict(slug,persona) do update set liked=poster_activity.liked or excluded.liked;
$$;

create function public.dk_record_bot_comment(p_slug text,p_id uuid,p_persona text,p_body text,p_parent uuid default null)
returns void language sql security definer set search_path='' as $$
  insert into dk_editorial.discussion_comments(id,slug,persona_id,excerpt,parent_id,sort_order)
  select p_id,p.slug,p_persona,btrim(p_body),p_parent,2147483647
  from public.dk_infographics p
  where p.slug=p_slug and p.published_at<=now() and p_persona is not null
    and char_length(btrim(p_body)) between 1 and 4000
  on conflict (id) do nothing;
$$;

create function public.dk_set_bot_comment_support(p_id uuid,p_persona text)
returns void language sql security definer set search_path='' as $$
  insert into dk_editorial.bot_comment_support(persona,comment_id)
  select p_persona,c.id from dk_editorial.discussion_comments c join public.dk_infographics p using(slug)
  where p.published_at<=now() and c.id=p_id and c.persona_id<>p_persona
  on conflict do nothing;
$$;

revoke all on function public.dk_record_bot_poster_event(text,text,boolean),
  public.dk_record_bot_comment(text,uuid,text,text,uuid), public.dk_set_bot_comment_support(uuid,text)
  from public,anon,authenticated;
grant execute on function public.dk_record_bot_poster_event(text,text,boolean),
  public.dk_record_bot_comment(text,uuid,text,text,uuid), public.dk_set_bot_comment_support(uuid,text)
  to service_role;
