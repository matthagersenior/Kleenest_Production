create or replace function public.enforce_canonical_domain_contract()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.classification='canonical' and not exists (
    select 1 from public.capability_domain_contracts c
    where c.domain=new.domain and c.active=true
  ) then
    raise exception 'CANONICAL_DOMAIN_OWNER_REQUIRED: domain % must have an active capability_domain_contracts row before canonical functions are classified', new.domain;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_canonical_domain_contract on public.capability_function_classifications;
create trigger trg_enforce_canonical_domain_contract
before insert or update of domain,classification on public.capability_function_classifications
for each row execute function public.enforce_canonical_domain_contract();

insert into public.capability_function_classifications(function_signature,domain,classification,rationale)
values ('enforce_canonical_domain_contract()','architecture_governance','trigger_helper','Prevents new canonical capability domains from being classified without an active Product/workflow ownership contract.')
on conflict(function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale;
