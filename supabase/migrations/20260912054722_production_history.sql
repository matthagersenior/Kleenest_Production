-- Preserve anonymous public behavior while removing unnecessary elevated execution.

alter function public.map_network_nearby_strict_v1(
  double precision,double precision,integer,integer,text,text,text[]
) security invoker;

alter function public.map_network_nearby_v1(
  double precision,double precision,integer,integer,text,text,text[]
) security invoker;

alter function public.get_location_trust_conflicts(uuid)
  security invoker;

comment on function public.map_network_nearby_strict_v1(
  double precision,double precision,integer,integer,text,text,text[]
) is
  'Public map query. Verified to preserve anonymous output under SECURITY INVOKER.';

comment on function public.map_network_nearby_v1(
  double precision,double precision,integer,integer,text,text,text[]
) is
  'Public map query. Verified to preserve anonymous output under SECURITY INVOKER.';

comment on function public.get_location_trust_conflicts(uuid) is
  'Public trust-conflict projection. Verified to preserve anonymous output under SECURITY INVOKER.';
