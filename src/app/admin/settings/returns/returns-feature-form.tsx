"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function ReturnsFeatureForm({ storeId, initiallyEnabled, initialSupportEmail }: { storeId: string; initiallyEnabled: boolean; initialSupportEmail: string }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [savedEnabled, setSavedEnabled] = useState(initiallyEnabled);
  const [supportEmail, setSupportEmail] = useState(initialSupportEmail);
  const [savedSupportEmail, setSavedSupportEmail] = useState(initialSupportEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supportEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) || supportEmail.length > 254)) {
      setError("Enter a valid customer support email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    const supabase = createClient();
    const results = await Promise.all([
      enabled !== savedEnabled ? supabase.rpc("set_store_returns_enabled", { p_store_id: storeId, p_enabled: enabled }) : Promise.resolve({ error: null }),
      supportEmail !== savedSupportEmail ? supabase.rpc("set_store_customer_support_email", { p_store_id: storeId, p_email: supportEmail || null }) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    if (results.some((result) => result.error)) {
      setError("Could not save the returns setting. Confirm store access and try again.");
      return;
    }
    setSavedEnabled(enabled);
    setSavedSupportEmail(supportEmail);
    setMessage("Returns settings saved.");
  }

  return <form onSubmit={save} className="mt-8 max-w-xl rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
    <label className="flex items-start gap-3 text-sm font-medium">
      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 accent-[#a15e61]" />
      <span>Allow customers to submit return requests
        <span className="mt-1 block text-xs font-normal leading-5 text-[#716763]">Photo evidence is optional. Disabling returns does not delete submitted requests.</span>
      </span>
    </label>
    <label htmlFor="customer-support-email" className="mt-6 block text-sm font-medium">Customer support email
      <input id="customer-support-email" type="email" maxLength={254} value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)}
        placeholder="support@example.com" className="mt-2 block w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-base outline-none focus:border-[#a15e61]" />
      <span className="mt-1 block text-xs font-normal leading-5 text-[#716763]">Customers can use this address to ask about rejected return requests. Leave blank to remove it.</span>
    </label>
    {error && <p role="alert" className="mt-4 text-sm text-[#7c4548]">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-[#456247]">{message}</p>}
    <button type="submit" disabled={busy || (enabled === savedEnabled && supportEmail === savedSupportEmail)} className="mt-5 rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Saving…" : "Save setting"}
    </button>
  </form>;
}
