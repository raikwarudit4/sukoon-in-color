"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArtOnWallButton } from "@/components/art-on-wall-button";

type Variant = {
  id: string;
  title: string;
  sku: string;
  option_values: Record<string, unknown>;
  price_minor: number;
  compare_at_price_minor: number | null;
  currency: string;
};

type SaleOptions = { original_enabled: boolean; printable_enabled: boolean; print_sizes: string[]; print_materials: string[] };

type AddToCartProps = {
  storeId: string;
  variants: Variant[];
  saleOptions: Record<string, unknown> | null;
  returnPath: string;
  productName: string;
  imageUrl: string | null;
  originalDimensions: string | null;
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function AddToCart({ storeId, variants, saleOptions: rawSaleOptions, returnPath, productName, imageUrl, originalDimensions }: AddToCartProps) {
  const router = useRouter();
  const savedOptions = rawSaleOptions && typeof rawSaleOptions === "object" ? rawSaleOptions as Partial<SaleOptions> : {};
  const saleOptions: SaleOptions = {
    original_enabled: savedOptions.original_enabled !== false,
    printable_enabled: savedOptions.printable_enabled === true,
    print_sizes: Array.isArray(savedOptions.print_sizes) ? savedOptions.print_sizes.filter((value): value is string => typeof value === "string") : [],
    print_materials: Array.isArray(savedOptions.print_materials) ? savedOptions.print_materials.filter((value): value is string => typeof value === "string") : [],
  };
  const [purchaseType, setPurchaseType] = useState(saleOptions.original_enabled ? "original" : "print");
  const [printSize, setPrintSize] = useState(saleOptions.print_sizes[0] ?? "");
  const [printMaterial, setPrintMaterial] = useState(saleOptions.print_materials[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const selectedVariant = variants.find((variant) => {
    const type = variant.option_values?.sale_type === "print" ? "print" : "original";
    return type === purchaseType && (type === "original" || (variant.option_values?.print_size === printSize && variant.option_values?.print_material === printMaterial));
  });

  function priceDisplay(variant: Variant) {
    const hasDiscount = variant.compare_at_price_minor !== null && variant.compare_at_price_minor > variant.price_minor;
    const discount = hasDiscount ? Math.round((variant.compare_at_price_minor! - variant.price_minor) / variant.compare_at_price_minor! * 100) : 0;
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span>{formatPrice(variant.price_minor, variant.currency)}</span>
        {hasDiscount && <>
          <span className="text-base font-normal text-[#8b817c] line-through">{formatPrice(variant.compare_at_price_minor!, variant.currency)}</span>
          <span className="text-sm font-semibold text-[#a15e61]">{discount}% off</span>
        </>}
      </span>
    );
  }

  async function addItem() {
    setMessage("");
    setErrorMessage("");

    if (!selectedVariant) {
      setErrorMessage("This format is not available yet. Please choose another option or contact the store.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > (purchaseType === "original" ? 1 : 1000)) {
      setErrorMessage(purchaseType === "original" ? "Original artwork is limited to one." : "Choose a quantity between 1 and 1,000.");
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
      p_variant_id: selectedVariant.id,
      p_quantity: quantity,
    });

    setIsAdding(false);

    if (error) {
      setErrorMessage("Could not add this item to your cart. Please try again.");
      return;
    }

    window.dispatchEvent(new Event("cart-updated"));
    setMessage(`${quantity} ${quantity === 1 ? "item" : "items"} added to your cart.`);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4">
      {(saleOptions.original_enabled || saleOptions.printable_enabled) && <fieldset>
        <legend className="text-sm font-medium">Choose artwork format</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {saleOptions.original_enabled && <label className={`cursor-pointer rounded-xl border px-4 py-3 text-sm ${purchaseType === "original" ? "border-[#a15e61] bg-[#fff7f5]" : "border-[#d9c9bf] bg-white"}`}>
            <input type="radio" name="purchase-format" value="original" checked={purchaseType === "original"} onChange={() => { setPurchaseType("original"); setQuantity(1); setErrorMessage(""); }} className="mr-2 accent-[#a15e61]" />Original painting
          </label>}
          {saleOptions.printable_enabled && <label className={`cursor-pointer rounded-xl border px-4 py-3 text-sm ${purchaseType === "print" ? "border-[#a15e61] bg-[#fff7f5]" : "border-[#d9c9bf] bg-white"}`}>
            <input type="radio" name="purchase-format" value="print" checked={purchaseType === "print"} onChange={() => { setPurchaseType("print"); setQuantity(1); setErrorMessage(""); }} className="mr-2 accent-[#a15e61]" />Print
          </label>}
        </div>
      </fieldset>}

      {purchaseType === "print" && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Print size<select value={printSize} onChange={(event) => setPrintSize(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3"><option value="">Choose size</option>{saleOptions.print_sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <label className="block text-sm font-medium">Print material<select value={printMaterial} onChange={(event) => setPrintMaterial(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3"><option value="">Choose material</option>{saleOptions.print_materials.map((material) => <option key={material} value={material}>{material}</option>)}</select></label>
      </div>}

      {selectedVariant && <p className="text-sm text-[#716763]">{purchaseType === "original" ? "Original painting" : `${printSize} · ${printMaterial}`} · {selectedVariant.title}</p>}

      {imageUrl && <div className="-mt-1"><ArtOnWallButton imageUrl={imageUrl} productName={productName} originalDimensions={originalDimensions} purchaseType={purchaseType as "original" | "print"} printSize={printSize} /></div>}

      {selectedVariant && (
        <p className="text-2xl font-semibold">
          {priceDisplay(selectedVariant)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Quantity
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={purchaseType === "original" ? 1 : 1000}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            disabled={isAdding || !selectedVariant || purchaseType === "original"}
            className="ml-3 w-20 rounded-xl border border-[#d9c9bf] bg-white px-3 py-3 text-center"
          />
        </label>
        <button
          type="button"
          disabled={isAdding || !selectedVariant || !Number.isInteger(quantity) || quantity < 1 || quantity > (purchaseType === "original" ? 1 : 1000)}
          onClick={addItem}
          className="w-full rounded-xl bg-[#a15e61] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#884d50] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-56"
        >
          {isAdding ? "Adding…" : "Add to cart"}
        </button>
      </div>

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
