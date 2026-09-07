import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const DEST = "https://sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/cold-provenance-receiver";
const H = { "content-type": "application/json" };
const msg = (e: any) => e instanceof Error ? e.message : String(e?.message || e);

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST required" }), { status: 405, headers: H });
    }
    const supplied = req.headers.get("x-kleenest-scheduler") || "";
    const scheduler = await db.rpc("get_internal_scheduler_secret", { p_name: "kleenest_maps_scheduler" });
    if (scheduler.error || !scheduler.data || supplied !== scheduler.data) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: H });
    }
    const sec = await db.rpc("get_internal_geo_archive_secret");
    if (sec.error || !sec.data) throw sec.error || new Error("archive secret missing");

    const body = await req.json().catch(() => ({}));
    const batches = Math.max(1, Math.min(25, Number(body?.batches || 10)));
    const limit = Math.max(1, Math.min(1000, Number(body?.limit || 1000)));
    let archived = 0;
    let deleted = 0;
    let last: any = null;

    for (let i = 0; i < batches; i++) {
      const b = await db.rpc("cold_external_location_archive_batch", { p_limit: limit });
      if (b.error) throw b.error;
      const rows = Array.isArray(b.data?.rows) ? b.data.rows : [];
      if (!rows.length) {
        last = { rows: 0 };
        break;
      }

      const r = await fetch(DEST, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kleenest-geo-archive": sec.data },
        body: JSON.stringify({ rows }),
        signal: AbortSignal.timeout(60000),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(`receiver ${r.status}: ${t.slice(0, 500)}`);

      const ids = rows.map((x: any) => x.id);
      const a = await db.rpc("cold_external_location_archive_ack", { p_ids: ids });
      if (a.error) throw a.error;
      archived += rows.length;
      deleted += Number(a.data || 0);
      last = { rows: rows.length, deleted: Number(a.data || 0) };
      if (Number(a.data || 0) !== rows.length) {
        throw new Error(`ack mismatch archived=${rows.length} deleted=${a.data}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, archived, deleted, last }), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: msg(e) }), { status: 500, headers: H });
  }
});
