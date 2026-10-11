"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ArtworkSpecs = {
  international_shipping: "Yes" | "No" | "";
  size: string;
  medium: string;
  style: string;
  created_in: string;
  surface: string;
  lot_number: string;
  domestic_shipping_time: string;
  international_shipping_time: string;
};
type ArtworkLinks = { certificate_url: string; article_url: string; article_title: string };
type SaleOptions = { original_enabled: boolean; printable_enabled: boolean; print_sizes: string[]; print_materials: string[] };
export type EditableProduct = { id: string; store_id: string; name: string; slug: string; description: string | null; status: "draft" | "active" | "archived"; metadata: Record<string, unknown> | null };
export type EditableVariant = { id: string; product_id: string; store_id: string; sku: string; title: string; option_values: Record<string, unknown>; price_minor: number; compare_at_price_minor: number | null; currency: string; is_active: boolean; reorder_level: number };
export type InventoryLocation = { id: string; name: string; is_active: boolean };
export type InventoryLevel = { location_id: string; variant_id: string; on_hand: number; reserved: number };
export type ProductImage = { id: string; url: string; alt_text: string | null; sort_order: number };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const SUGGESTED_PRINT_SIZES = ["A4 · 21 × 29.7 cm", "A3 · 29.7 × 42 cm", "A2 · 42 × 59.4 cm"];
const SUGGESTED_PRINT_MATERIALS = ["Paper", "Canvas"];

function readSaleOptions(metadata: Record<string, unknown> | null): SaleOptions {
  const raw = metadata?.sale_options;
  const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<SaleOptions> : {};
  return {
    original_enabled: saved.original_enabled !== false,
    printable_enabled: saved.printable_enabled === true,
    print_sizes: Array.isArray(saved.print_sizes) ? saved.print_sizes.filter((item): item is string => typeof item === "string") : SUGGESTED_PRINT_SIZES,
    print_materials: Array.isArray(saved.print_materials) ? saved.print_materials.filter((item): item is string => typeof item === "string") : SUGGESTED_PRINT_MATERIALS,
  };
}

function optionText(variant: EditableVariant, key: string) {
  const value = variant.option_values?.[key];
  return typeof value === "string" ? value : "";
}

function parseRupees(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [rupees, paise = ""] = normalized.split(".");
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null;
}

function formatRupees(minor: number) {
  return (minor / 100).toFixed(2);
}

export function ProductEditor({
  storeId, product, variants, locations, levels, images,
}: {
  storeId: string;
  product: EditableProduct;
  variants: EditableVariant[];
  locations: InventoryLocation[];
  levels: InventoryLevel[];
  images: ProductImage[];
}) {
  return (
    <div className="mt-8 space-y-8">
      <ProductDetailsForm storeId={storeId} product={product} images={images} />
      <section>
        <div className="border-b border-[#e8dfd7] pb-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Variants</p><h2 className="mt-2 text-2xl font-medium">Price, SKU, and stock</h2></div>
        {variants.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-[#d9c9bf] bg-white p-5 text-sm text-[#716763]">This product has no variants yet. Add one below to make it purchasable.</p> : (
          <div className="mt-5 space-y-5">{variants.map((variant) => (
            <VariantCard key={variant.id} storeId={storeId} variant={variant} saleOptions={readSaleOptions(product.metadata)} locations={locations} levels={levels.filter((level) => level.variant_id === variant.id)} />
          ))}</div>
        )}
        <CreateVariantForm storeId={storeId} productId={product.id} saleOptions={readSaleOptions(product.metadata)} />
      </section>
    </div>
  );
}

