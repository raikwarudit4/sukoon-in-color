"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReviewActions({ reviewId, storeId }: { reviewId: string; storeId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function moderate(status: "published" | "rejected") {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.from("reviews")
      .update({ status })
      .eq("id", reviewId)
      .eq("store_id", storeId)
      .eq("status", "pending");
    setSaving(false);

    if (updateError) {
      setError("Could not update this review. Check store permissions and try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void moderate("published")} className="rounded-xl bg-[#456247] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Approve</button>
        <button type="button" disabled={saving} onClick={() => void moderate("rejected")} className="rounded-xl border border-[#d9c9bf] px-4 py-2.5 text-sm font-semibold text-[#7c4548] disabled:opacity-60">Reject</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
    </div>
  );
}
