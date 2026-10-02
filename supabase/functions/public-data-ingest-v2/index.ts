import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers={"content-type":"application/json","cache-control":"no-store"};
Deno.serve(()=>new Response(JSON.stringify({
  ok:false,
  retired:true,
  code:"INGESTION_PATH_RETIRED",
  function:"public-data-ingest-v2",
  replacement:"focus-ingestion-orchestrator + corridor-open-data-ingestor",
  message:"This legacy ingestion path is retired. Use the canonical Kleenest ingestion path instead."
}),{status:410,headers}));
