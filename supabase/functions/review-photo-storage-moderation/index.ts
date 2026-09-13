const CORS={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key)return new Response(JSON.stringify({ok:false,error:"Supabase environment unavailable"}),{status:500,headers:{...CORS,"content-type":"application/json"}});
 const body=await req.text();
 const r=await fetch(`${url}/functions/v1/storage-object-deletion`,{method:"POST",headers:{apikey:key,"content-type":"application/json"},body:body||"{}"});
 const text=await r.text();
 return new Response(text,{status:r.status,headers:{...CORS,"content-type":r.headers.get("content-type")||"application/json","Deprecation":"true","X-Kleenest-Canonical-Function":"storage-object-deletion"}});
});
