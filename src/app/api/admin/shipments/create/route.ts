import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedRequestOrigin } from "@/lib/request-origin";
import { getShiprocketBaseUrl, getShiprocketMode, getShiprocketToken } from "@/lib/shiprocket/mode";

export const runtime = "nodejs";

type PackageDetails = { weightKg?: unknown; lengthCm?: unknown; breadthCm?: unknown; heightCm?: unknown };
type ShiprocketResponse = { order_id?: number | string; shipment_id?: number | string; message?: string };

function validDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 200;
}

function rupees(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export async function POST(request: Request) {
  if (!hasAllowedRequestOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });

  let body: { orderId?: unknown; parcel?: PackageDetails };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid shipment request." }, { status: 400 }); }
  if (typeof body.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId)
    || !body.parcel || !validDimension(body.parcel.weightKg)
    || !validDimension(body.parcel.lengthCm) || !validDimension(body.parcel.breadthCm)
    || !validDimension(body.parcel.heightCm) || body.parcel.weightKg > 50) {
    return Response.json({ error: "Enter a valid order and parcel weight and dimensions." }, { status: 400 });
  }

  const mode = getShiprocketMode();
  if (mode === "disabled") return Response.json({ error: "Shipping integration is disabled. Set SHIPROCKET_MODE to mock, sandbox, or live on the server." }, { status: 503 });
  const pickupLocation = mode === "sandbox" ? process.env.SHIPROCKET_SANDBOX_PICKUP_LOCATION : process.env.SHIPROCKET_PICKUP_LOCATION;
  if (mode !== "mock" && !pickupLocation) {
    const name = mode === "sandbox" ? "SHIPROCKET_SANDBOX_PICKUP_LOCATION" : "SHIPROCKET_PICKUP_LOCATION";
    return Response.json({ error: `Set ${name} in the server environment first.` }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in with the store account." }, { status: 401 });

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return Response.json({ error: "The store is unavailable." }, { status: 503 });
  const { data: isMember, error: memberError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (memberError || isMember !== true) return Response.json({ error: "Store membership is required." }, { status: 403 });

  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id, order_number, status, user_id, currency, subtotal_minor, shipping_minor, total_minor, order_addresses(kind, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, country_code), order_items(sku_snapshot, product_name_snapshot, quantity, line_total_minor), payments(provider, status)")
    .eq("store_id", store.id).eq("id", body.orderId).maybeSingle();
  if (orderError || !order) return Response.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "processing") return Response.json({ error: "Only processing orders can be sent to Shiprocket." }, { status: 409 });
  if (order.currency.trim().toUpperCase() !== "INR") return Response.json({ error: "Shiprocket integration currently supports INR orders only." }, { status: 409 });

  const payment = order.payments[0];
  if (!payment || (payment.provider === "razorpay" && payment.status !== "captured")) {
    return Response.json({ error: "Online payment must be captured before creating a shipment." }, { status: 409 });
  }
  const address = order.order_addresses.find((item) => item.kind === "shipping");
  if (!address || !address.phone || !/^\d{6}$/.test(address.postal_code) || address.country_code.trim().toUpperCase() !== "IN") {
    return Response.json({ error: "The order needs a phone number and six-digit Indian delivery PIN code." }, { status: 409 });
  }
  if (!order.order_items.length) return Response.json({ error: "This order has no items." }, { status: 409 });

  const reference = `SIC${order.id.replaceAll("-", "").slice(0, 17)}`;
  const { data: existing, error: existingError } = await supabase.from("shipments")
    .select("id, provider_order_id, provider_shipment_id, status, provider_status")
    .eq("store_id", store.id).eq("order_id", order.id).maybeSingle();
  if (existingError) return Response.json({ error: "Could not check existing shipment data. Apply migration 059 and retry." }, { status: 503 });
  if (existing?.provider_order_id) return Response.json({ shipment: existing, alreadyCreated: true });
  if (existing) return Response.json({ error: "A shipment record already exists without a provider order. Review it in the admin panel before retrying." }, { status: 409 });

  if (mode === "mock") {
    const { data: shipment, error: saveError } = await supabase.from("shipments").insert({
      store_id: store.id,
      order_id: order.id,
      provider: "shiprocket",
      provider_order_reference: reference,
      provider_order_id: `MOCK-ORDER-${reference}`,
      provider_shipment_id: `MOCK-SHIPMENT-${reference}`,
      carrier: "Sandbox simulation",
      status: "pending",
      provider_status: "Sandbox simulation: no Shiprocket API call or courier booking was made.",
    }).select("id, provider_order_id, provider_shipment_id, status, provider_status").single();
    if (saveError) return Response.json({ error: "Could not save the simulated shipment. Apply migration 059 and retry." }, { status: 503 });
    return Response.json({ shipment, alreadyCreated: false, mode });
  }

  let customerEmail = "";
  if (order.user_id) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin.from("users").select("auth_user_id").eq("id", order.user_id).maybeSingle();
      if (profile?.auth_user_id) {
        const { data: customer } = await admin.auth.admin.getUserById(profile.auth_user_id);
        customerEmail = customer.user?.email ?? "";
      }
    } catch {
      // Email is optional in Shiprocket's custom-order payload.
    }
  }
  const parts = address.recipient_name.trim().split(/\s+/);
  const firstName = parts.shift() || "Customer";
  const lastName = parts.join(" ") || firstName;
  const orderDate = new Date().toISOString().slice(0, 16).replace("T", " ");
  const requestData = {
    order_id: reference,
    order_date: orderDate,
    pickup_location: pickupLocation,
    comment: `SukoonInColor order ${order.order_number}`,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: address.address_line1,
    billing_address_2: address.address_line2 ?? "",
    billing_city: address.city,
    billing_pincode: address.postal_code,
    billing_state: address.region,
    billing_country: "India",
    billing_email: customerEmail,
    billing_phone: address.phone,
    shipping_is_billing: false,
    shipping_customer_name: firstName,
    shipping_last_name: lastName,
    shipping_address: `${address.address_line1}${address.address_line2 ? `, ${address.address_line2}` : ""}, ${address.locality}`,
    shipping_address_2: "",
    shipping_city: address.city,
    shipping_pincode: address.postal_code,
    shipping_state: address.region,
    shipping_country: "India",
    shipping_email: customerEmail,
    shipping_phone: address.phone,
    order_items: order.order_items.map((item) => ({
      name: item.product_name_snapshot,
      sku: item.sku_snapshot,
      units: item.quantity,
      selling_price: rupees(Math.round(item.line_total_minor / item.quantity)),
      discount: 0,
      tax: 0,
    })),
    payment_method: payment.provider === "cash_on_delivery" ? "COD" : "Prepaid",
    shipping_charges: rupees(order.shipping_minor),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: 0,
    sub_total: rupees(order.subtotal_minor),
    length: body.parcel.lengthCm,
    breadth: body.parcel.breadthCm,
    height: body.parcel.heightCm,
    weight: body.parcel.weightKg,
  };

  try {
    const token = await getShiprocketToken(mode);
    const providerResponse = await fetch(`${getShiprocketBaseUrl(mode)}/orders/create/adhoc`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
      cache: "no-store",
    });
    const providerBody = await providerResponse.json().catch(() => null) as ShiprocketResponse | null;
    if (!providerResponse.ok || !providerBody?.order_id) {
      return Response.json({ error: "Shiprocket could not create the order. Check pickup location and address details in the provider account." }, { status: 502 });
    }

    const { data: shipment, error: saveError } = await supabase.from("shipments").insert({
      store_id: store.id,
      order_id: order.id,
      provider: "shiprocket",
      provider_order_reference: reference,
      provider_order_id: String(providerBody.order_id),
      provider_shipment_id: providerBody.shipment_id ? String(providerBody.shipment_id) : null,
      carrier: "Shiprocket",
      status: "pending",
      provider_status: "Order created; courier selection required in Shiprocket.",
    }).select("id, provider_order_id, provider_shipment_id, status, provider_status").single();
    if (saveError) return Response.json({ error: "Shiprocket created the order, but the shop could not save its reference. Contact the store before retrying.", providerOrderReference: reference }, { status: 502 });
    return Response.json({ shipment, alreadyCreated: false, mode });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "Could not connect to Shiprocket. No shipment confirmation was received.";
    return Response.json({ error: message }, { status: message.includes("not configured") ? 503 : 502 });
  }
}
