import fs from 'node:fs';

const migration='supabase/migrations/20260831094500_mobile_consumer_contribution_rpc_search_path_authority.sql';
const failures=[];
if(!fs.existsSync(migration)) failures.push(`missing consumer contribution RPC authority migration: ${migration}`);

if(!failures.length){
  const sql=fs.readFileSync(migration,'utf8');
  const signatures=[
    'create_check_in(uuid,text)',
    'create_review(uuid,uuid,smallint,numeric,text)',
    'kleenest_toggle_favorite(uuid)',
    'record_bathroom_verification(uuid,boolean,double precision,double precision,double precision)',
    'record_location_visit(uuid,jsonb)',
    'record_review_amenity_inventory(uuid,jsonb)',
    'redeem_qr_code(text)',
    'submit_amenity_observation(uuid,uuid,text,numeric,text,uuid,uuid,text,jsonb)',
    'submit_location_info(uuid,jsonb)',
    'submit_location_photo_record(uuid,text,text,text,text,bigint,integer,integer)',
    'submit_location_photo_record(uuid,text,text,text,text,bigint,integer,integer,uuid)',
  ];
  for(const signature of signatures){
    if(!sql.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search path`);
    if(!sql.includes(`revoke all on function public.${signature} from public, anon;`)) failures.push(`${signature} must reject public/anon execution`);
    if(!sql.includes(`grant execute on function public.${signature} to authenticated, service_role;`)) failures.push(`${signature} must preserve authenticated/service execution`);
  }
}

if(failures.length){
  console.error('Native consumer contribution RPC authority audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native consumer contribution RPC authority audit passed.');
