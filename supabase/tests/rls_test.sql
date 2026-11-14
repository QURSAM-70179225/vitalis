\set ON_ERROR_STOP 1
-- users: G ground admin, A astronaut, C cmo, X astronaut in another mission
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','{"name":"Gita Ground","callsign":"capcom"}'),
 ('00000000-0000-0000-0000-00000000000b','{"name":"Lena Ortiz","callsign":"orion"}'),
 ('00000000-0000-0000-0000-00000000000c','{"name":"Kenji Mori","callsign":"sage"}'),
 ('00000000-0000-0000-0000-00000000000d','{"name":"Xavier Other","callsign":"x"}');
select count(*) as profiles_created from public.profiles;

create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
set role authenticated;

-- Ground admin creates mission
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_mission('ARES-1','mars-transit','ground') is not null as mission_created;
create temp table codes as select * from public.mission_codes();
select length(crew_code)=8 and crew_code<>ground_code as codes_ok from codes;

-- astronaut and cmo join with crew code; X creates own mission
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); select public.join_mission((select crew_code from codes)) is not null;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); select public.join_mission((select crew_code from codes), true) is not null;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); select public.create_mission('OTHER','iss','astronaut') is not null;

reset role; select callsign, role, mission_id is not null as in_mission from public.profiles order by callsign; set role authenticated;

-- A writes own check-in; cannot write as someone else
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.check_ins(id,crew_id,mission_id,day,ts,vals) values ('ci1','00000000-0000-0000-0000-00000000000b',public.my_mission(),1,now(),'{"heartRate":61}');
insert into public.journal_entries(id,crew_id,day,ts,mood,note,wellbeing) values ('j1','00000000-0000-0000-0000-00000000000b',1,now(),3,'secret note',50);
insert into public.alerts(id,crew_id,mission_id,day,level,rule_id,title) values ('al1','00000000-0000-0000-0000-00000000000b',public.my_mission(),1,'critical','sans-cluster','SANS');
do $$ begin
  begin insert into public.check_ins(id,crew_id,mission_id,day,ts) values ('bad','00000000-0000-0000-0000-00000000000c',public.my_mission(),1,now()); raise exception 'FAIL: wrote as other user';
  exception when insufficient_privilege then raise notice 'PASS: cannot write as another crew member'; end;
  begin update public.profiles set role='ground' where id=auth.uid(); raise exception 'FAIL: self role escalation';
  exception when insufficient_privilege then raise notice 'PASS: cannot change own role'; end;
  begin perform crew_code from public.missions; raise exception 'FAIL: read invite codes';
  exception when insufficient_privilege then raise notice 'PASS: crew cannot read invite codes'; end;
  begin insert into public.ground_messages(mission_id,crew_id,author_id,author_name,body) values (public.my_mission(),'00000000-0000-0000-0000-00000000000b',auth.uid(),'me','hi'); raise exception 'FAIL: astronaut sent ground msg';
  exception when insufficient_privilege then raise notice 'PASS: astronaut cannot post ground messages'; end;
end $$;
select count(*) = 0 as "PASS astronaut sees no mission codes" from public.mission_codes();

-- C (cmo) sees A's check-in and alert but NOT the journal
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select (select count(*) from public.check_ins)=1 as "PASS cmo sees crew check-in",
       (select count(*) from public.journal_entries)=0 as "PASS cmo cannot read journal";
-- G (ground) sees check-in + alert, acknowledges, sends message
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select (select count(*) from public.check_ins)=1 as "PASS ground sees crew check-in", (select count(*) from public.journal_entries)=0 as "PASS ground cannot read journal";
select public.acknowledge_alert('al1');
insert into public.ground_messages(mission_id,crew_id,author_id,author_name,body) values (public.my_mission(),'00000000-0000-0000-0000-00000000000b',auth.uid(),'Gita','Copy SANS alert. Do OCT today.');
select (select count(*) from public.alerts where acknowledged_at is not null)=1 as "PASS ground acknowledged";
-- X (other mission) sees nothing of ARES-1
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select (select count(*) from public.check_ins)=0 and (select count(*) from public.alerts)=0 and (select count(*) from public.ground_messages)=0 and (select count(*) from public.profiles)=1 as "PASS other mission isolated";
do $$ begin
  begin perform public.acknowledge_alert('al1'); raise exception 'FAIL';
  exception when raise_exception then raise notice 'PASS: astronaut cannot acknowledge alerts'; end;
end $$;
-- A reads own journal + message, marks it read, cannot edit body
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select (select count(*) from public.journal_entries)=1 as "PASS owner reads journal", (select count(*) from public.ground_messages)=1 as "PASS astronaut receives message";
update public.ground_messages set read_at = now();
do $$ begin
  begin update public.ground_messages set body='hacked'; raise exception 'FAIL';
  exception when insufficient_privilege then raise notice 'PASS: cannot edit message body'; end;
end $$;
-- A sees crewmate names but not their health data
select (select count(*) from public.profiles)=3 as "PASS sees crew roster", public.can_read_crew('00000000-0000-0000-0000-00000000000c') = false as "PASS astronaut cannot read crewmate health";
-- invalid code
do $$ begin
  begin perform public.join_mission('NOPE1234'); raise exception 'FAIL';
  exception when raise_exception then raise notice 'PASS: invalid invite code rejected'; end;
end $$;
-- crew can re-upsert own alert but cannot forge an acknowledgement
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.alerts(id,crew_id,mission_id,day,level,rule_id,title) values ('al1','00000000-0000-0000-0000-00000000000b',public.my_mission(),1,'act','sans-cluster','SANS v2')
  on conflict (id) do update set level = excluded.level, title = excluded.title;
do $$ begin
  begin update public.alerts set acknowledged_at = now(); raise exception 'FAIL';
  exception when insufficient_privilege then raise notice 'PASS: crew cannot forge acknowledgement'; end;
end $$;
select (select title from public.alerts where id='al1')='SANS v2' as "PASS alert upsert works";

-- Invite codes use only built-in functions (no pgcrypto / gen_random_bytes).
select public.random_code() ~ '^[A-Z2-9]{8}$' as "PASS invite code format";
