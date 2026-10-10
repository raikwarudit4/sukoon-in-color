"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatRupees(minor: number) {
  return (minor / 100).toFixed(2);
}

function parseRupees(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [rupees, paise = ""] = normalized.split(".");
  const minor = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= 100_000_000 ? minor : null;
}

export function ShippingFeeForm({ storeId, initialFeeMinor }: { storeId: string; initialFeeMinor: number }) {
  const [amount, setAmount] = useState(formatRupees(initialFeeMinor));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const feeMinor = parseRupees(amount);
    if (feeMinor === null) {
      setError("Enter a non-negative amount with up to two decimal places (maximum ₹1,000,000).");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = await supabase.rpc("set_store_shipping_fee", {
      p_store_id: storeId,
      p_fee_minor: feeMinor,
    });
    setSaving(false);

    if (saveError) {
      setError("Could not save the shipping fee. Confirm this account has store access and try again.");
      return;
    }

    setAmount(formatRupees(feeMinor));
    setMessage("Shipping fee saved. New checkouts will use this amount.");
  }

  return (
    <form onSubmit={save} className="mt-8 max-w-xl rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
      <label htmlFor="shipping-fee" className="block text-sm font-medium">Flat shipping fee (INR)</label>
      <div className="mt-2 flex items-center gap-3">
        <span aria-hidden="true" className="text-lg text-[#716763]">₹</span>
        <input
          id="shipping-fee"
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-base outline-none focus:border-[#a15e61]"
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-[#716763]">Enter rupees (for example, 99.00). Set 0 for free shipping. Changes apply to new orders only.</p>
      {error && <p role="alert" className="mt-4 text-sm text-[#7c4548]">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-[#456247]">{message}</p>}
      <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white hover:bg-[#884d50] disabled:opacity-60 sm:w-auto">
        {saving ? "Saving…" : "Save shipping fee"}
      </button>
    </form>
  );
}
