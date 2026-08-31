import fs from 'node:fs';

const migration='supabase/migrations/20260831094000_admin_control_plane_empty_search_path_authority.sql';
const failures=[];
if(!fs.existsSync(migration)) failures.push(`missing admin control-plane authority migration: ${migration}`);

if(!failures.length){
  const sql=fs.readFileSync(migration,'utf8');
  const signatures=[
    'admin_assign_business_member(uuid,uuid,public.business_member_role)',
    'admin_control_plane_history(integer)',
    'admin_control_plane_snapshot()',
    'admin_crud_gateway(text,text,uuid,jsonb)',
    'admin_remove_business_member(uuid,uuid)',
    'admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text)',
    'admin_set_business_access(uuid,public.business_tier,boolean,boolean,text)',
    'admin_set_business_tier(uuid,public.business_tier)',
    'admin_set_business_verification(uuid,public.verification_status)',
    'admin_set_user_access(uuid,boolean,text,text,boolean,text)',
  ];
  for(const signature of signatures){
    if(!sql.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search path`);
    if(!sql.includes(`revoke all on function public.${signature} from public, anon;`)) failures.push(`${signature} must reject implicit public and anon execution`);
    if(!sql.includes(`grant execute on function public.${signature} to authenticated, service_role;`)) failures.push(`${signature} must preserve authenticated/service execution`);
  }
}

if(failures.length){
  console.error('Admin control-plane RPC authority audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Admin control-plane RPC authority audit passed.');
