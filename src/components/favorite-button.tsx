"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FavoriteButton({
  storeId,
  productId,
  userId,
  initiallySaved,
  returnPath,
  compact = false,
}: {
  storeId: string;
  productId: string;
  userId: string | null;
  initiallySaved: boolean;
  returnPath: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleSaved() {
    setError("");
    if (!userId) {
      router.push(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const result = saved
      ? await supabase.from("wishlist_items").delete().eq("store_id", storeId).eq("product_id", productId).eq("user_id", userId)
      : await supabase.from("wishlist_items").insert({ store_id: storeId, product_id: productId, user_id: userId });
    setBusy(false);

    if (result.error) {
      setError("Could not update your wishlist. Please refresh and try again.");
      return;
    }

    setSaved(!saved);
    window.dispatchEvent(new Event("wishlist-updated"));
    router.refresh();
  }

  return <div>
    <button
      type="button"
      onClick={toggleSaved}
      disabled={busy}
      aria-pressed={saved}
      className={`inline-flex items-center justify-center rounded-xl border border-[#d9c9bf] font-semibold text-[#a15e61] transition hover:bg-[#fffdfa] disabled:opacity-60 ${compact ? "h-9 px-3 text-xs" : "h-11 px-5 text-sm"}`}
    >
      {busy ? "Saving…" : saved ? "♥ Saved" : "♡ Save for later"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </div>;
}
