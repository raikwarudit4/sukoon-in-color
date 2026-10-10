"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentChoice = "cod" | "razorpay";
type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let checkoutScript: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout is only available in a browser."));
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout did not load."));
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(script);
  });
  return checkoutScript;
}

export function CheckoutForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const requestKeys = useRef<{ cod?: string; razorpay?: string }>({});
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cod");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<{
    orderId: string;
    payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
  } | null>(null);

  async function verifyPayment(orderId: string, payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const verification = await fetch("/api/payments/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, ...payment }),
    });
    const result = await verification.json() as { orderId?: string; error?: string };
    if (!verification.ok || !result.orderId) throw new Error(result.error ?? "Payment verification failed.");
    setPendingVerification(null);
    router.push(`/checkout/success?order=${encodeURIComponent(result.orderId)}`);
    router.refresh();
  }

  function reportCheckoutError(message: string) {
    setError(message.includes("Insufficient inventory")
      ? "One or more items are currently out of stock. Please contact the store or remove them from your cart."
      : message.includes("empty")
        ? "Your cart is empty. Return to the collection to choose products."
        : "We could not place your order. Check the delivery details and try again.");
  }

  async function submitCod(form: FormData) {
    requestKeys.current.cod ??= `cod:${crypto.randomUUID()}`;
    const supabase = createClient();
    const { data, error: checkoutError } = await supabase.rpc("place_cod_order", {
      p_store_id: storeId,
      p_idempotency_key: requestKeys.current.cod,
      p_recipient_name: form.get("recipient_name"),
      p_phone: form.get("phone"),
      p_address_line1: form.get("address_line1"),
      p_address_line2: form.get("address_line2"),
      p_locality: form.get("locality"),
      p_city: form.get("city"),
      p_region: form.get("region"),
      p_postal_code: form.get("postal_code"),
      p_country_code: "IN",
    });
    if (checkoutError || !data) {
      reportCheckoutError(checkoutError?.message ?? "Could not place the order.");
      setSaving(false);
      return;
    }
    router.push(`/checkout/success?order=${encodeURIComponent(data)}`);
    router.refresh();
  }

  async function submitRazorpay(form: FormData) {
    requestKeys.current.razorpay ??= `razorpay:${crypto.randomUUID()}`;
    try {
      const response = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: requestKeys.current.razorpay,
          delivery: {
            recipient_name: form.get("recipient_name"),
            phone: form.get("phone"),
            address_line1: form.get("address_line1"),
            address_line2: form.get("address_line2"),
            locality: form.get("locality"),
            city: form.get("city"),
            region: form.get("region"),
            postal_code: form.get("postal_code"),
          },
        }),
      });
      const result = await response.json() as {
        error?: string; keyId?: string; providerOrderId?: string; amount?: number; currency?: string;
        storeName?: string; orderId?: string; receipt?: string;
        prefill?: { name: string; email: string; contact: string };
      };
      if (!response.ok || !result.keyId || !result.providerOrderId || !result.orderId
        || !result.amount || !result.currency || !result.receipt || !result.prefill) {
        throw new Error(result.error ?? "Could not prepare Razorpay checkout.");
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout did not load.");
      const checkout = new window.Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: result.storeName ?? "Sukoon In Color",
        description: `Order ${result.receipt}`,
        order_id: result.providerOrderId,
        prefill: result.prefill,
        theme: { color: "#a15e61" },
        handler: async (payment) => {
          setPendingVerification({ orderId: result.orderId!, payment });
          try {
            await verifyPayment(result.orderId!, payment);
          } catch {
            setError("We could not verify the payment yet. Retry verification below before attempting another payment.");
            setSaving(false);
          }
        },
        modal: { ondismiss: () => setSaving(false) },
      });
      checkout.open();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start Razorpay checkout.");
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    if (paymentChoice === "razorpay") await submitRazorpay(form);
    else await submitCod(form);
  }

  const inputClass = "mt-1 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-sm outline-none focus:border-[#a15e61]";
  return <form onSubmit={submit} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
    <h2 className="text-lg font-medium">Delivery address</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Full name<input className={inputClass} name="recipient_name" autoComplete="name" required maxLength={160} /></label>
      <label className="text-sm">Phone<input className={inputClass} name="phone" type="tel" autoComplete="tel" required maxLength={32} /></label>
      <label className="text-sm">Postal code<input className={inputClass} name="postal_code" autoComplete="postal-code" required maxLength={20} /></label>
      <label className="text-sm sm:col-span-2">Address<input className={inputClass} name="address_line1" autoComplete="address-line1" required maxLength={240} /></label>
      <label className="text-sm sm:col-span-2">Apartment, suite, etc. (optional)<input className={inputClass} name="address_line2" autoComplete="address-line2" maxLength={240} /></label>
      <label className="text-sm">Area / locality<input className={inputClass} name="locality" autoComplete="address-level3" required maxLength={120} /></label>
      <label className="text-sm">City<input className={inputClass} name="city" autoComplete="address-level2" required maxLength={120} /></label>
      <label className="text-sm sm:col-span-2">State / region<input className={inputClass} name="region" autoComplete="address-level1" required maxLength={120} /></label>
    </div>
    <fieldset className="mt-6">
      <legend className="text-sm font-medium">Payment method</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border p-4 text-sm ${paymentChoice === "cod" ? "border-[#a15e61] bg-[#fbf8f4]" : "border-[#eee5de]"}`}>
          <input className="mr-2 accent-[#a15e61]" type="radio" name="payment_method" value="cod" checked={paymentChoice === "cod"} onChange={() => setPaymentChoice("cod")} />
          <strong>Cash on delivery</strong><p className="mt-1 pl-6 text-xs text-[#716763]">Pay when your order arrives.</p>
        </label>
        <label className={`cursor-pointer rounded-xl border p-4 text-sm ${paymentChoice === "razorpay" ? "border-[#a15e61] bg-[#fbf8f4]" : "border-[#eee5de]"}`}>
          <input className="mr-2 accent-[#a15e61]" type="radio" name="payment_method" value="razorpay" checked={paymentChoice === "razorpay"} onChange={() => setPaymentChoice("razorpay")} />
          <strong>Pay online</strong><p className="mt-1 pl-6 text-xs text-[#716763]">Secure test checkout with Razorpay.</p>
        </label>
      </div>
    </fieldset>
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff3f1] p-3 text-sm text-[#7c4548]">{error}</p>}
    {pendingVerification && <button type="button" disabled={saving} onClick={async () => {
      setSaving(true);
      setError("");
      try { await verifyPayment(pendingVerification.orderId, pendingVerification.payment); }
      catch (verificationError) {
        setError(verificationError instanceof Error ? verificationError.message : "Payment verification is still unavailable.");
        setSaving(false);
      }
    }} className="mt-4 w-full rounded-xl border border-[#a15e61] px-5 py-3 text-sm font-semibold text-[#884d50] disabled:opacity-60">Retry payment verification</button>}
    <button disabled={saving} className="mt-6 w-full rounded-xl bg-[#a15e61] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#884d50] disabled:opacity-60">
      {saving ? paymentChoice === "razorpay" ? "Opening secure checkout…" : "Placing order…" : paymentChoice === "razorpay" ? "Continue to payment" : "Place order"}
    </button>
  </form>;
}
