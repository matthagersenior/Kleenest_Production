create or replace function kleenest_ai.reserve_ai_budget(p_task_id uuid,p_model_id text,p_amount_usd numeric)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_policy kleenest_ai.ai_policy%rowtype; v_spent numeric; v_id uuid;
begin
 if p_amount_usd is null or p_amount_usd<=0 or p_amount_usd>1 then raise exception 'invalid_reservation'; end if;
 perform pg_advisory_xact_lock(90181726);
 select * into strict v_policy from kleenest_ai.ai_policy where singleton=true;
 if not v_policy.paid_enabled then raise exception 'paid_ai_disabled'; end if;
 if not exists(select 1 from kleenest_ai.ai_tasks where id=p_task_id and status in ('queued','running')) then raise exception 'task_not_eligible'; end if;
 if not exists(select 1 from kleenest_ai.provider_models where id=p_model_id and enabled and model<>'unconfigured') then raise exception 'model_not_enabled'; end if;
 select coalesce(sum(case when status='settled' then coalesce(actual_usd,reserved_usd) else reserved_usd end),0) into v_spent
 from kleenest_ai.ai_budget_reservations
 where status in ('reserved','settled') and created_at >= (date_trunc('month',now() at time zone 'UTC') at time zone 'UTC');
 if v_spent+p_amount_usd>v_policy.monthly_budget_usd then raise exception 'monthly_budget_exceeded'; end if;
 insert into kleenest_ai.ai_budget_reservations(task_id,provider_model_id,reserved_usd)
 values(p_task_id,p_model_id,p_amount_usd) returning id into v_id;
 return v_id;
end $$;
revoke all on function kleenest_ai.reserve_ai_budget(uuid,text,numeric) from public,anon,authenticated;
grant execute on function kleenest_ai.reserve_ai_budget(uuid,text,numeric) to service_role;
create or replace function kleenest_ai.settle_ai_budget(p_reservation_id uuid,p_actual_usd numeric,p_release boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_reserved numeric;
begin
 perform pg_advisory_xact_lock(90181726);
 select reserved_usd into v_reserved from kleenest_ai.ai_budget_reservations where id=p_reservation_id and status='reserved' for update;
 if not found then return false; end if;
 if not p_release and (p_actual_usd is null or p_actual_usd<0 or p_actual_usd>v_reserved) then raise exception 'actual_cost_outside_reservation'; end if;
 update kleenest_ai.ai_budget_reservations
 set status=case when p_release then 'released' else 'settled' end,
 actual_usd=case when p_release then null else p_actual_usd end,settled_at=now()
 where id=p_reservation_id;
 return true;
end $$;
revoke all on function kleenest_ai.settle_ai_budget(uuid,numeric,boolean) from public,anon,authenticated;
grant execute on function kleenest_ai.settle_ai_budget(uuid,numeric,boolean) to service_role;