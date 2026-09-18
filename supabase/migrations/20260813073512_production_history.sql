begin; revoke execute on function public.enroll_program_location(uuid, uuid) from public; grant execute on function public.enroll_program_location(uuid, uuid) to authenticated; commit;
