"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CheckoutForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    requestKey.current ??= crypto.randomUUID();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data, error: checkoutError } = await supabase.rpc("place_cod_order", {
      p_store_id: storeId,
      p_idempotency_key: requestKey.current,
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
    setSaving(false);
    if (checkoutError || !data) {
      const message = checkoutError?.message ?? "Could not place the order.";
      setError(message.includes("Insufficient inventory")
        ? "One or more items are currently out of stock. Please contact the store or remove them from your cart."
        : message.includes("empty")
          ? "Your cart is empty. Return to the collection to choose products."
          : "We could not place your order. Check the delivery details and try again.");
      return;
    }
    router.push(`/checkout/success?order=${encodeURIComponent(data)}`);
    router.refresh();
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
    <div className="mt-6 rounded-xl bg-[#fbf8f4] p-4 text-sm"><strong>Cash on delivery</strong><p className="mt-1 text-[#716763]">Pay when your order arrives.</p></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff3f1] p-3 text-sm text-[#7c4548]">{error}</p>}
    <button disabled={saving} className="mt-6 w-full rounded-xl bg-[#a15e61] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#884d50] disabled:opacity-60">{saving ? "Placing order…" : "Place order"}</button>
  </form>;
}
