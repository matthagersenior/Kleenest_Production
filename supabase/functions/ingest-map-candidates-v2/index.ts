import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers={"content-type":"application/json","cache-control":"no-store"};
Deno.serve(()=>new Response(JSON.stringify({
  ok:false,
  retired:true,
  code:"INGESTION_PATH_RETIRED",
  function:"ingest-map-candidates-v2",
  replacement:"ingest-map-candidates-v3",
  message:"This legacy ingestion path is retired. Use the canonical Kleenest ingestion path instead."
}),{status:410,headers}));
