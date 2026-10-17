"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentChoice = "cod" | "razorpay";
type SavedAddress = {
  id: string;
  recipient_name: string;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  locality: string;
  city: string;
  region: string;
  postal_code: string;
  is_default: boolean;
};
type AddressFields = Omit<SavedAddress, "id" | "is_default">;
const emptyAddress: AddressFields = {
  recipient_name: "", phone: "", address_line1: "", address_line2: "",
  locality: "", city: "", region: "", postal_code: "",
};
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

export function CheckoutForm({ storeId, userId, savedAddresses: initialSavedAddresses }: {
  storeId: string;
  userId: string;
  savedAddresses: SavedAddress[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const requestKeys = useRef<{ cod?: string; razorpay?: string }>({});
  const [savedAddresses, setSavedAddresses] = useState(initialSavedAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState(initialSavedAddresses[0]?.id ?? "");
  const [address, setAddress] = useState<AddressFields>(initialSavedAddresses[0]
    ? { ...initialSavedAddresses[0], phone: initialSavedAddresses[0].phone ?? "", address_line2: initialSavedAddresses[0].address_line2 ?? "" }
    : emptyAddress);
  const [addressMessage, setAddressMessage] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
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

  async function saveCurrentAddress() {
    setAddressMessage("");
    if (!formRef.current?.reportValidity()) return;
    const normalized: AddressFields = {
      recipient_name: address.recipient_name.trim(),
      phone: address.phone?.trim() ?? "",
      address_line1: address.address_line1.trim(),
      address_line2: address.address_line2?.trim() ?? "",
      locality: address.locality.trim(),
      city: address.city.trim(),
      region: address.region.trim(),
      postal_code: address.postal_code.trim(),
    };
    const existing = savedAddresses.find((item) =>
      item.recipient_name === normalized.recipient_name
      && (item.phone ?? "") === normalized.phone
      && item.address_line1 === normalized.address_line1
      && (item.address_line2 ?? "") === normalized.address_line2
      && item.locality === normalized.locality
      && item.city === normalized.city
      && item.region === normalized.region
      && item.postal_code === normalized.postal_code,
    );
    if (existing) {
      setSelectedAddressId(existing.id);
      setAddressMessage("This address is already saved to your account.");
      return;
    }

    setSavingAddress(true);
    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from("customer_addresses")
      .insert({ user_id: userId, ...normalized, country_code: "IN", is_default: savedAddresses.length === 0 })
      .select("id, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, is_default")
      .single();
    setSavingAddress(false);
    if (saveError || !data) {
      setAddressMessage("Could not save this address. Refresh and try again.");
      return;
    }
    setSavedAddresses((current) => [data as SavedAddress, ...current]);
    setSelectedAddressId(data.id);
    setAddressMessage("Address saved to your account.");
  }

  function chooseAddress(id: string) {
    setSelectedAddressId(id);
    setAddressMessage("");
    const selected = savedAddresses.find((item) => item.id === id);
    setAddress(selected ? {
      recipient_name: selected.recipient_name,
      phone: selected.phone ?? "",
      address_line1: selected.address_line1,
      address_line2: selected.address_line2 ?? "",
      locality: selected.locality,
      city: selected.city,
      region: selected.region,
      postal_code: selected.postal_code,
    } : emptyAddress);
  }

  const inputClass = "mt-1 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-sm outline-none focus:border-[#a15e61]";
  return <form ref={formRef} onSubmit={submit} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
    <h2 className="text-lg font-medium">Delivery address</h2>
    {savedAddresses.length > 0 && <div className="mt-4">
      <label htmlFor="saved-address" className="block text-sm font-medium">Use a saved address</label>
      <select id="saved-address" value={selectedAddressId} onChange={(event) => chooseAddress(event.target.value)} className={inputClass}>
        <option value="">Enter a different address</option>
        {savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.recipient_name} · {item.city} · {item.postal_code}{item.is_default ? " · Default" : ""}</option>)}
      </select>
    </div>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Full name<input className={inputClass} name="recipient_name" autoComplete="name" required maxLength={160} value={address.recipient_name} onChange={(event) => setAddress({ ...address, recipient_name: event.target.value })} /></label>
      <label className="text-sm">Phone<input className={inputClass} name="phone" type="tel" autoComplete="tel" required maxLength={32} value={address.phone ?? ""} onChange={(event) => setAddress({ ...address, phone: event.target.value })} /></label>
      <label className="text-sm">Postal code<input className={inputClass} name="postal_code" autoComplete="postal-code" required maxLength={20} value={address.postal_code} onChange={(event) => setAddress({ ...address, postal_code: event.target.value })} /></label>
      <label className="text-sm sm:col-span-2">Address<input className={inputClass} name="address_line1" autoComplete="address-line1" required maxLength={240} value={address.address_line1} onChange={(event) => setAddress({ ...address, address_line1: event.target.value })} /></label>
      <label className="text-sm sm:col-span-2">Apartment, suite, etc. (optional)<input className={inputClass} name="address_line2" autoComplete="address-line2" maxLength={240} value={address.address_line2 ?? ""} onChange={(event) => setAddress({ ...address, address_line2: event.target.value })} /></label>
      <label className="text-sm">Area / locality<input className={inputClass} name="locality" autoComplete="address-level3" required maxLength={120} value={address.locality} onChange={(event) => setAddress({ ...address, locality: event.target.value })} /></label>
      <label className="text-sm">City<input className={inputClass} name="city" autoComplete="address-level2" required maxLength={120} value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /></label>
      <label className="text-sm sm:col-span-2">State / region<input className={inputClass} name="region" autoComplete="address-level1" required maxLength={120} value={address.region} onChange={(event) => setAddress({ ...address, region: event.target.value })} /></label>
    </div>
    <div className="mt-4">
      <button type="button" onClick={saveCurrentAddress} disabled={savingAddress} className="rounded-lg border border-[#d9c9bf] px-3 py-2 text-xs font-semibold text-[#884d50] disabled:opacity-60">
        {savingAddress ? "Saving address…" : "Save address to my account"}
      </button>
      {addressMessage && <p role="status" className="mt-2 text-xs text-[#716763]">{addressMessage}</p>}
      <p className="mt-1 text-xs text-[#716763]">Saved addresses are private to your account and can be selected at future checkouts.</p>
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
