"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CartLineControlsProps = {
  cartItemId: string;
  storeId: string;
  quantity: number;
};

export function CartLineControls({ cartItemId, storeId, quantity }: CartLineControlsProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updateQuantity(nextQuantity: number) {
    setErrorMessage("");
    setIsSaving(true);
    const supabase = createClient();

    const result =
      nextQuantity < 1
        ? await supabase
            .from("cart_items")
            .delete()
            .eq("id", cartItemId)
            .eq("store_id", storeId)
        : await supabase
            .from("cart_items")
            .update({ quantity: nextQuantity })
            .eq("id", cartItemId)
            .eq("store_id", storeId);

    setIsSaving(false);

    if (result.error) {
      setErrorMessage("Could not update this cart item. Please try again.");
      return;
    }

    window.dispatchEvent(new Event("cart-updated"));
    router.refresh();
  }

  async function moveToWishlist() {
    setErrorMessage("");
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("move_cart_item_to_wishlist", {
      p_store_id: storeId,
      p_cart_item_id: cartItemId,
    });
    setIsSaving(false);
    if (error) {
      console.error("Cart-to-wishlist failed:", error.code, error.message);
      setErrorMessage(error.code === "PGRST202"
        ? "The wishlist transfer migration is missing. Apply migration 064, then refresh."
        : "Could not move this item to your wishlist. Please refresh and try again.");
      return;
    }
    window.dispatchEvent(new Event("wishlist-updated"));
    window.dispatchEvent(new Event("cart-updated"));
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={isSaving}
          onClick={() => updateQuantity(quantity - 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#d9c9bf] text-lg disabled:opacity-50"
        >
          −
        </button>
        <span className="min-w-5 text-center text-sm">{quantity}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={isSaving || quantity >= 1000}
          onClick={() => updateQuantity(quantity + 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#d9c9bf] text-lg disabled:opacity-50"
        >
          +
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => updateQuantity(0)}
          className="ml-2 text-sm text-[#8b5355] underline underline-offset-4 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <button
        type="button"
        disabled={isSaving}
        onClick={moveToWishlist}
        title={`Move all ${quantity} ${quantity === 1 ? "unit" : "units"} to your wishlist`}
        className="mt-2 text-xs font-semibold text-[#a15e61] underline underline-offset-4 disabled:opacity-50"
      >
        Move to wishlist
      </button>
      {errorMessage && (
        <p role="alert" className="mt-2 text-xs text-[#7c4548]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
