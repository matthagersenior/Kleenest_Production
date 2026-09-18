insert into public.businesses(name,description,business_tier,verification_status,is_demo_test) values ('Kleenest Demo Standard','Standard tier testing workspace','standard','verified',true),('Kleenest Demo Fleet','Fleet tier testing workspace','fleet','verified',true) on conflict do nothing;
insert into public.business_members(business_id,user_id,role) select b.id,'3b91def6-f76b-4c33-823d-c870f7b859b1','owner' from public.businesses b where b.name in ('Kleenest Demo Standard','Kleenest Demo Fleet') on conflict do nothing;
update public.businesses set business_tier='growth' where id='a1b445d2-d062-4bd4-89ad-507d7ef8b333';
update public.businesses set business_tier='enterprise' where id='84c5cd1d-5d8a-40f4-80df-9ddbfcfef7b4';
