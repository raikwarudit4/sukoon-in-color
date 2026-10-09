"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Variant = {
  id: string;
  title: string;
  sku: string;
  price_minor: number;
  currency: string;
};

type AddToCartProps = {
  storeId: string;
  variants: Variant[];
  returnPath: string;
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function AddToCart({ storeId, variants, returnPath }: AddToCartProps) {
  const router = useRouter();
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);

  async function addItem() {
    setMessage("");
    setErrorMessage("");

    if (!selectedVariantId) {
      setErrorMessage("This product has no available options right now.");
      return;
    }

    setIsAdding(true);
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      setIsAdding(false);
      setErrorMessage("Could not check your sign-in. Please try again.");
      return;
    }

    if (!user) {
      setIsAdding(false);
      router.push(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
      return;
    }

    const { error } = await supabase.rpc("add_to_cart", {
      p_store_id: storeId,
      p_variant_id: selectedVariantId,
      p_quantity: 1,
    });

    setIsAdding(false);

    if (error) {
      setErrorMessage("Could not add this item to your cart. Please try again.");
      return;
    }

    setMessage("Added to your cart.");
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4">
      {variants.length > 1 && (
        <label className="block text-sm font-medium">
          Choose an option
          <select
            value={selectedVariantId}
            onChange={(event) => setSelectedVariantId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title} · {formatPrice(variant.price_minor, variant.currency)}
              </option>
            ))}
          </select>
        </label>
      )}

      {variants.length === 1 && selectedVariant && (
        <p className="text-2xl font-semibold">
          {formatPrice(selectedVariant.price_minor, selectedVariant.currency)}
        </p>
      )}

      <button
        type="button"
        disabled={isAdding || variants.length === 0}
        onClick={addItem}
        className="w-full rounded-xl bg-[#a15e61] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#884d50] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-56"
      >
        {isAdding ? "Adding…" : "Add to cart"}
      </button>

      {message && (
        <p role="status" className="text-sm text-[#456247]">
          {message} <Link href="/cart" className="font-semibold underline">View cart</Link>
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-[#7c4548]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
