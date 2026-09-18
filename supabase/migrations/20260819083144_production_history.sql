create table if not exists public.restroom_observations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  observation_type text not null check (observation_type in ('clean','dirty','supplies_ok','supplies_low','open','closed','accessible','not_accessible','changing_table','no_changing_table','bathroom_present','bathroom_missing')),
  cleanliness_pct numeric check (cleanliness_pct is null or (cleanliness_pct >= 0 and cleanliness_pct <= 100)),
  note text,
  source text not null default 'community',
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists restroom_observations_location_created_idx on public.restroom_observations(location_id,created_at desc);
create index if not exists restroom_observations_user_idx on public.restroom_observations(user_id,created_at desc);

create table if not exists public.location_data_conflicts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  field_name text not null,
  observed_value text,
  source text not null,
  observation_id uuid references public.restroom_observations(id) on delete set null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_value text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists location_data_conflicts_location_idx on public.location_data_conflicts(location_id,status);

alter table public.restroom_observations enable row level security;
alter table public.location_data_conflicts enable row level security;

create policy "restroom observations are readable" on public.restroom_observations for select using (true);
create policy "users create their own restroom observations" on public.restroom_observations for insert with check (auth.uid() = user_id);
create policy "users update their own restroom observations" on public.restroom_observations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "open location conflicts are readable" on public.location_data_conflicts for select using (status = 'open');

create or replace function public.submit_restroom_observation(
  p_location_id uuid,
  p_check_in_id uuid,
  p_observation_type text,
  p_cleanliness_pct numeric default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_observation public.restroom_observations;
  v_positive boolean := false;
  v_negative boolean := false;
  v_confidence numeric := 0.6;
  v_count integer;
begin
  if v_user is null then raise exception 'Sign in to contribute an observation.'; end if;
  if p_observation_type not in ('clean','dirty','supplies_ok','supplies_low','open','closed','accessible','not_accessible','changing_table','no_changing_table','bathroom_present','bathroom_missing') then raise exception 'Invalid observation type.'; end if;
  if p_cleanliness_pct is not null and (p_cleanliness_pct < 0 or p_cleanliness_pct > 100) then raise exception 'Cleanliness must be between 0 and 100.'; end if;
  if p_check_in_id is not null and not exists (select 1 from public.check_ins where id=p_check_in_id and user_id=v_user and location_id=p_location_id) then raise exception 'Check-in does not belong to this location.'; end if;

  if p_check_in_id is not null then v_confidence := 0.9; end if;
  insert into public.restroom_observations(location_id,user_id,check_in_id,observation_type,cleanliness_pct,note,confidence)
  values(p_location_id,v_user,p_check_in_id,p_observation_type,p_cleanliness_pct,nullif(trim(p_note),''),v_confidence)
  returning * into v_observation;

  v_positive := p_observation_type in ('clean','supplies_ok','open','accessible','changing_table','bathroom_present');
  v_negative := p_observation_type in ('dirty','supplies_low','closed','not_accessible','no_changing_table','bathroom_missing');
  select count(*) into v_count from public.restroom_observations where location_id=p_location_id and created_at >= now() - interval '30 days';

  update public.locations
  set bathroom_verification_count = coalesce(bathroom_verification_count,0)+1,
      bathroom_positive_count = coalesce(bathroom_positive_count,0)+case when v_positive then 1 else 0 end,
      bathroom_negative_count = coalesce(bathroom_negative_count,0)+case when v_negative then 1 else 0 end,
      bathroom_verified_at = now(),
      bathroom_verification_status = case when v_negative and p_observation_type in ('closed','bathroom_missing') then 'reported_issue' else 'verified' end,
      bathroom_verification_source = 'community_observation',
      updated_at = now()
  where id=p_location_id;

  if v_count >= 2 and v_positive and v_negative then
    insert into public.location_data_conflicts(location_id,field_name,observed_value,source,observation_id)
    values(p_location_id,'bathroom_status','contradictory community observations','community',v_observation.id);
  end if;

  return jsonb_build_object('observation_id',v_observation.id,'verification_count',v_count,'confidence',v_confidence);
end;
$$;

grant execute on function public.submit_restroom_observation(uuid,uuid,text,numeric,text) to authenticated;
