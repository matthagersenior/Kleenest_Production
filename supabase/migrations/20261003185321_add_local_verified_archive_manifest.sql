create schema if not exists archive;

create table if not exists archive.object_manifests (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  object_path text not null unique,
  content_sha256 text not null,
  byte_count bigint not null check (byte_count >= 0),
  row_count integer not null check (row_count >= 0),
  first_row_id uuid,
  last_row_id uuid,
  codec text not null default 'gzip-jsonl-v1',
  source_project text not null default 'kleenest-production',
  verified_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table archive.object_manifests enable row level security;

create index if not exists object_manifests_kind_created_idx
  on archive.object_manifests(kind, created_at desc);

create or replace function public.register_archive_object_manifest(
  p_kind text,
  p_object_path text,
  p_content_sha256 text,
  p_byte_count bigint,
  p_row_count integer,
  p_first_row_id uuid,
  p_last_row_id uuid,
  p_verified_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'service_role required';
  end if;

  insert into archive.object_manifests(
    kind, object_path, content_sha256, byte_count, row_count,
    first_row_id, last_row_id, verified_at, metadata
  )
  values(
    p_kind, p_object_path, p_content_sha256, p_byte_count, p_row_count,
    p_first_row_id, p_last_row_id, coalesce(p_verified_at, now()),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict(object_path) do update set
    content_sha256 = excluded.content_sha256,
    byte_count = excluded.byte_count,
    row_count = excluded.row_count,
    first_row_id = excluded.first_row_id,
    last_row_id = excluded.last_row_id,
    verified_at = excluded.verified_at,
    metadata = excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_archive_object_manifest(
  text,text,text,bigint,integer,uuid,uuid,timestamptz,jsonb
) from public, anon, authenticated;

grant execute on function public.register_archive_object_manifest(
  text,text,text,bigint,integer,uuid,uuid,timestamptz,jsonb
) to service_role;
