import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,KEY,{auth:{persistSession:false}});
const DEST='https://sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/archive-object-ingest';
const H={'content-type':'application/json'};
const msg=(e:any)=>e instanceof Error?e.message:String(e?.message||e);
async function ship(kind:string,rows:any[],secret:string){
 const r=await fetch(DEST,{method:'POST',headers:{'content-type':'application/json','x-kleenest-geo-archive':secret},body:JSON.stringify({kind,rows,source:'production_cold_offloader'}),signal:AbortSignal.timeout(60000)});
 const t=await r.text(); if(!r.ok)throw new Error(`archive ${r.status}: ${t.slice(0,500)}`); return t;
}
Deno.serve(async(req)=>{try{
 if(req.method!=='POST')return new Response(JSON.stringify({ok:false,error:'POST required'}),{status:405,headers:H});
 const supplied=req.headers.get('x-kleenest-scheduler')||'';
 const scheduler=await db.rpc('get_internal_scheduler_secret',{p_name:'kleenest_maps_scheduler'});
 if(scheduler.error||!scheduler.data||supplied!==scheduler.data)return new Response(JSON.stringify({ok:false,error:'unauthorized'}),{status:401,headers:H});
 const sec=await db.rpc('get_internal_geo_archive_secret'); if(sec.error||!sec.data)throw sec.error||new Error('archive secret missing');
 const body=await req.json().catch(()=>({})); const batches=Math.max(1,Math.min(25,Number(body?.batches||10))),limit=Math.max(1,Math.min(1000,Number(body?.limit||1000)));
 let archivedExternal=0,deletedExternal=0,archivedRuns=0,deletedRuns=0;
 for(let i=0;i<batches;i++){
  const b=await db.rpc('cold_external_location_archive_batch',{p_limit:limit}); if(b.error)throw b.error;
  const rows=Array.isArray(b.data?.rows)?b.data.rows:[]; if(!rows.length)break;
  await ship('external_location_records',rows,sec.data);
  const ids=rows.map((x:any)=>x.id); const a=await db.rpc('cold_external_location_archive_ack',{p_ids:ids}); if(a.error)throw a.error;
  if(Number(a.data||0)!==rows.length)throw new Error(`external ack mismatch archived=${rows.length} deleted=${a.data}`);
  archivedExternal+=rows.length;deletedExternal+=Number(a.data||0);
 }
 for(let i=0;i<batches;i++){
  const b=await db.rpc('cold_ingestion_run_archive_batch',{p_limit:limit}); if(b.error)throw b.error;
  const rows=Array.isArray(b.data?.rows)?b.data.rows:[]; if(!rows.length)break;
  await ship('national_ingestion_runs',rows,sec.data);
  const ids=rows.map((x:any)=>x.id); const a=await db.rpc('cold_ingestion_run_archive_ack',{p_ids:ids}); if(a.error)throw a.error;
  if(Number(a.data||0)!==rows.length)throw new Error(`run ack mismatch archived=${rows.length} deleted=${a.data}`);
  archivedRuns+=rows.length;deletedRuns+=Number(a.data||0);
 }
 return new Response(JSON.stringify({ok:true,storage:'verified_object_archive',external:{archived:archivedExternal,deleted:deletedExternal},runs:{archived:archivedRuns,deleted:deletedRuns}}),{headers:H});
}catch(e){return new Response(JSON.stringify({ok:false,error:msg(e)}),{status:500,headers:H});}});