CREATE OR REPLACE FUNCTION public.kleenest_ai_next_investigation()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select coalesce((select jsonb_build_object('id',id,'capability',capability)
 from kleenest_ai.ai_tasks
 where status='queued' and data_class='public' and capability in
 ('restroom_evidence_gap','entity_relationship_intelligence','ingestion_signal_intelligence','behavioral_signal_intelligence')
 and not_before<=now()
 order by priority,created_at limit 1),'{}'::jsonb)
$function$
;

CREATE OR REPLACE FUNCTION public.kleenest_ai_queue_investigations()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select kleenest_ai.queue_investigations()
$function$
;

CREATE OR REPLACE FUNCTION public.kleenest_ai_scheduler_verify(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_secret is not null and length(p_secret)>20 and exists(
 select 1 from vault.decrypted_secrets where name='kleenest_maps_scheduler'
 and decrypted_secret=p_secret
 )
$function$
;

CREATE OR REPLACE FUNCTION kleenest_ai.queue_investigations()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;
begin
 if current_user not in ('postgres','service_role') then raise exception 'forbidden'; end if;
 with source as (
 select distinct on (capability) capability,evidence
 from kleenest_ai.ai_tasks
 where capability in ('restroom_evidence_gap','entity_relationship_intelligence','ingestion_signal_intelligence','behavioral_signal_intelligence')
 and status='completed' and result->>'origin'='deterministic_database_analysis'
 order by capability,updated_at desc
 ), inserted as (
 insert into kleenest_ai.ai_tasks(capability,input_fingerprint,evidence,data_class,status,priority)
 select capability,'investigate-v1-'||md5(evidence::text),evidence,'public','queued',20
 from source
 where jsonb_typeof(evidence)='object'
 on conflict(capability,input_fingerprint) do nothing
 returning id
 )
 select count(*) into n from inserted;
 return n;
end $function$
;
revoke all on function kleenest_ai.queue_investigations() from public,anon,authenticated;
grant execute on function kleenest_ai.queue_investigations() to service_role;
revoke all on function public.kleenest_ai_queue_investigations() from public,anon,authenticated;
grant execute on function public.kleenest_ai_queue_investigations() to service_role;
revoke all on function public.kleenest_ai_next_investigation() from public,anon,authenticated;
grant execute on function public.kleenest_ai_next_investigation() to service_role;
revoke all on function public.kleenest_ai_scheduler_verify(text) from public,anon,authenticated;
grant execute on function public.kleenest_ai_scheduler_verify(text) to service_role;
select cron.schedule('kleenest-ai-investigation-dispatch-v1','*/30 * * * *',$cmd$
select net.http_post(url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/kleenest-ai-dispatcher',headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',(select decrypted_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler' limit 1)),body:='{}'::jsonb,timeout_milliseconds:=25000);
$cmd$);