-- Fix Game Center community matches on PostgreSQL/PLpgSQL.
-- The RETURNS TABLE output includes a field named "status"; an unqualified
-- status reference inside the expiration UPDATE collides with that output
-- variable. Qualify the table reference so list_game_challenges can execute.

create or replace function public.list_game_challenges(
  p_status text default null::text,
  p_limit integer default 50
)
returns table(
  id uuid,
  game_code text,
  status text,
  creator_id uuid,
  invitee_id uuid,
  creator_name text,
  invitee_name text,
  creator_score integer,
  invitee_score integer,
  winner_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  update public.game_challenges as gc
  set status = 'expired'
  where gc.status = 'pending'
    and gc.expires_at <= now();

  return query
  select
    c.id,
    c.game_code,
    c.status,
    c.creator_id,
    c.invitee_id,
    coalesce(cp.display_name,cp.username,'Player') as creator_name,
    coalesce(ip.display_name,ip.username,'Player') as invitee_name,
    c.creator_score,
    c.invitee_score,
    c.winner_id,
    c.created_at,
    c.expires_at,
    c.completed_at
  from public.game_challenges as c
  left join public.profiles as cp on cp.id = c.creator_id
  left join public.profiles as ip on ip.id = c.invitee_id
  where (c.creator_id = actor or c.invitee_id = actor)
    and (p_status is null or c.status = p_status)
  order by c.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$function$;
