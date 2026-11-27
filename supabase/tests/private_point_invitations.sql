begin;
insert into auth.users(id) values
 ('2510cc62-42d4-483a-9865-ae78eb310001'),('2510cc62-42d4-483a-9865-ae78eb310002'),
 ('2510cc62-42d4-483a-9865-ae78eb310003');
insert into public.dk_infographics(slug,title,owner_id,published_at)
 values('private-point-regression','Only the selected point','2510cc62-42d4-483a-9865-ae78eb310001',null);
insert into dk_safety.points(slug,id,side,rank,title,detail) values
 ('private-point-regression','one','First side',1,'Chosen point','Shared detail'),
 ('private-point-regression','two','Other side',2,'Other point','Hidden detail');

set local role authenticated;
do $$
declare
 sender uuid:='2510cc62-42d4-483a-9865-ae78eb310001';
 receiver uuid:='2510cc62-42d4-483a-9865-ae78eb310002';
 third uuid:='2510cc62-42d4-483a-9865-ae78eb310003';
 issued jsonb; named jsonb; revoked jsonb; once uuid;
begin
 perform set_config('request.jwt.claim.sub',sender::text,true);
 issued:=public.dk_invite_to_point('private-point-regression','one');
 once:=(issued->>'id')::uuid;
 named:=public.dk_invite_to_point('private-point-regression','two',receiver);
 if public.dk_invite_to_point('private-point-regression','two',receiver)->>'id' is distinct from named->>'id' then
   raise exception 'Retry duplicated the invitation';
 end if;
 revoked:=public.dk_invite_to_point('private-point-regression','one');
 perform public.dk_revoke_link((revoked->>'id')::uuid);
 perform set_config('request.jwt.claim.sub',receiver::text,true);
 begin perform public.dk_claim_link(revoked->>'token'); raise exception 'Revoked link accepted';
 exception when raise_exception then if sqlerrm<>'Invitation unavailable' then raise; end if; end;
 begin perform public.dk_accept_point_invite(once); raise exception 'ID alone redeemed token';
 exception when raise_exception then if sqlerrm<>'Invitation unavailable' then raise; end if; end;
 if public.dk_claim_link(issued->>'token')->>'point_invite' is distinct from once::text then raise exception 'Wrong destination'; end if;
 perform public.dk_claim_link(issued->>'token');
 perform public.dk_accept_point_invite((named->>'id')::uuid);
 if public.dk_can_read_poster('private-point-regression') or
   (select detail from public.dk_private_points(once)) is distinct from 'Shared detail' then
   raise exception 'Access must include exactly the selected point';
 end if;
 begin perform public.dk_reply_to_private_point(once,'One private sentence.'); raise exception 'Unscreened reply accepted';
 exception when raise_exception then if sqlerrm<>'Please complete the safety check' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',third::text,true);
 if exists(select from public.dk_private_points(once)) then raise exception 'Private point disclosed'; end if;
 begin perform public.dk_claim_link(issued->>'token'); raise exception 'Claim transferred';
 exception when raise_exception then if sqlerrm<>'Invitation unavailable' then raise; end if; end;
 begin perform public.dk_accept_point_invite((named->>'id')::uuid); raise exception 'Named invite opened by another member';
 exception when raise_exception then if sqlerrm<>'Invitation unavailable' then raise; end if; end;
 perform set_config('dk_test.point_id',once::text,true);
end $$;
reset role;
insert into dk_safety.approvals(member,kind,target,fingerprint,expires_at) values
 ('2510cc62-42d4-483a-9865-ae78eb310002','reply','point-invite:'||current_setting('dk_test.point_id'),
 sha256(convert_to(jsonb_build_array('One private sentence.'::text)::text,'UTF8')),now()+interval '1 minute');
set local role authenticated;
do $$
declare target uuid:=current_setting('dk_test.point_id')::uuid;
begin
 perform set_config('request.jwt.claim.sub','2510cc62-42d4-483a-9865-ae78eb310002',true);
 perform public.dk_reply_to_private_point(target,'One private sentence.');
 perform public.dk_reply_to_private_point(target,'One private sentence.');
 perform set_config('request.jwt.claim.sub','2510cc62-42d4-483a-9865-ae78eb310001',true);
 if (select reply from public.dk_private_points(target)) is distinct from 'One private sentence.' then raise exception 'Sender cannot read reply'; end if;
 if has_function_privilege('anon','public.dk_private_points(uuid)','execute') then raise exception 'Anonymous private point RPC access'; end if;
end $$;
rollback;
