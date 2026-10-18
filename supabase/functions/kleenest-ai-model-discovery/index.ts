import { discoverAll } from "../_shared/kleenest-ai-model-discovery.ts";
Deno.serve(async(request:Request)=>{
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!service||request.headers.get("authorization")!=="Bearer "+service)return Response.json({error:"forbidden"},{status:403});
 if(request.method!=="GET")return Response.json({error:"method_not_allowed"},{status:405});
 const results=await discoverAll(name=>Deno.env.get(name));
 return Response.json({results,mode:"read_only_discovery",paid_inference_calls:0},{headers:{"cache-control":"no-store"}});
});
