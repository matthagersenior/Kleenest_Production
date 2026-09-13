import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...CORS,"content-type":"application/json","cache-control":"no-store"}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  if(req.method!=="POST") return json({ok:false,error:"POST required"},405);

  const {data:jobs,error:claimError}=await db.rpc("claim_storage_object_deletion_jobs",{p_limit:20});
  if(claimError) return json({ok:false,error:claimError.message},500);

  let completed=0,failed=0;
  const results:any[]=[];
  for(const job of jobs||[]){
    const {error:removeError}=await db.storage.from(job.bucket_id).remove([job.object_path]);
    if(removeError){
      failed++;
      const message=removeError.message||String(removeError);
      await db.from("storage_object_deletion_jobs")
        .update({
          status:"failed",
          last_error:message.slice(0,1000),
          updated_at:new Date().toISOString()
        })
        .eq("id",job.id)
        .eq("status","processing");
      results.push({id:job.id,ok:false,error:message});
      continue;
    }

    completed++;
    await db.from("storage_object_deletion_jobs")
      .update({
        status:"completed",
        last_error:null,
        processed_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
      .eq("id",job.id)
      .eq("status","processing");
    results.push({id:job.id,ok:true});
  }

  return json({ok:true,claimed:(jobs||[]).length,completed,failed,results});
});
