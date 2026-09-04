-- Normalize friendly QR Studio engagement labels to the canonical constrained
-- qr_engagement_programs.program_type vocabulary.

create or replace function public.qr_studio_normalize_program_type(p_program_type text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(coalesce(nullif(trim(p_program_type),''),'custom'))
    when 'checkin' then 'check_in'
    when 'check_in' then 'check_in'
    when 'visit_milestone' then 'check_in'
    when 'checkin_milestone' then 'check_in'
    when 'xp' then 'reward'
    when 'points' then 'reward'
    when 'loyalty' then 'reward'
    when 'badge' then 'reward'
    when 'premium_reward' then 'reward'
    when 'coupon' then 'promotion'
    when 'promotion' then 'promotion'
    when 'contest' then 'contest'
    when 'challenge' then 'contest'
    when 'review' then 'review'
    when 'survey' then 'survey'
    when 'event' then 'event'
    when 'content' then 'content'
    when 'navigation' then 'navigation'
    when 'support' then 'support'
    else 'custom'
  end;
$$;

create or replace function public.create_qr_engagement_program(
  p_qr_code_id uuid,p_program_type text,p_name text,p_description text default null,
  p_reward_config jsonb default '{}'::jsonb,p_trigger_count integer default 1
)
returns uuid
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  v_business uuid;
  v_id uuid;
  v_program_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_qr_code_id is null then raise exception 'QR code is required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Program name is required'; end if;
  if p_trigger_count < 1 then raise exception 'Trigger count must be at least 1'; end if;

  select business_id into v_business from public.qr_codes where id=p_qr_code_id;
  if v_business is null then raise exception 'QR code not found'; end if;
  if not public.business_can_manage(v_business) then raise exception 'Not authorized for this business'; end if;

  v_program_type := public.qr_studio_normalize_program_type(p_program_type);
  insert into public.qr_engagement_programs(
    qr_code_id,program_type,name,description,trigger_count,reward_config,active
  ) values (
    p_qr_code_id,v_program_type,trim(p_name),nullif(trim(p_description),''),
    p_trigger_count,coalesce(p_reward_config,'{}'::jsonb),true
  ) returning id into v_id;
  return v_id;
end;
$$;