function ProductDetailsForm({ storeId, product, images }: { storeId: string; product: EditableProduct; images: ProductImage[] }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description ?? "");
  const [status, setStatus] = useState(product.status);
  const [saleOptions, setSaleOptions] = useState<SaleOptions>(() => readSaleOptions(product.metadata));
  const [reviewsEnabled, setReviewsEnabled] = useState(product.metadata?.reviews_enabled !== false);
  const [specs, setSpecs] = useState<ArtworkSpecs>(() => {
    const saved = product.metadata?.artwork_specs;
    const values = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Partial<ArtworkSpecs> : {};
    return {
      international_shipping: values.international_shipping === "Yes" || values.international_shipping === "No" ? values.international_shipping : "",
      size: values.size ?? "", medium: values.medium ?? "", style: values.style ?? "", created_in: values.created_in ?? "",
      surface: values.surface ?? "", lot_number: values.lot_number ?? "", domestic_shipping_time: values.domestic_shipping_time ?? "",
      international_shipping_time: values.international_shipping_time ?? "",
    };
  });
  const [artworkLinks, setArtworkLinks] = useState<ArtworkLinks>(() => {
    const saved = product.metadata?.artwork_links;
    const values = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Partial<ArtworkLinks> : {};
    return {
      certificate_url: typeof values.certificate_url === "string" ? values.certificate_url : "",
      article_url: typeof values.article_url === "string" ? values.article_url : "",
      article_title: typeof values.article_title === "string" ? values.article_title : "",
    };
  });
  const [imageUrls, setImageUrls] = useState([...images].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.url).join("\n"));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    const cleanImages = imageUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const cleanSpecs = Object.fromEntries(Object.entries(specs).map(([key, value]) => [key, value.trim()])) as ArtworkSpecs;
    const cleanArtworkLinks = Object.fromEntries(Object.entries(artworkLinks).map(([key, value]) => [key, value.trim()])) as ArtworkLinks;
    const cleanSaleOptions: SaleOptions = {
      ...saleOptions,
      print_sizes: [...new Set(saleOptions.print_sizes.map((value) => value.trim()).filter(Boolean))],
      print_materials: [...new Set(saleOptions.print_materials.map((value) => value.trim()).filter(Boolean))],
    };
    if (!cleanName || cleanName.length > 180 || !cleanSlug || cleanSlug.length > 180 || description.length > 10000) {
      setError("Check the product name, slug, and description lengths.");
      return;
    }
    if (cleanImages.length > 10 || cleanImages.some((url) => {
      try { return new URL(url).protocol !== "https:" || url.length > 2048; }
      catch { return true; }
    })) {
      setError("Enter up to 10 public HTTPS image URLs, one per line. Leave the field empty to remove all images.");
      return;
    }
    if (Object.values(cleanSpecs).some((value) => value.length > 160) || (cleanSpecs.created_in && !/^\d{4}$/.test(cleanSpecs.created_in))) {
      setError("Keep each specification under 160 characters and enter Created in as a four-digit year.");
      return;
    }
    const validOptionalUrl = (value: string) => {
      if (!value) return true;
      try { return new URL(value).protocol === "https:" && value.length <= 2048; }
      catch { return false; }
    };
    if (!validOptionalUrl(cleanArtworkLinks.certificate_url) || !validOptionalUrl(cleanArtworkLinks.article_url) || cleanArtworkLinks.article_title.length > 160) {
      setError("Enter valid public HTTPS links (up to 2,048 characters) and keep the article title under 160 characters.");
      return;
    }
    if ((!cleanSaleOptions.original_enabled && !cleanSaleOptions.printable_enabled) || cleanSaleOptions.print_sizes.length > 12 || cleanSaleOptions.print_materials.length > 8 || cleanSaleOptions.print_sizes.some((value) => value.length > 80) || cleanSaleOptions.print_materials.some((value) => value.length > 50) || (cleanSaleOptions.printable_enabled && (!cleanSaleOptions.print_sizes.length || !cleanSaleOptions.print_materials.length))) {
      setError("Keep at least one purchase type enabled. Print options need at least one size and material; use up to 12 sizes and 8 materials.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: updated, error: productError } = await supabase.from("products")
      .update({
        name: cleanName,
        slug: cleanSlug,
        description: description.trim() || null,
        status,
        metadata: { ...(product.metadata ?? {}), artwork_specs: cleanSpecs, artwork_links: cleanArtworkLinks, sale_options: cleanSaleOptions, reviews_enabled: reviewsEnabled },
      })
      .eq("id", product.id).eq("store_id", storeId).select("id").maybeSingle();
    if (productError || !updated) {
      setSaving(false);
      setError(productError?.code === "23505" ? "That product URL slug is already in use." : "Could not save the product details.");
      return;
    }

    const { data: currentImages, error: currentImagesError } = await supabase.from("product_media")
      .select("id, url, alt_text, sort_order").eq("store_id", storeId).eq("product_id", product.id).order("sort_order");
    if (currentImagesError) {
      setSaving(false);
      setError("Product details were saved, but the current image gallery could not be loaded.");
      return;
    }
    const orderedImages = (currentImages ?? []) as ProductImage[];
    let mediaError: { code?: string } | null = null;
    for (let index = 0; index < cleanImages.length; index += 1) {
      const image = { url: cleanImages[index], alt_text: `${cleanName} image ${index + 1}`, sort_order: index };
      if (orderedImages[index]) {
        const { error: updateError } = await supabase.from("product_media").update(image)
          .eq("id", orderedImages[index].id).eq("store_id", storeId).eq("product_id", product.id);
        if (updateError) { mediaError = updateError; break; }
      } else {
        const { error: insertError } = await supabase.from("product_media").insert({ ...image, store_id: storeId, product_id: product.id });
        if (insertError) { mediaError = insertError; break; }
      }
    }
    if (!mediaError && orderedImages.length > cleanImages.length) {
      const obsoleteIds = orderedImages.slice(cleanImages.length).map((image) => image.id);
      const { error: deleteError } = await supabase.from("product_media").delete()
        .in("id", obsoleteIds).eq("store_id", storeId).eq("product_id", product.id);
      mediaError = deleteError;
    }
    setSaving(false);
    if (mediaError) {
      setError("Product details were saved, but the image gallery could not be fully updated. Check the URLs and save again.");
      return;
    }
    setMessage("Product details saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-2xl border border-[#eee5de] bg-white p-5 sm:grid-cols-2 sm:p-7">
      <div className="sm:col-span-2"><h2 className="text-lg font-medium">Product details</h2><p className="mt-1 text-sm text-[#716763]">The URL slug controls the public product address. Archived products are hidden from the shop.</p></div>
      <label className="block text-sm font-medium">Name<input required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">URL slug<input required maxLength={180} value={slug} onChange={(event) => setSlug(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Status<select value={status} onChange={(event) => setStatus(event.target.value as EditableProduct["status"])} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 font-normal"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <label className="block text-sm font-medium sm:col-span-2">Description<textarea maxLength={10000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Product image URLs<textarea rows={4} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder="https://… (one URL per line)" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[#716763]">Add up to 10 public Supabase Storage HTTPS URLs, one per line. The first image is the cover. Clear all lines to remove the gallery.</span></label>
      <div className="sm:col-span-2 border-t border-[#eee5de] pt-4"><h3 className="font-medium">Artwork specifications</h3><p className="mt-1 text-xs font-normal text-[#716763]">Optional details appear on the public product page only when filled in.</p></div>
      <label className="block text-sm font-medium">International shipping<select value={specs.international_shipping} onChange={(event) => setSpecs({ ...specs, international_shipping: event.target.value as ArtworkSpecs["international_shipping"] })} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 font-normal"><option value="">Not specified</option><option value="Yes">Available</option><option value="No">Not available</option></select></label>
      <label className="block text-sm font-medium">Size<input maxLength={160} value={specs.size} onChange={(event) => setSpecs({ ...specs, size: event.target.value })} placeholder="e.g. 36 × 24 in / 91.4 × 61 cm" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Medium<input maxLength={160} value={specs.medium} onChange={(event) => setSpecs({ ...specs, medium: event.target.value })} placeholder="e.g. Oil on canvas" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Style<input maxLength={160} value={specs.style} onChange={(event) => setSpecs({ ...specs, style: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Created in<input inputMode="numeric" maxLength={4} value={specs.created_in} onChange={(event) => setSpecs({ ...specs, created_in: event.target.value })} placeholder="e.g. 2026" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Surface<input maxLength={160} value={specs.surface} onChange={(event) => setSpecs({ ...specs, surface: event.target.value })} placeholder="e.g. Canvas" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Lot number<input maxLength={160} value={specs.lot_number} onChange={(event) => setSpecs({ ...specs, lot_number: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Domestic dispatch estimate<input maxLength={160} value={specs.domestic_shipping_time} onChange={(event) => setSpecs({ ...specs, domestic_shipping_time: event.target.value })} placeholder="e.g. 7–10 business days" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">International dispatch estimate<input maxLength={160} value={specs.international_shipping_time} onChange={(event) => setSpecs({ ...specs, international_shipping_time: event.target.value })} placeholder="e.g. 15–18 business days" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <div className="sm:col-span-2 border-t border-[#eee5de] pt-4"><h3 className="font-medium">Artwork links</h3><p className="mt-1 text-xs font-normal text-[#716763]">Optional public HTTPS links. The certificate and article links appear on the product page only when provided.</p></div>
      <label className="block text-sm font-medium sm:col-span-2">Authentication certificate URL<input type="url" inputMode="url" maxLength={2048} value={artworkLinks.certificate_url} onChange={(event) => setArtworkLinks({ ...artworkLinks, certificate_url: event.target.value })} placeholder="https://…" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Insightful article URL<input type="url" inputMode="url" maxLength={2048} value={artworkLinks.article_url} onChange={(event) => setArtworkLinks({ ...artworkLinks, article_url: event.target.value })} placeholder="https://…" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Article link text (optional)<input maxLength={160} value={artworkLinks.article_title} onChange={(event) => setArtworkLinks({ ...artworkLinks, article_title: event.target.value })} placeholder="Read more about this artwork" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <div className="sm:col-span-2 border-t border-[#eee5de] pt-4"><h3 className="font-medium">Purchase formats</h3><p className="mt-1 text-xs font-normal text-[#716763]">Print prices are set separately for each size and material combination in the variant list below.</p></div>
      <label className="flex items-center gap-3 rounded-xl border border-[#eee5de] px-4 py-3 text-sm"><input type="checkbox" checked={saleOptions.original_enabled} onChange={(event) => setSaleOptions({ ...saleOptions, original_enabled: event.target.checked })} />Offer the original painting</label>
      <label className="flex items-center gap-3 rounded-xl border border-[#eee5de] px-4 py-3 text-sm"><input type="checkbox" checked={saleOptions.printable_enabled} onChange={(event) => setSaleOptions({ ...saleOptions, printable_enabled: event.target.checked })} />Offer printable art</label>
      <label className="flex items-center gap-3 rounded-xl border border-[#eee5de] px-4 py-3 text-sm sm:col-span-2"><input type="checkbox" checked={reviewsEnabled} onChange={(event) => setReviewsEnabled(event.target.checked)} />Show customer reviews on this product page</label>
      <label className="block text-sm font-medium sm:col-span-2">Print sizes<input value={saleOptions.print_sizes.join(", ")} onChange={(event) => setSaleOptions({ ...saleOptions, print_sizes: event.target.value.split(",") })} placeholder={SUGGESTED_PRINT_SIZES.join(", ")} disabled={!saleOptions.printable_enabled} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal disabled:bg-[#f4f0ed]" /><span className="mt-1 block text-xs font-normal text-[#716763]">Comma-separated; suggested: A4 21 × 29.7 cm, A3 29.7 × 42 cm, A2 42 × 59.4 cm.</span></label>
      <label className="block text-sm font-medium sm:col-span-2">Print materials<input value={saleOptions.print_materials.join(", ")} onChange={(event) => setSaleOptions({ ...saleOptions, print_materials: event.target.value.split(",") })} placeholder="Paper, Canvas" disabled={!saleOptions.printable_enabled} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal disabled:bg-[#f4f0ed]" /><span className="mt-1 block text-xs font-normal text-[#716763]">Comma-separated, for example Paper, Canvas.</span></label>
      {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-2">{error}</p>}
      {message && <p role="status" className="text-sm text-[#456247] sm:col-span-2">{message}</p>}
      <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save product"}</button></div>
    </form>
  );
}

function VariantCard({ storeId, variant, saleOptions, locations, levels }: { storeId: string; variant: EditableVariant; saleOptions: SaleOptions; locations: InventoryLocation[]; levels: InventoryLevel[] }) {
  const [sku, setSku] = useState(variant.sku);
  const [title, setTitle] = useState(variant.title);
  const [price, setPrice] = useState(formatRupees(variant.price_minor));
  const [compareAtPrice, setCompareAtPrice] = useState(variant.compare_at_price_minor === null ? "" : formatRupees(variant.compare_at_price_minor));
  const [active, setActive] = useState(variant.is_active);
  const [reorderLevel, setReorderLevel] = useState(String(variant.reorder_level ?? 0));
  const [saleType, setSaleType] = useState(optionText(variant, "sale_type") === "print" ? "print" : "original");
  const [printSize, setPrintSize] = useState(optionText(variant, "print_size"));
  const [printMaterial, setPrintMaterial] = useState(optionText(variant, "print_material"));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const cleanSku = sku.trim();
    const cleanTitle = title.trim();
    const priceMinor = parseRupees(price);
    const compareAtMinor = compareAtPrice.trim() ? parseRupees(compareAtPrice) : null;
    const cleanReorderLevel = Number(reorderLevel);
    if (!cleanSku || cleanSku.length > 100 || !cleanTitle || cleanTitle.length > 160 || priceMinor === null || !Number.isInteger(cleanReorderLevel) || cleanReorderLevel < 0 || cleanReorderLevel > 100000 || (compareAtPrice.trim() && (compareAtMinor === null || compareAtMinor <= priceMinor))) {
      setError("Enter a valid SKU, title, and price. The original price must be greater than the sale price.");
      return;
    }
    if ((saleType === "original" && !saleOptions.original_enabled) || (saleType === "print" && (!saleOptions.printable_enabled || !saleOptions.print_sizes.includes(printSize) || !saleOptions.print_materials.includes(printMaterial)))) {
      setError("Enable this purchase format in Product details and select a configured print size and material.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error: saveError } = await supabase.from("product_variants")
      .update({ sku: cleanSku, title: cleanTitle, price_minor: priceMinor, compare_at_price_minor: compareAtMinor, is_active: active, reorder_level: cleanReorderLevel, option_values: saleType === "print" ? { sale_type: "print", print_size: printSize, print_material: printMaterial } : { sale_type: "original" } })
      .eq("id", variant.id).eq("store_id", storeId).select("id").maybeSingle();
    setSaving(false);
    if (saveError || !data) {
      setError(saveError?.code === "23505" ? "That SKU or print size/material combination is already in use." : "Could not save this variant.");
      return;
    }
    setMessage("Variant saved.");
  }

  return (
    <article className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a15e61]">Variant · {variant.sku}</p></div>
        <label className="block text-sm font-medium">SKU<input required maxLength={100} value={sku} onChange={(event) => setSku(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-medium">Variant title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-medium">Price (₹)<input required type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-medium">Low-stock alert at (units)<input required type="number" inputMode="numeric" min="0" max="100000" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[#716763]">Alert when available stock reaches this level. Set to 0 to disable.</span></label>
        <label className="block text-sm font-medium">Original price (₹)<input type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} placeholder="Optional, for sale pricing" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[#716763]">Must be higher than the current price. Clear to remove sale pricing.</span></label>
        <label className="block text-sm font-medium">Purchase format<select value={saleType} onChange={(event) => setSaleType(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 font-normal"><option value="original" disabled={!saleOptions.original_enabled}>Original painting</option><option value="print" disabled={!saleOptions.printable_enabled}>Print</option></select></label>
        {saleType === "print" && <>
          <label className="block text-sm font-medium">Print size<select value={printSize} onChange={(event) => setPrintSize(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 font-normal"><option value="">Choose size</option>{saleOptions.print_sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <label className="block text-sm font-medium">Print material<select value={printMaterial} onChange={(event) => setPrintMaterial(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 font-normal"><option value="">Choose material</option>{saleOptions.print_materials.map((material) => <option key={material} value={material}>{material}</option>)}</select></label>
        </>}
        <label className="flex items-center gap-3 self-end rounded-xl border border-[#eee5de] px-4 py-3 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Available for sale</label>
        {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-2">{error}</p>}
        {message && <p role="status" className="text-sm text-[#456247] sm:col-span-2">{message}</p>}
        <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl border border-[#d9c9bf] px-5 py-3 text-sm font-semibold text-[#a15e61] disabled:opacity-60">{saving ? "Saving…" : "Save variant"}</button></div>
      </form>
      <div className="mt-6 border-t border-[#eee5de] pt-5">
        <h3 className="font-medium">Stock by location</h3>
        {locations.length === 0 ? <p className="mt-3 text-sm text-[#716763]">No active inventory locations. Add an active location before receiving stock.</p> : (
          <div className="mt-4 space-y-4">{locations.map((location) => {
            const level = levels.find((item) => item.location_id === location.id);
            return <InventoryAdjustment key={location.id} storeId={storeId} variantId={variant.id} location={location} onHand={level?.on_hand ?? 0} reserved={level?.reserved ?? 0} />;
          })}</div>
        )}
      </div>
    </article>
  );
}

function InventoryAdjustment({ storeId, variantId, location, onHand, reserved }: { storeId: string; variantId: string; location: InventoryLocation; onHand: number; reserved: number }) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("stock_restock");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!/^-?\d+$/.test(delta) || Number(delta) === 0 || Math.abs(Number(delta)) > 100000) {
      setError("Enter a non-zero whole-number adjustment between -100,000 and 100,000.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error: adjustError } = await supabase.rpc("adjust_store_inventory", {
      p_store_id: storeId,
      p_location_id: location.id,
      p_variant_id: variantId,
      p_quantity_delta: Number(delta),
      p_reason: reason,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (adjustError) {
      setError(adjustError.message.includes("reserved") ? "This would reduce stock below the amount reserved for open orders." : "Could not adjust stock. Check the quantity and store access.");
      return;
    }
    const updated = Array.isArray(data) ? data[0] as { on_hand: number; reserved: number } | undefined : undefined;
    setDelta("");
    setNote("");
    setMessage(updated ? `Stock saved: ${updated.on_hand} on hand, ${updated.reserved} reserved.` : "Stock adjustment saved.");
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-[#fbf8f4] p-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{location.name}</strong><span>{onHand} on hand · {reserved} reserved · {Math.max(0, onHand - reserved)} available</span></div>
      <form onSubmit={adjust} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-semibold text-[#716763]">Change in units<input type="number" inputMode="numeric" min="-100000" max="100000" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="+10 or -2" className="mt-1.5 w-full rounded-lg border border-[#d9c9bf] bg-white px-3 py-2.5 text-sm font-normal text-[#27221f]" /></label>
        <label className="block text-xs font-semibold text-[#716763]">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d9c9bf] bg-white px-3 py-2.5 text-sm font-normal text-[#27221f]"><option value="stock_restock">Restock</option><option value="stock_correction">Stock correction</option><option value="stock_damaged">Damaged / write-off</option></select></label>
        <label className="block text-xs font-semibold text-[#716763]">Note (optional)<input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d9c9bf] bg-white px-3 py-2.5 text-sm font-normal text-[#27221f]" /></label>
        <div className="self-end"><button type="submit" disabled={saving} className="w-full rounded-lg bg-[#456247] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Adjust stock"}</button></div>
        {error && <p role="alert" className="text-xs text-[#7c4548] sm:col-span-2 lg:col-span-4">{error}</p>}
        {message && <p role="status" className="text-xs text-[#456247] sm:col-span-2 lg:col-span-4">{message}</p>}
      </form>
    </div>
  );
}

function CreateVariantForm({ storeId, productId, saleOptions }: { storeId: string; productId: string; saleOptions: SaleOptions }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [saleType, setSaleType] = useState(saleOptions.original_enabled ? "original" : "print");
  const [printSize, setPrintSize] = useState("");
  const [printMaterial, setPrintMaterial] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cleanSku = sku.trim();
    const cleanTitle = title.trim();
    const priceMinor = parseRupees(price);
    if (!cleanSku || cleanSku.length > 100 || !cleanTitle || cleanTitle.length > 160 || priceMinor === null) {
      setError("Enter a valid SKU, variant title, and rupee price.");
      return;
    }
    if ((saleType === "original" && !saleOptions.original_enabled) || (saleType === "print" && (!saleOptions.printable_enabled || !saleOptions.print_sizes.includes(printSize) || !saleOptions.print_materials.includes(printMaterial)))) {
      setError("Enable this purchase format in Product details and select a configured print size and material.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("product_variants").insert({
      store_id: storeId, product_id: productId, sku: cleanSku, title: cleanTitle, price_minor: priceMinor, currency: "INR", is_active: true,
      option_values: saleType === "print" ? { sale_type: "print", print_size: printSize, print_material: printMaterial } : { sale_type: "original" },
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "That SKU or print size/material combination is already in use." : "Could not add the variant.");
      return;
    }
    setSku("");
    setTitle("");
    setPrice("");
    router.refresh();
  }

  return (
    <form onSubmit={create} className="mt-5 grid gap-3 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 p-5 sm:grid-cols-4">
      <h3 className="font-medium sm:col-span-4">Add a variant</h3>
      <label className="block text-sm font-medium">SKU<input required maxLength={100} value={sku} onChange={(event) => setSku(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-medium">Title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Blue / Large" className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-medium">Price (₹)<input required type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-medium">Purchase format<select value={saleType} onChange={(event) => setSaleType(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal"><option value="original" disabled={!saleOptions.original_enabled}>Original painting</option><option value="print" disabled={!saleOptions.printable_enabled}>Print</option></select></label>
      {saleType === "print" && <>
        <label className="block text-sm font-medium">Print size<select value={printSize} onChange={(event) => setPrintSize(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal"><option value="">Choose size</option>{saleOptions.print_sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <label className="block text-sm font-medium">Print material<select value={printMaterial} onChange={(event) => setPrintMaterial(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 font-normal"><option value="">Choose material</option>{saleOptions.print_materials.map((material) => <option key={material} value={material}>{material}</option>)}</select></label>
      </>}
      <div className="self-end"><button type="submit" disabled={saving} className="w-full rounded-xl border border-[#d9c9bf] px-4 py-2.5 text-sm font-semibold text-[#a15e61] disabled:opacity-60">{saving ? "Adding…" : "Add variant"}</button></div>
      {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-4">{error}</p>}
    </form>
  );
}
