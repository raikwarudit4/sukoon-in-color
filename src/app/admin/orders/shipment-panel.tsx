"use client";

import { useState, type FormEvent } from "react";
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

export function ShipmentPanel({ orderId, orderStatus, mode, shipment }: { orderId: string; orderStatus: string; mode: "mock" | "sandbox" | "live" | "disabled"; shipment?: Shipment }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState("");
  const [parcel, setParcel] = useState({ weightKg: "", lengthCm: "", breadthCm: "", heightCm: "" });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualDetails, setManualDetails] = useState({ providerOrderId: "", providerShipmentId: "", carrier: "", trackingNumber: "", trackingUrl: "" });

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

  async function testProviderConnection() {
    setCheckingConnection(true);
    setError("");
    setConnectionResult("");
    try {
      const response = await fetch("/api/admin/shipments/connection-test", { method: "POST" });
      const result = await response.json() as { error?: string; mode?: "sandbox" | "live" };
      if (!response.ok) { setError(result.error ?? `Could not authenticate with Shiprocket ${mode}.`); return; }
      setConnectionResult(`${result.mode === "live" ? "Live" : "Sandbox"} credentials authenticated successfully. No shipment was created.`);
    } catch {
      setError("Could not reach the shop server. Please retry.");
    } finally {
      setCheckingConnection(false);
    }
  }

  async function saveManualShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/shipments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...manualDetails }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not save the manual shipment details.");
        return;
      }
      setManualOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the shop server. Please retry.");
    } finally {
      setManualSaving(false);
    }
  }

  const isSimulation = shipment?.provider_status?.startsWith("Sandbox simulation:") ?? false;

  return <section className="mt-4 rounded-xl border border-[#eee5de] bg-[#fffdfa] p-4" aria-label="Shipping provider">
    <h3 className="text-sm font-semibold">Shipping{mode === "mock" ? " · Mock simulation" : mode === "sandbox" ? " · Shiprocket sandbox" : mode === "live" ? " · Live provider" : " · Disabled"}</h3>
    {(mode === "sandbox" || mode === "live") && <div className="mt-2">
      <button type="button" disabled={checkingConnection} onClick={testProviderConnection} className="rounded-lg border border-[#d9c9bf] px-3 py-2 text-xs font-semibold text-[#6d4a4a] disabled:opacity-50">{checkingConnection ? "Checking…" : `Test ${mode === "live" ? "live" : "sandbox"} connection`}</button>
      {connectionResult && <p role="status" className="mt-2 text-xs text-green-800">{connectionResult}</p>}
    </div>}
    {shipment?.provider === "shiprocket" ? <div className="mt-2 space-y-1 text-xs text-[#716763]">
      <p><span className="font-semibold text-[#27221f]">Shiprocket:</span> {shipment.provider_status ?? shipment.status.replaceAll("_", " ")}</p>
      {shipment.provider_order_id && <p>Provider order ID: {shipment.provider_order_id}</p>}
      {shipment.carrier && <p>Courier: {shipment.carrier}</p>}
      {shipment.tracking_number && <p>AWB: <span className="font-semibold text-[#27221f]">{shipment.tracking_number}</span></p>}
      {shipment.tracking_url && <a className="inline-block pt-1 font-semibold text-[#a15e61] underline" href={shipment.tracking_url} target="_blank" rel="noreferrer">Open tracking</a>}
      {!shipment.tracking_number && <p className="pt-1">{isSimulation ? "This is simulated data; no courier was booked." : mode === "sandbox" ? "Use the Shiprocket sandbox panel to select a test courier and generate its sandbox AWB." : "Open your Shiprocket dashboard to select a courier and arrange pickup. Tracking appears here after Shiprocket assigns an AWB."}</p>}
      {!shipment.tracking_number && <button type="button" disabled={syncing || mode === "disabled"} onClick={syncTracking} className="mt-2 rounded-lg border border-[#d9c9bf] px-3 py-2 text-xs font-semibold text-[#6d4a4a] disabled:opacity-50">{syncing ? "Checking…" : mode === "mock" ? "Simulate courier assignment" : "Sync AWB from Shiprocket"}</button>}
      {orderStatus === "processing" && <p className="pt-1">After the parcel is handed to the courier, use “Mark dispatched” below to commit inventory.</p>}
      {shipment.shipment_events.length > 0 && <ol className="mt-2 space-y-1 border-l border-[#e8dfd7] pl-3">
        {[...shipment.shipment_events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 4).map((event, index) => <li key={`${event.occurred_at}-${index}`}>
          {event.detail ?? event.status} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}
        </li>)}
      </ol>}
    </div> : orderStatus === "processing" ? <div className="mt-2">
      <p className="text-xs leading-5 text-[#716763]">Enter the packed parcel’s final weight and outer box dimensions. {mode === "mock" ? "Mock mode stores a simulated order only; it does not call Shiprocket or book a courier." : mode === "sandbox" ? "Sandbox mode calls Shiprocket’s sandbox API, not the live account." : mode === "live" ? "Live mode creates a real order in Shiprocket; courier selection and pickup are completed there." : "Shipping is disabled until SHIPROCKET_MODE is configured on the server."}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["weightKg", "Weight (kg)"], ["lengthCm", "Length (cm)"], ["breadthCm", "Width (cm)"], ["heightCm", "Height (cm)"]] as const).map(([key, label]) => <label key={key} className="text-[11px] text-[#716763]">
          {label}<input required type="number" min="0.01" max={key === "weightKg" ? "50" : "200"} step="0.01" value={parcel[key]} onChange={(event) => setParcel({ ...parcel, [key]: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#d9c9bf] bg-white px-2 py-2 text-sm text-[#27221f] outline-none focus:border-[#a15e61]" />
        </label>)}
      </div>
      <button type="button" disabled={busy || mode === "disabled" || Object.values(parcel).some((value) => !value || Number(value) <= 0)} onClick={createShipment}
        className="mt-3 rounded-lg bg-[#a15e61] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : mode === "mock" ? "Create simulated shipment" : mode === "sandbox" ? "Create sandbox shipment" : "Create Shiprocket order"}</button>
    </div> : <p className="mt-2 text-xs text-[#716763]">Create a Shiprocket order after processing begins.</p>}
    {mode === "live" && orderStatus === "processing" && !shipment?.tracking_number && <div className="mt-3 border-t border-[#eee5de] pt-3">
      <p className="text-xs leading-5 text-[#716763]">If you book the shipment directly in the Shiprocket dashboard, enter its assigned courier and AWB here. This records tracking in the shop but does not create or book the shipment with Shiprocket.</p>
      <button type="button" onClick={() => setManualOpen(!manualOpen)} className="mt-2 rounded-lg border border-[#d9c9bf] px-3 py-2 text-xs font-semibold text-[#6d4a4a]">{manualOpen ? "Close manual entry" : "Enter Shiprocket booking manually"}</button>
      {manualOpen && <form onSubmit={saveManualShipment} className="mt-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([ ["providerOrderId", "Shiprocket order ID (optional)"], ["providerShipmentId", "Shiprocket shipment ID (optional)"], ["carrier", "Courier name"], ["trackingNumber", "AWB / tracking number"] ] as const).map(([key, label]) => <label key={key} className="text-[11px] text-[#716763]">
            {label}<input required={key === "carrier" || key === "trackingNumber"} maxLength={key === "carrier" ? 120 : key === "trackingNumber" ? 80 : 100} value={manualDetails[key]} onChange={(inputEvent) => setManualDetails({ ...manualDetails, [key]: inputEvent.target.value })} className="mt-1 w-full rounded-lg border border-[#d9c9bf] bg-white px-2 py-2 text-sm text-[#27221f] outline-none focus:border-[#a15e61]" />
          </label>)}
        </div>
        <label className="block text-[11px] text-[#716763]">Tracking URL (optional, HTTPS)<input type="url" value={manualDetails.trackingUrl} onChange={(inputEvent) => setManualDetails({ ...manualDetails, trackingUrl: inputEvent.target.value })} placeholder="https://…" className="mt-1 w-full rounded-lg border border-[#d9c9bf] bg-white px-2 py-2 text-sm text-[#27221f] outline-none focus:border-[#a15e61]" /></label>
        <button type="submit" disabled={manualSaving || !manualDetails.carrier.trim() || !manualDetails.trackingNumber.trim()} className="rounded-lg bg-[#a15e61] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{manualSaving ? "Saving…" : "Save tracking details"}</button>
      </form>}
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </section>;
}
