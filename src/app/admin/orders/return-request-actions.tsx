"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReturnRequestActions({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(status: "approved" | "rejected") {
    setBusy(true);
    setError("");
    const { error: updateError } = await createClient().from("returns")
      .update({ status }).eq("id", returnId).eq("status", "requested");
    setBusy(false);
    if (updateError) {
      setError("Could not update this return request. Refresh and try again.");
      return;
    }
    router.refresh();
  }

  return <div className="mt-3 flex flex-wrap gap-2">
    <button disabled={busy} onClick={() => void setStatus("approved")} className="rounded-lg bg-[#a15e61] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve request</button>
    <button disabled={busy} onClick={() => void setStatus("rejected")} className="rounded-lg border border-[#ead5d2] px-3 py-2 text-xs font-semibold text-[#8b5355] disabled:opacity-50">Reject request</button>
    {error && <p role="alert" className="w-full text-xs text-[#7c4548]">{error}</p>}
  </div>;
}
