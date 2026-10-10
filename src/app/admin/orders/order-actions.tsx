"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Action = { value: string; label: string; danger?: boolean };

const actionsByStatus: Record<string, Action[]> = {
  pending: [
    { value: "confirm", label: "Confirm order" },
    { value: "cancel", label: "Cancel", danger: true },
  ],
  confirmed: [
    { value: "process", label: "Start processing" },
    { value: "cancel", label: "Cancel", danger: true },
  ],
  processing: [
    { value: "ship", label: "Ship order" },
    { value: "cancel", label: "Cancel", danger: true },
  ],
  shipped: [{ value: "deliver", label: "Mark delivered + cash received" }],
};

export function OrderActions({ storeId, orderId, status, canExpire, paymentProvider, paymentStatus }: { storeId: string; orderId: string; status: string; canExpire: boolean; paymentProvider: string; paymentStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const statusActions = status === "shipped" && paymentProvider === "razorpay"
    ? paymentStatus === "captured" ? [{ value: "deliver", label: "Mark delivered" }] : []
    : status === "processing" && paymentProvider === "razorpay" && paymentStatus !== "captured"
      ? (actionsByStatus[status] ?? []).filter((action) => action.value !== "ship")
    : actionsByStatus[status] ?? [];
  const actions = [...statusActions, ...(canExpire ? [{ value: "expire", label: "Release expired hold", danger: true }] : [])];

  async function runAction(action: Action) {
    if (action.value === "cancel" && !window.confirm("Cancel this order and release its reserved stock?")) return;
    if (action.value === "expire" && !window.confirm("This order's stock hold has expired. Release the held stock and cancel the order?")) return;
    if (action.value === "deliver" && !window.confirm("Confirm that the customer received the order and paid cash?")) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: actionError } = paymentProvider === "razorpay" && action.value === "deliver"
      ? await supabase.rpc("deliver_paid_store_order", { p_store_id: storeId, p_order_id: orderId })
      : await supabase.rpc("manage_store_order", {
        p_store_id: storeId,
        p_order_id: orderId,
        p_action: action.value,
      });
    setBusy(false);
    if (actionError) {
      setError(actionError.message.includes("inventory")
        ? actionError.message
        : "Could not update this order. Refresh and try again.");
      return;
    }
    router.refresh();
  }

  if (!actions.length) return <p className="text-xs text-[#716763]">No further actions</p>;

  return <div>
    {status === "processing" && paymentProvider === "razorpay" && paymentStatus !== "captured"
      && <p className="mb-2 text-xs text-[#7c4548]">Shipping is disabled until Razorpay confirms the payment is captured.</p>}
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => <button key={action.value} type="button" disabled={busy} onClick={() => runAction(action)}
        className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${action.danger ? "border border-[#ead5d2] text-[#8b5355] hover:bg-[#fff3f1]" : "bg-[#a15e61] text-white hover:bg-[#884d50]"}`}>
        {busy ? "Saving…" : action.label}
      </button>)}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </div>;
}
