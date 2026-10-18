import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {auth:{persistSession:false}});
const H={'content-type':'application/json'};
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
Deno.serve(async(req)=>{
 try{
  if(req.method!=='POST')return new Response(JSON.stringify({ok:false,error:'POST required'}),{status:405,headers:H});
  const supplied=req.headers.get('x-kleenest-geo-archive')||'';
  const secret=await db.rpc('get_internal_geo_archive_secret');
  if(secret.error||!secret.data||supplied!==secret.data)
    return new Response(JSON.stringify({ok:false,error:'unauthorized'}),{status:401,headers:H});
  const body=await req.json().catch(()=>({}));
  const retirements=Array.isArray(body.retirements)?body.retirements:[];
  const rows=Array.isArray(body.rows)?body.rows:[];
  if(retirements.length){
   if(rows.length||retirements.length>100)
     return new Response(JSON.stringify({ok:false,error:'retirements must contain 1..100 items without rows'}),{status:400,headers:H});
   const result=await db.rpc('apply_geo_catalog_retirements',{p_items:retirements});
   if(result.error)throw result.error;
   return new Response(JSON.stringify({ok:true,...result.data}),{headers:H});
  }
  if(!rows.length||rows.length>2000)
   return new Response(JSON.stringify({ok:false,error:'rows must contain 1..2000 items'}),{status:400,headers:H});
  const result=await db.rpc('ingest_geo_archive_rows',{p_rows:rows});
  if(result.error)throw result.error;
  return new Response(JSON.stringify({ok:true,...result.data}),{headers:H});
 }catch(e){
  return new Response(JSON.stringify({ok:false,error:msg(e)}),{status:500,headers:H});
 }
});