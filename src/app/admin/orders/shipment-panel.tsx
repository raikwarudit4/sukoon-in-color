"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Shipment = {
  id: string;
  provider: string | null;
  provider_order_id: string | null;
  provider_shipment_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  status: string;
  provider_status: string | null;
  tracking_url: string | null;
  tracking_updated_at: string | null;
  shipment_events: { status: string; detail: string | null; occurred_at: string }[];
};

export function ShipmentPanel({ orderId, orderStatus, shipment }: { orderId: string; orderStatus: string; shipment?: Shipment }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [parcel, setParcel] = useState({ weightKg: "", lengthCm: "", breadthCm: "", heightCm: "" });

  async function createShipment() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/shipments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, parcel: Object.fromEntries(Object.entries(parcel).map(([key, value]) => [key, Number(value)])) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not create the Shiprocket order.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the shop server. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function syncTracking() {
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/shipments/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error ?? "Could not sync tracking."); return; }
      router.refresh();
    } catch { setError("Could not reach the shop server. Please retry."); }
    finally { setSyncing(false); }
  }

  return <section className="mt-4 rounded-xl border border-[#eee5de] bg-[#fffdfa] p-4" aria-label="Shipping provider">
    <h3 className="text-sm font-semibold">Shipping</h3>
    {shipment?.provider === "shiprocket" ? <div className="mt-2 space-y-1 text-xs text-[#716763]">
      <p><span className="font-semibold text-[#27221f]">Shiprocket:</span> {shipment.provider_status ?? shipment.status.replaceAll("_", " ")}</p>
      {shipment.provider_order_id && <p>Provider order ID: {shipment.provider_order_id}</p>}
      {shipment.carrier && <p>Courier: {shipment.carrier}</p>}
      {shipment.tracking_number && <p>AWB: <span className="font-semibold text-[#27221f]">{shipment.tracking_number}</span></p>}
      {shipment.tracking_url && <a className="inline-block pt-1 font-semibold text-[#a15e61] underline" href={shipment.tracking_url} target="_blank" rel="noreferrer">Open tracking</a>}
      {!shipment.tracking_number && <p className="pt-1">Open your Shiprocket dashboard to select a courier and arrange pickup. Tracking appears here after Shiprocket assigns an AWB.</p>}
      {!shipment.tracking_number && <button type="button" disabled={syncing} onClick={syncTracking} className="mt-2 rounded-lg border border-[#d9c9bf] px-3 py-2 text-xs font-semibold text-[#6d4a4a] disabled:opacity-50">{syncing ? "Checking…" : "Sync AWB from Shiprocket"}</button>}
      {orderStatus === "processing" && <p className="pt-1">After the parcel is handed to the courier, use “Mark dispatched” below to commit inventory.</p>}
      {shipment.shipment_events.length > 0 && <ol className="mt-2 space-y-1 border-l border-[#e8dfd7] pl-3">
        {[...shipment.shipment_events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 4).map((event, index) => <li key={`${event.occurred_at}-${index}`}>
          {event.detail ?? event.status} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}
        </li>)}
      </ol>}
    </div> : orderStatus === "processing" ? <div className="mt-2">
      <p className="text-xs leading-5 text-[#716763]">Enter the packed parcel’s final weight and outer box dimensions. This creates the provider order; courier selection and pickup are completed in Shiprocket.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["weightKg", "Weight (kg)"], ["lengthCm", "Length (cm)"], ["breadthCm", "Width (cm)"], ["heightCm", "Height (cm)"]] as const).map(([key, label]) => <label key={key} className="text-[11px] text-[#716763]">
          {label}<input required type="number" min="0.01" max={key === "weightKg" ? "50" : "200"} step="0.01" value={parcel[key]} onChange={(event) => setParcel({ ...parcel, [key]: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#d9c9bf] bg-white px-2 py-2 text-sm text-[#27221f] outline-none focus:border-[#a15e61]" />
        </label>)}
      </div>
      <button type="button" disabled={busy || Object.values(parcel).some((value) => !value || Number(value) <= 0)} onClick={createShipment}
        className="mt-3 rounded-lg bg-[#a15e61] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create Shiprocket order"}</button>
    </div> : <p className="mt-2 text-xs text-[#716763]">Create a Shiprocket order after processing begins.</p>}
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </section>;
}
