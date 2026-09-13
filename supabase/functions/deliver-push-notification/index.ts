import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); } catch { return {}; }
})();
const SUPABASE_SECRET_KEY = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:notifications@kleenest.app";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-kleenest-worker-secret","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json",...cors } });
}

async function authorized(req: Request) {
  const provided = req.headers.get("x-kleenest-worker-secret") ?? "";
  if (!provided) return false;
  const { data, error } = await supabase.rpc("get_push_worker_secret");
  return !error && typeof data === "string" && data.length > 0 && provided === data;
}

Deno.serve(async (req) => {
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method==="GET"){
    if(!VAPID_PUBLIC_KEY)return json({error:"Web push is not configured"},503);
    return json({vapid_public_key:VAPID_PUBLIC_KEY});
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!await authorized(req)) return json({ error: "Unauthorized" }, 401);
  if (!SUPABASE_SECRET_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: "Push delivery secrets are not configured" }, 500);

  try {
    const payload = await req.json().catch(() => ({}));
    const notificationId = payload?.record?.id ?? payload?.notification_id;
    if (!notificationId) return json({ error: "notification_id is required" }, 400);

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("id,user_id,type,title,body,data,created_at")
      .eq("id", notificationId)
      .single();
    if (notificationError || !notification) return json({ error: notificationError?.message ?? "Notification not found" }, 404);

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("notification_push_subscriptions")
      .select("id,endpoint,subscription")
      .eq("user_id", notification.user_id);
    if (subscriptionsError) return json({ error: subscriptionsError.message }, 500);

    if (!subscriptions?.length) return json({ notification_id: notificationId, delivered: 0, skipped: 0 });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const targetUrl=notification.data?.url ?? "/Kleenest_Production/fleet/notifications/";
    const message = JSON.stringify({
      title: notification.title,
      body: notification.body ?? "",
      type: notification.type,
      url: targetUrl,
      notification_id: notification.id,
      data: { ...(notification.data ?? {}), url: targetUrl, notification_id: notification.id },
    });

    let delivered = 0;
    let skipped = 0;
    const results: Array<{ subscription_id: string; status: string }> = [];

    for (const subscription of subscriptions) {
      const { data: existing } = await supabase
        .from("notification_push_deliveries")
        .select("id,status")
        .eq("notification_id", notification.id)
        .eq("subscription_id", subscription.id)
        .maybeSingle();
      if (existing?.status === "sent" || existing?.status === "expired") {
        skipped++;
        continue;
      }

      await supabase.from("notification_push_deliveries").upsert({
        notification_id: notification.id,
        subscription_id: subscription.id,
        status: "pending",
        attempts: (existing?.status ? 1 : 0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "notification_id,subscription_id" });

      try {
        await webpush.sendNotification(subscription.subscription, message, { TTL: 3600, urgency: "normal" });
        await supabase.from("notification_push_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("notification_id", notification.id).eq("subscription_id", subscription.id);
        delivered++;
        results.push({ subscription_id: subscription.id, status: "sent" });
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0);
        const messageText = error instanceof Error ? error.message : String(error);
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("notification_push_subscriptions").delete().eq("id", subscription.id);
          await supabase.from("notification_push_deliveries").update({ status: "expired", last_error: messageText.slice(0, 1000), updated_at: new Date().toISOString() }).eq("notification_id", notification.id).eq("subscription_id", subscription.id);
          results.push({ subscription_id: subscription.id, status: "expired" });
        } else {
          await supabase.from("notification_push_deliveries").update({ status: "failed", last_error: messageText.slice(0, 1000), updated_at: new Date().toISOString() }).eq("notification_id", notification.id).eq("subscription_id", subscription.id);
          results.push({ subscription_id: subscription.id, status: "failed" });
        }
      }
    }

    return json({ notification_id: notification.id, delivered, skipped, results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
