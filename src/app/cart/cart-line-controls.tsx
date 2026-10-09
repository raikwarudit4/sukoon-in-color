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
      {errorMessage && (
        <p role="alert" className="mt-2 text-xs text-[#7c4548]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
