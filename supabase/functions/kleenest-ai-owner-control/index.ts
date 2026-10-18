import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { discoverAll } from "../_shared/kleenest-ai-model-discovery.ts";
Deno.serve(async req=>{
 const base=Deno.env.get("SUPABASE_URL")??"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const token=(req.headers.get("authorization")??"").replace(/^Bearer\s+/i,"");
 if(!token||!service)return Response.json({error:"unauthorized"},{status:401});
 const userResponse=await fetch(base+"/auth/v1/user",{headers:{apikey:service,authorization:"Bearer "+token}});
 if(!userResponse.ok)return Response.json({error:"unauthorized"},{status:401});
 const user=await userResponse.json();
 if(!user.id)return Response.json({error:"unauthorized"},{status:401});
 const authResponse=await fetch(base+"/rest/v1/rpc/is_platform_owner",{method:"POST",headers:{"content-type":"application/json",apikey:service,authorization:"Bearer "+token},body:JSON.stringify({p_user_id:user.id})});
 if(!authResponse.ok||await authResponse.json()!==true)return Response.json({error:"forbidden"},{status:403});
 if(req.method==="GET"){
  const results=await discoverAll(name=>Deno.env.get(name));
  return Response.json({providers:results.map(({provider,status,models})=>({provider,status,model_count:models.length})),paid_inference_calls:0},{headers:{"cache-control":"no-store"}});
 }
 if(req.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
 let task_id:string;try{task_id=(await req.json()).task_id}catch{return Response.json({error:"invalid_json"},{status:400})}
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(task_id??""))return Response.json({error:"invalid_task_id"},{status:400});
 const response=await fetch(base+"/functions/v1/kleenest-ai-worker",{method:"POST",headers:{"content-type":"application/json",apikey:service,authorization:"Bearer "+service},body:JSON.stringify({task_id})});
 const result=await response.json().catch(()=>({error:"worker_invalid_response"}));
 return Response.json(result,{status:response.status,headers:{"cache-control":"no-store"}});
});