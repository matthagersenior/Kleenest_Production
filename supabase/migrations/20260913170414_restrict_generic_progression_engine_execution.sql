
revoke all on function public.record_progression_event_v2(text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.record_progression_event_v2(text,jsonb,text)
  to service_role;

comment on function public.record_progression_event_v2(text,jsonb,text) is
  'Internal progression engine. User-facing progression must flow through evidence-specific RPCs that validate the underlying action.';
