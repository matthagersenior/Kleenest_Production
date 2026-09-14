-- Remove the redundant 3-argument wrapper. The canonical 4-argument function already has defaults for the final arguments, so both overloads were valid for 3-argument calls and PostgreSQL could not choose between them.
drop function if exists public.is_qualifying_return_visit(uuid,uuid,timestamptz);
