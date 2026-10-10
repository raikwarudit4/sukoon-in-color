import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PaymentContext = {
  payment_id: string;
  amount_minor: number;
  currency: string;
  provider_order_id: string | null;
  payment_status: string;
  provider_payment_id: string | null;
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId?.startsWith("rzp_test_") || !keySecret) {
    return Response.json({ error: "Razorpay test keys are not configured on the server." }, { status: 503 });
  }

  let body: { orderId?: unknown; razorpay_order_id?: unknown; razorpay_payment_id?: unknown; razorpay_signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid payment response." }, { status: 400 });
  }
  if (typeof body.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId)
    || typeof body.razorpay_order_id !== "string" || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id)
    || typeof body.razorpay_payment_id !== "string" || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id)
    || typeof body.razorpay_signature !== "string" || !/^[a-f0-9]{64}$/i.test(body.razorpay_signature)) {
    return Response.json({ error: "Payment response is incomplete." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to verify this payment." }, { status: 401 });

  const { data, error: contextError } = await supabase.rpc("get_razorpay_payment_context", { p_order_id: body.orderId });
  const context = (Array.isArray(data) ? data[0] : data) as PaymentContext | null;
  if (contextError || !context || !context.provider_order_id) {
    return Response.json({ error: "The payment does not match an order on this account." }, { status: 404 });
  }
  if (context.provider_order_id !== body.razorpay_order_id) {
    return Response.json({ error: "The payment order does not match." }, { status: 400 });
  }

  const expected = createHmac("sha256", keySecret)
    .update(`${context.provider_order_id}|${body.razorpay_payment_id}`)
    .digest();
  const received = Buffer.from(body.razorpay_signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: "Razorpay signature verification failed." }, { status: 400 });
  }
  if (context.payment_status === "captured" && context.provider_payment_id === body.razorpay_payment_id) {
    return Response.json({ orderId: body.orderId });
  }

  let paymentResponse: Response;
  try {
    paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(body.razorpay_payment_id)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Could not confirm the payment with Razorpay. Please retry." }, { status: 502 });
  }
  const payment = await paymentResponse.json().catch(() => null) as {
    id?: string; order_id?: string; amount?: number; currency?: string; status?: string; captured?: boolean;
  } | null;
  if (!paymentResponse.ok || !payment
    || payment.id !== body.razorpay_payment_id
    || payment.order_id !== context.provider_order_id
    || Number(payment.amount) !== Number(context.amount_minor)
    || payment.currency?.toUpperCase() !== context.currency.trim().toUpperCase()) {
    return Response.json({ error: "Razorpay payment details did not match this order." }, { status: 400 });
  }
  if (payment.status !== "captured" || payment.captured !== true) {
    return Response.json({ error: "Payment is not captured yet. Please wait briefly and retry, or contact the store." }, { status: 409 });
  }

  const { error: recordError } = await supabase.rpc("record_razorpay_capture", {
    p_order_id: body.orderId,
    p_provider_order_id: context.provider_order_id,
    p_provider_payment_id: body.razorpay_payment_id,
    p_amount_minor: Number(payment.amount),
    p_currency: payment.currency,
  });
  if (recordError) return Response.json({ error: "Payment was captured but could not be recorded. Contact the store with your Razorpay payment ID." }, { status: 503 });

  return Response.json({ orderId: body.orderId });
}
