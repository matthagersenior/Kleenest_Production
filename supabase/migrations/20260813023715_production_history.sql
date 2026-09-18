create table if not exists public.location_visits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 location_id uuid not null references public.locations(id) on delete cascade,
 occurred_at timestamptz not null default now(),
 context jsonb not null default '{}'::jsonb,
 is_preferred boolean not null default false,
 partner_program_id uuid references public.partner_programs(id) on delete set null
);
create index if not exists idx_location_visits_location_time on public.location_visits(location_id,occurred_at desc);
create index if not exists idx_location_visits_user_time on public.location_visits(user_id,occurred_at desc);

create or replace function public.record_location_visit(p_location_id uuid,p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pref record; v_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select pla.partner_program_id into v_pref from public.preferred_location_activations pla where pla.user_id=auth.uid() and pla.location_id=p_location_id and pla.deactivated_at is null limit 1;
 insert into public.location_visits(user_id,location_id,context,is_preferred,partner_program_id) values(auth.uid(),p_location_id,coalesce(p_context,'{}'::jsonb),v_pref.partner_program_id is not null,v_pref.partner_program_id) returning id into v_id;
 if v_pref.partner_program_id is not null then update public.preferred_location_activations set last_used_at=now(),use_count=use_count+1 where user_id=auth.uid() and location_id=p_location_id and deactivated_at is null; end if;
 return jsonb_build_object('ok',true,'visit_id',v_id,'is_preferred',v_pref.partner_program_id is not null);
end;$$;
grant execute on function public.record_location_visit(uuid,jsonb) to authenticated;
alter table public.location_visits enable row level security;
create policy "users read own visits" on public.location_visits for select to authenticated using(user_id=auth.uid());
create policy "business members read visits for their locations" on public.location_visits for select to authenticated using(exists(select 1 from public.locations l join public.business_members bm on bm.business_id=l.business_id where l.id=location_visits.location_id and bm.user_id=auth.uid()));
