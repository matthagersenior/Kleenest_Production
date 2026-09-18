do $$ begin alter table public.social_activity replica identity full; exception when undefined_table then null; end $$;
do $$ begin alter table public.messages replica identity full; exception when undefined_table then null; end $$;
do $$ begin alter table public.follows replica identity full; exception when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.social_activity; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.follows; exception when duplicate_object then null; end $$;
