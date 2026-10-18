import { createClient } from "@/lib/supabase/server";
import { hasAllowedRequestOrigin } from "@/lib/request-origin";
import { getShiprocketBaseUrl, getShiprocketMode, getShiprocketToken } from "@/lib/shiprocket/mode";
import { hasStorePermission } from "@/lib/auth/store-permissions";

export const runtime = "nodejs";

type ProviderOrder = {
  channel_order_id?: string;
  shipments?: { id?: number | string; awb?: string; awb_code?: string; courier?: string; courier_name?: string }[] | {
    id?: number | string; awb?: string; awb_code?: string; courier?: string; courier_name?: string;
  };
};

export async function POST(request: Request) {
  if (!hasAllowedRequestOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  let body: { orderId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid shipment sync request." }, { status: 400 }); }
  if (typeof body.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId)) return Response.json({ error: "Invalid order." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in with the store account." }, { status: 401 });
  const { data: store } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (!store) return Response.json({ error: "The store is unavailable." }, { status: 503 });
  if (!(await hasStorePermission(supabase, store.id, "orders.manage"))) return Response.json({ error: "Order management permission is required." }, { status: 403 });

  const { data: shipment, error: shipmentError } = await supabase.from("shipments")
    .select("id, provider_order_reference, provider_order_id, provider_shipment_id, tracking_number")
    .eq("store_id", store.id).eq("order_id", body.orderId).eq("provider", "shiprocket").maybeSingle();
  if (shipmentError || !shipment) return Response.json({ error: "Shiprocket order not found." }, { status: 404 });
  if (shipment.tracking_number) return Response.json({ shipment, alreadySynced: true });

  const mode = getShiprocketMode();
  if (mode === "disabled") return Response.json({ error: "Shipping integration is disabled. Set SHIPROCKET_MODE to mock, sandbox, or live on the server." }, { status: 503 });
  if (mode === "mock") {
    const awb = `TEST${shipment.provider_order_reference.slice(-17)}`;
    const { data: updated, error: updateError } = await supabase.from("shipments").update({
      tracking_number: awb,
      carrier: "Sandbox demo courier",
      tracking_url: null,
      status: "labelled",
      provider_status: "Sandbox simulation: fake AWB assigned; no courier booking was made.",
      tracking_updated_at: new Date().toISOString(),
    }).eq("id", shipment.id).eq("store_id", store.id)
      .select("id, provider, provider_order_id, provider_shipment_id, carrier, tracking_number, status, provider_status, tracking_url, tracking_updated_at")
      .single();
    if (updateError) return Response.json({ error: "Could not save the simulated AWB. Refresh and retry." }, { status: 503 });
    return Response.json({ shipment: updated, mode });
  }

  try {
    const token = await getShiprocketToken(mode);
    const response = await fetch(`${getShiprocketBaseUrl(mode)}/orders?search=${encodeURIComponent(shipment.provider_order_reference)}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store",
    });
    const result = await response.json().catch(() => null) as { data?: ProviderOrder[] } | null;
    if (!response.ok) return Response.json({ error: "Shiprocket could not return this order yet. Try again shortly." }, { status: 502 });
    const providerOrder = result?.data?.find((item) => item.channel_order_id === shipment.provider_order_reference);
    const providerShipments = Array.isArray(providerOrder?.shipments) ? providerOrder.shipments : providerOrder?.shipments ? [providerOrder.shipments] : [];
    const providerShipment = providerShipments.find((item) => Boolean(item.awb || item.awb_code));
    const awb = providerShipment?.awb || providerShipment?.awb_code;
    if (!awb) return Response.json({ error: "No AWB yet. Select a courier and generate the AWB in Shiprocket, then sync again." }, { status: 409 });

    const { data: updated, error: updateError } = await supabase.from("shipments").update({
      provider_shipment_id: providerShipment?.id ? String(providerShipment.id) : shipment.provider_shipment_id,
      tracking_number: awb,
      carrier: providerShipment?.courier || providerShipment?.courier_name || "Shiprocket courier",
      tracking_url: `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`,
      status: "labelled",
      provider_status: "AWB assigned; waiting for courier pickup.",
      tracking_updated_at: new Date().toISOString(),
    }).eq("id", shipment.id).eq("store_id", store.id)
      .select("id, provider, provider_order_id, provider_shipment_id, carrier, tracking_number, status, provider_status, tracking_url, tracking_updated_at")
      .single();
    if (updateError) return Response.json({ error: "AWB found, but the shop could not save tracking details. Refresh and retry." }, { status: 503 });
    return Response.json({ shipment: updated, mode });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured") ? error.message : "Could not connect to Shiprocket.";
    return Response.json({ error: message }, { status: message.includes("not configured") ? 503 : 502 });
  }
}
