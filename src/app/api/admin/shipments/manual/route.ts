import { createClient } from "@/lib/supabase/server";
import { hasAllowedRequestOrigin } from "@/lib/request-origin";
import { getShiprocketMode } from "@/lib/shiprocket/mode";
import { hasStorePermission } from "@/lib/auth/store-permissions";

export const runtime = "nodejs";

type ManualShipmentInput = {
  orderId?: unknown;
  providerOrderId?: unknown;
  providerShipmentId?: unknown;
  carrier?: unknown;
  trackingNumber?: unknown;
  trackingUrl?: unknown;
};

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" && value.trim().length <= maxLength ? value.trim() : null;
}

export async function POST(request: Request) {
  if (!hasAllowedRequestOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  if (getShiprocketMode() !== "live") return Response.json({ error: "Manual shipment entry is available only in live mode." }, { status: 409 });

  let body: ManualShipmentInput;
  try { body = await request.json() as ManualShipmentInput; } catch { return Response.json({ error: "Invalid manual shipment details." }, { status: 400 }); }
  if (typeof body.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
    return Response.json({ error: "Invalid order." }, { status: 400 });
  }

  const providerOrderId = optionalText(body.providerOrderId, 100);
  const providerShipmentId = optionalText(body.providerShipmentId, 100);
  const carrier = optionalText(body.carrier, 120);
  const trackingNumber = optionalText(body.trackingNumber, 80);
  const trackingUrl = optionalText(body.trackingUrl, 500);
  if (providerOrderId === null || providerShipmentId === null || !carrier || carrier === null
    || !trackingNumber || trackingNumber === null || !/^[A-Za-z0-9._/-]{3,80}$/.test(trackingNumber)
    || trackingUrl === null) {
    return Response.json({ error: "Enter a courier name and valid AWB. Optional IDs and tracking URL must also be valid." }, { status: 400 });
  }
  if (trackingUrl) {
    try {
      if (new URL(trackingUrl).protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      return Response.json({ error: "Tracking URL must be a valid HTTPS URL." }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in with the store account." }, { status: 401 });
  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return Response.json({ error: "The store is unavailable." }, { status: 503 });
  if (!(await hasStorePermission(supabase, store.id, "orders.manage"))) return Response.json({ error: "Order management permission is required." }, { status: 403 });

  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id, status, payments(provider, status)")
    .eq("store_id", store.id).eq("id", body.orderId).maybeSingle();
  if (orderError || !order) return Response.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "processing") return Response.json({ error: "Only processing orders can receive shipment tracking details." }, { status: 409 });
  const payment = order.payments[0];
  if (!payment || (payment.provider === "razorpay" && payment.status !== "captured")) {
    return Response.json({ error: "Online payment must be captured before shipment tracking can be recorded." }, { status: 409 });
  }

  const { data: existing, error: existingError } = await supabase.from("shipments")
    .select("id, provider_order_id, provider_shipment_id, tracking_number")
    .eq("store_id", store.id).eq("order_id", order.id).eq("provider", "shiprocket").maybeSingle();
  if (existingError) return Response.json({ error: "Could not check existing shipment details." }, { status: 503 });
  if (existing?.tracking_number) return Response.json({ error: "Tracking is already recorded for this order." }, { status: 409 });

  const trackingReference = `SIC${order.id.replaceAll("-", "").slice(0, 17)}`;
  const trackingData = {
    provider_order_id: providerOrderId || existing?.provider_order_id || null,
    provider_shipment_id: providerShipmentId || existing?.provider_shipment_id || null,
    carrier,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl || null,
    status: "labelled" as const,
    provider_status: "Tracking details entered manually by store.",
    tracking_updated_at: new Date().toISOString(),
  };

  const save = existing
    ? await supabase.from("shipments").update(trackingData).eq("id", existing.id).eq("store_id", store.id)
      .select("id, provider, provider_order_id, provider_shipment_id, carrier, tracking_number, status, provider_status, tracking_url, tracking_updated_at").single()
    : await supabase.from("shipments").insert({
      store_id: store.id,
      order_id: order.id,
      provider: "shiprocket",
      provider_order_reference: trackingReference,
      ...trackingData,
    }).select("id, provider, provider_order_id, provider_shipment_id, carrier, tracking_number, status, provider_status, tracking_url, tracking_updated_at").single();
  if (save.error) return Response.json({ error: "Could not save manual tracking details. Refresh and retry." }, { status: 503 });
  return Response.json({ shipment: save.data, manuallyEntered: true });
}
