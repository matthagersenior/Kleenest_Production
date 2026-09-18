drop policy if exists contest_entries_owner on public.contest_entries;
create policy contest_entries_owner_select on public.contest_entries for select to authenticated using (user_id = auth.uid());
create policy contest_entries_owner_insert on public.contest_entries for insert to authenticated with check (user_id = auth.uid());
create policy contest_entries_owner_delete on public.contest_entries for delete to authenticated using (user_id = auth.uid());
