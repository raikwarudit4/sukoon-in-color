import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TrackingPayload = {
  awb?: unknown;
  courier_name?: unknown;
  current_status?: unknown;
  shipment_status?: unknown;
  current_status_id?: unknown;
  current_timestamp?: unknown;
};

function equalSecret(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function trackingTime(value: unknown) {
  if (typeof value === "string") {
    const legacy = value.match(/^(\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (legacy) return new Date(Date.UTC(Number(legacy[3]), Number(legacy[2]) - 1, Number(legacy[1]), Number(legacy[4]), Number(legacy[5]), Number(legacy[6]))).toISOString();
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function mapStatus(status: string) {
  const value = status.toUpperCase();
  if (value.includes("RTO") || value.includes("RETURN")) return "returned";
  if (value.includes("EXCEPTION") || value.includes("UNDELIVERED") || value.includes("FAILED") || value.includes("NOT DELIVERED")) return "exception";
  if (value.includes("DELIVERED")) return "delivered";
  if (value.includes("TRANSIT") || value.includes("PICKED") || value.includes("OUT FOR DELIVERY") || value === "SHIPPED") return "shipped";
  if (value.includes("READY TO SHIP") || value.includes("PICKUP SCHEDULED") || value.includes("LABEL")) return "labelled";
  return null;
}

export async function POST(request: Request) {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  const supplied = request.headers.get("x-api-key") ?? "";
  if (!expected || !supplied || !equalSecret(supplied, expected)) return Response.json({ error: "Unauthorized webhook." }, { status: 401 });

  let payload: TrackingPayload;
  try { payload = await request.json() as TrackingPayload; } catch { return Response.json({ error: "Invalid tracking event." }, { status: 400 }); }
  // Provider dashboard test pings can be validly authenticated without a real
  // shipment identifier. Acknowledge them so the provider sees HTTP 200.
  if (typeof payload.awb !== "string" || payload.awb.length === 0 || payload.awb.length > 80) {
    return Response.json({ received: true, ignored: "no_awb" });
  }

  let admin;
  try { admin = createAdminClient(); } catch { return Response.json({ error: "Webhook storage is not configured." }, { status: 503 }); }
  const { data: shipment, error: lookupError } = await admin.from("shipments")
    .select("id, store_id, order_id, status, tracking_number, shipped_at, delivered_at")
    .eq("provider", "shiprocket").eq("tracking_number", payload.awb).maybeSingle();
  if (lookupError) return Response.json({ error: "Could not process tracking event." }, { status: 500 });
  if (!shipment) return Response.json({ received: true });

  const providerStatus = typeof payload.current_status === "string" ? payload.current_status.slice(0, 120)
    : typeof payload.shipment_status === "string" ? payload.shipment_status.slice(0, 120) : "Status update";
  const eventTime = trackingTime(payload.current_timestamp);
  const eventKey = `shiprocket:${payload.awb}:${String(payload.current_status_id ?? providerStatus).slice(0, 80)}:${eventTime}`;
  const nextStatus = mapStatus(providerStatus);
  const { error: updateError } = await admin.from("shipments").update({
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(nextStatus === "shipped" && !shipment.shipped_at ? { shipped_at: eventTime } : {}),
    ...(nextStatus === "delivered" && !shipment.delivered_at ? { delivered_at: eventTime } : {}),
    provider_status: providerStatus,
    ...(typeof payload.courier_name === "string" ? { carrier: payload.courier_name.slice(0, 120) } : {}),
    tracking_url: `https://shiprocket.co/tracking/${encodeURIComponent(payload.awb)}`,
    tracking_updated_at: eventTime,
  }).eq("id", shipment.id).eq("store_id", shipment.store_id);
  if (updateError) return Response.json({ error: "Could not update shipment tracking." }, { status: 500 });

  const { error: eventError } = await admin.from("shipment_events").upsert({
    store_id: shipment.store_id,
    order_id: shipment.order_id,
    shipment_id: shipment.id,
    provider_event_key: eventKey,
    status: nextStatus ?? shipment.status,
    detail: providerStatus,
    occurred_at: eventTime,
  }, { onConflict: "provider_event_key", ignoreDuplicates: true });
  if (eventError) return Response.json({ error: "Shipment updated but event history could not be saved." }, { status: 500 });
  return Response.json({ received: true });
}
