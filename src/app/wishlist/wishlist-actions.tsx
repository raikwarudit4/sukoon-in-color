"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddWishlistItemToCart({ storeId, productId, variantId }: { storeId: string; productId: string; variantId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addToCart() {
    if (!variantId) {
      setMessage("This product has no active option right now.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("add_wishlist_item_to_cart", {
      p_store_id: storeId,
      p_product_id: productId,
      p_variant_id: variantId,
    });
    setBusy(false);
    if (error) {
      console.error("Wishlist-to-cart failed:", error.code, error.message);
      setMessage(error.code === "PGRST202"
        ? "The wishlist transfer migration is missing. Apply migration 064, then refresh."
        : "Could not move this item to your cart. Please refresh and try again.");
      return;
    }
    window.dispatchEvent(new Event("wishlist-updated"));
    window.dispatchEvent(new Event("cart-updated"));
    router.push("/wishlist?moved=1");
  }

  return <div>
    <button type="button" onClick={addToCart} disabled={busy || !variantId}
      className="rounded-xl bg-[#a15e61] px-3 py-2 text-xs font-semibold text-white hover:bg-[#884d50] disabled:opacity-50">
      {busy ? "Adding…" : "Add to cart"}
    </button>
    {message && <p role="status" className="mt-2 text-xs text-[#716763]">{message}</p>}
  </div>;
}

export function ClearWishlistButton({ storeId, userId }: { storeId: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clearWishlist() {
    if (!window.confirm("Remove all items from your wishlist?")) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("wishlist_items")
      .delete().eq("store_id", storeId).eq("user_id", userId);
    setBusy(false);
    if (deleteError) {
      setError("Could not clear your wishlist. Please refresh and try again.");
      return;
    }
    window.dispatchEvent(new Event("wishlist-updated"));
    router.refresh();
  }

  return <div>
    <button type="button" onClick={clearWishlist} disabled={busy}
      className="rounded-xl border border-[#d9c9bf] px-4 py-2.5 text-sm font-semibold text-[#8b5355] hover:bg-white disabled:opacity-50">
      {busy ? "Clearing…" : "Clear wishlist"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </div>;
}
