import { createClient } from "@/lib/supabase/server";
import { hasAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

type DeliveryDetails = {
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  locality: string;
  city: string;
  region: string;
  postal_code: string;
};

function validText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export async function POST(request: Request) {
  if (!hasAllowedRequestOrigin(request)) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId?.startsWith("rzp_test_") || !keySecret) {
    return Response.json({ error: "Razorpay test keys are not configured on the server." }, { status: 503 });
  }

  let body: { idempotencyKey?: unknown; delivery?: Partial<DeliveryDetails> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const d = body.delivery;
  if (!validText(body.idempotencyKey, 100) || !d
    || !validText(d.recipient_name, 160) || !validText(d.phone, 32)
    || !validText(d.address_line1, 240) || (d.address_line2 != null && typeof d.address_line2 !== "string")
    || (typeof d.address_line2 === "string" && d.address_line2.length > 240)
    || !validText(d.locality, 120) || !validText(d.city, 120)
    || !validText(d.region, 120) || !validText(d.postal_code, 20)) {
    return Response.json({ error: "Complete the delivery details and try again." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in before paying." }, { status: 401 });

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id, name").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return Response.json({ error: "The store is unavailable." }, { status: 503 });

  const { data, error } = await supabase.rpc("place_razorpay_order", {
    p_store_id: store.id,
    p_idempotency_key: body.idempotencyKey as string,
    p_recipient_name: d.recipient_name!.trim(),
    p_phone: d.phone!.trim(),
    p_address_line1: d.address_line1!.trim(),
    p_address_line2: d.address_line2?.trim() || null,
    p_locality: d.locality!.trim(),
    p_city: d.city!.trim(),
    p_region: d.region!.trim(),
    p_postal_code: d.postal_code!.trim(),
    p_country_code: "IN",
  });
  const paymentOrder = Array.isArray(data) ? data[0] : data;
  if (error || !paymentOrder) {
    const message = error?.message ?? "Could not prepare the payment.";
    return Response.json({ error: message.includes("Insufficient inventory")
      ? "One or more items are out of stock. Return to your cart and review the items."
      : message.includes("empty") ? "Your cart is empty."
        : "Could not prepare your payment. Check the delivery details and try again." }, { status: 400 });
  }

  const amount = Number(paymentOrder.amount_minor);
  const currency = String(paymentOrder.currency).trim().toUpperCase();
  if (!Number.isSafeInteger(amount) || amount <= 0 || currency !== "INR") {
    return Response.json({ error: "This cart has an unsupported amount or currency." }, { status: 400 });
  }

  let providerOrderId = paymentOrder.provider_order_id as string | null;
  if (!providerOrderId) {
    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency,
          receipt: paymentOrder.order_number,
          notes: { internal_order_id: paymentOrder.order_id },
        }),
        cache: "no-store",
      });
    } catch {
      return Response.json({ error: "Razorpay could not be reached. You can retry checkout." }, { status: 502 });
    }

    const gatewayOrder = await gatewayResponse.json().catch(() => null) as { id?: string } | null;
    if (!gatewayResponse.ok || !gatewayOrder?.id) {
      return Response.json({ error: "Razorpay could not create the payment. Please retry." }, { status: 502 });
    }
    providerOrderId = gatewayOrder.id;
    const { error: attachError } = await supabase.rpc("attach_razorpay_order", {
      p_order_id: paymentOrder.order_id,
      p_provider_order_id: providerOrderId,
    });
    if (attachError) {
      return Response.json({ error: "The payment was created but could not be linked to your order. Contact the store before retrying." }, { status: 502 });
    }
  }

  return Response.json({
    keyId,
    providerOrderId,
    amount,
    currency,
    storeName: store.name,
    orderId: paymentOrder.order_id,
    receipt: paymentOrder.order_number,
    prefill: { name: d.recipient_name!.trim(), contact: d.phone!.trim(), email: user.email ?? "" },
  });
}
