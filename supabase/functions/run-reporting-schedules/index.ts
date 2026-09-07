import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

Deno.serve(async (req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const auth=req.headers.get("Authorization");
  if(!auth)return json({error:"Missing authorization"},401);

  const supabase=createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {global:{headers:{Authorization:auth}}}
  );
  const{data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user)return json({error:"Unauthorized"},401);

  const{data,error}=await supabase.rpc("run_user_due_reporting_schedules");
  if(error)return json({error:error.message},400);
  return json(data??{processed:0});
});
