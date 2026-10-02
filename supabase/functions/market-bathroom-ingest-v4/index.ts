import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers={"content-type":"application/json","cache-control":"no-store"};
Deno.serve(()=>new Response(JSON.stringify({
  ok:false,
  retired:true,
  code:"INGESTION_PATH_RETIRED",
  function:"market-bathroom-ingest-v4",
  replacement:"focus-ingestion-orchestrator",
  message:"This legacy ingestion path is retired. Use the canonical Kleenest ingestion path instead."
}),{status:410,headers}));
