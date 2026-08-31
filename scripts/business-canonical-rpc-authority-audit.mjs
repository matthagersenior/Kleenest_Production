import fs from 'node:fs';

const migration='supabase/migrations/20260831095000_business_canonical_rpc_search_path_authority.sql';
const failures=[];
if(!fs.existsSync(migration)) failures.push(`missing canonical business RPC authority migration: ${migration}`);
if(!failures.length){
  const sql=fs.readFileSync(migration,'utf8');
  const signatures=[
    'business_create_location_canonical(uuid,text,text,text,text,text,numeric,numeric,text,text)',
    'business_create_promotion_canonical(uuid,text,text,numeric,uuid,timestamp with time zone,timestamp with time zone)',
    'business_dashboard_secure_summary(uuid,timestamp with time zone,timestamp with time zone)',
    'business_manage_campaign(uuid,uuid,text,text,text,text,text)',
    'business_manage_event(uuid,uuid,text,jsonb)',
    'business_manage_location(uuid,uuid,text,jsonb)',
    'business_manage_promotion(uuid,uuid,text,jsonb)',
    'business_set_location_active_canonical(uuid,boolean)',
    'business_set_promotion_active_canonical(uuid,boolean)',
    'business_update_location_canonical(uuid,text,text,text,text,boolean)',
  ];
  for(const signature of signatures){
    if(!sql.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search path`);
    if(!sql.includes(`revoke all on function public.${signature} from public, anon;`)) failures.push(`${signature} must reject public/anon execution`);
    if(!sql.includes(`grant execute on function public.${signature} to authenticated, service_role;`)) failures.push(`${signature} must preserve authenticated/service execution`);
  }
}
if(failures.length){console.error('Canonical business RPC authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Canonical business RPC authority audit passed.');
