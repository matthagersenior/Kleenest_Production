import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async req => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const scheduler = req.headers.get("x-kleenest-scheduler") ?? "";
  if (!base || !key || !scheduler) return Response.json({ error: "forbidden" }, { status: 403 });
  const headers = { "content-type": "application/json", apikey: key, authorization: "Bearer " + key };
  const rpc = async (name: string, args: unknown) => {
    const r = await fetch(base + "/rest/v1/rpc/" + name, { method: "POST", headers, body: JSON.stringify(args) });
    if (!r.ok) throw Error("rpc_" + name + "_" + r.status);
    return r.json();
  };
  try {
    if (await rpc("kleenest_ai_scheduler_verify", { p_secret: scheduler }) !== true)
      return Response.json({ error: "forbidden" }, { status: 403 });
    const created = await rpc("kleenest_ai_queue_investigations", {});
    const next = await rpc("kleenest_ai_next_investigation", {});
    if (!next?.id) return Response.json({ status: "idle", queued: created });
    const worker = await fetch(base + "/functions/v1/kleenest-ai-worker", {
      method: "POST", headers, body: JSON.stringify({ task_id: next.id })
    });
    const result = await worker.json().catch(() => ({ status: "invalid_worker_response" }));
    return Response.json({
      status: "dispatched", queued: created,
      capability: next.capability, worker_status: result.status ?? "unknown"
    });
  } catch (e) {
    return Response.json({ error: "dispatch_failed", detail: String(e).slice(0, 120) }, { status: 503 });
  }
});