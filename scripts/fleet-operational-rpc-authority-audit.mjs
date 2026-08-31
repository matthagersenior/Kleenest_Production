import fs from 'node:fs';

const path = 'supabase/migrations/20260831095000_fleet_operational_rpc_authority_hardening.sql';
const sql = fs.readFileSync(path, 'utf8');
const signatures = [
  'fleet_complete_maintenance(uuid,uuid,text)',
  'fleet_create_driver(uuid,text,text,text,text,uuid,jsonb)',
  'fleet_create_maintenance(uuid,uuid,text,text,timestamp with time zone,numeric,numeric,text,text,jsonb)',
  'fleet_create_route(uuid,text,text,uuid,uuid,timestamp with time zone,numeric,integer,integer,jsonb)',
  'fleet_create_vehicle(uuid,text,text,text,text,text,double precision,double precision,numeric,jsonb)',
  'fleet_delete_driver(uuid,uuid)',
  'fleet_delete_maintenance(uuid,uuid)',
  'fleet_delete_route(uuid,uuid)',
  'fleet_delete_vehicle(uuid,uuid)',
  'fleet_dispatch_route(uuid,uuid)',
  'fleet_resolve_alert(uuid,uuid,text)',
  'fleet_set_driver_status(uuid,uuid,text)',
  'fleet_set_route_status(uuid,uuid,text)',
  'fleet_set_vehicle_status(uuid,uuid,text)',
  'fleet_update_driver(uuid,uuid,text,text,text,text,uuid,jsonb)',
  'fleet_update_maintenance(uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,numeric,numeric,text,text,jsonb)',
  'fleet_update_route(uuid,uuid,text,text,uuid,uuid,timestamp with time zone,numeric,integer,integer,jsonb)',
  'fleet_update_vehicle(uuid,uuid,text,text,text,text,text,double precision,double precision,numeric,jsonb)',
];

for (const signature of signatures) {
  const fn = `public.${signature}`;
  if (!sql.includes(`alter function ${fn} set search_path = '';`)) throw new Error(`missing empty search_path for ${signature}`);
  if (!sql.includes(`revoke execute on function ${fn} from public, anon;`)) throw new Error(`missing public/anon revoke for ${signature}`);
  if (!sql.includes(`grant execute on function ${fn} to authenticated, service_role;`)) throw new Error(`missing authenticated/service grant for ${signature}`);
}

if (signatures.length !== 18) throw new Error('fleet operational RPC authority audit must cover 18 signatures');
console.log(`Fleet operational RPC authority audit passed for ${signatures.length} signatures.`);
