import fs from 'node:fs';
const path='supabase/migrations/20260831100000_fleet_configuration_telemetry_rpc_authority_hardening.sql';
const sql=fs.readFileSync(path,'utf8');
const signatures=[
'assign_fleet_metric(uuid,text,uuid)','create_fleet_metric_definition(uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,jsonb,text)','fleet_assign_driver_user(uuid,uuid,uuid)','fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamp with time zone)','fleet_route_performance(uuid,uuid)','fleet_set_route_stops(uuid,uuid,jsonb)','fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer)','fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean)','update_fleet_metric_definition(uuid,text,text,numeric,numeric,numeric,text,jsonb,text,boolean)'];
for(const signature of signatures){const fn=`public.${signature}`;if(!sql.includes(`alter function ${fn} set search_path = '';`))throw new Error(`missing empty search_path for ${signature}`);if(!sql.includes(`revoke execute on function ${fn} from public, anon;`))throw new Error(`missing public/anon revoke for ${signature}`);if(!sql.includes(`grant execute on function ${fn} to authenticated, service_role;`))throw new Error(`missing authenticated/service grant for ${signature}`)}
if(signatures.length!==9)throw new Error('fleet configuration/telemetry RPC audit must cover 9 signatures');
console.log(`Fleet configuration/telemetry RPC authority audit passed for ${signatures.length} signatures.`);
