"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type EditableProduct = { id: string; store_id: string; name: string; slug: string; description: string | null; status: "draft" | "active" | "archived" };
export type EditableVariant = { id: string; product_id: string; store_id: string; sku: string; title: string; price_minor: number; currency: string; is_active: boolean };
export type InventoryLocation = { id: string; name: string; is_active: boolean };
export type InventoryLevel = { location_id: string; variant_id: string; on_hand: number; reserved: number };
export type ProductImage = { id: string; url: string; alt_text: string | null; sort_order: number };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
            <VariantCard key={variant.id} storeId={storeId} variant={variant} locations={locations} levels={levels.filter((level) => level.variant_id === variant.id)} />
          ))}</div>
        )}
        <CreateVariantForm storeId={storeId} productId={product.id} />
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
  const [imageUrl, setImageUrl] = useState(images[0]?.url ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    const cleanImage = imageUrl.trim();
    if (!cleanName || cleanName.length > 180 || !cleanSlug || cleanSlug.length > 180 || description.length > 10000) {
      setError("Check the product name, slug, and description lengths.");
      return;
    }
    if (cleanImage && (!cleanImage.startsWith("https://") || cleanImage.length > 2048)) {
      setError("Use a public HTTPS image URL, or clear the field to remove the current cover image.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: updated, error: productError } = await supabase.from("products")
      .update({ name: cleanName, slug: cleanSlug, description: description.trim() || null, status })
      .eq("id", product.id).eq("store_id", storeId).select("id").maybeSingle();
    if (productError || !updated) {
      setSaving(false);
      setError(productError?.code === "23505" ? "That product URL slug is already in use." : "Could not save the product details.");
      return;
    }

    const primaryImage = [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
    let mediaError: { code?: string } | null = null;
    if (cleanImage && primaryImage) {
      const { error: updateError } = await supabase.from("product_media").update({ url: cleanImage, alt_text: cleanName })
        .eq("id", primaryImage.id).eq("store_id", storeId).eq("product_id", product.id);
      mediaError = updateError;
    } else if (cleanImage) {
      const { error: insertError } = await supabase.from("product_media").insert({ store_id: storeId, product_id: product.id, url: cleanImage, alt_text: cleanName, sort_order: 0 });
      mediaError = insertError;
    } else if (primaryImage) {
      const { error: deleteError } = await supabase.from("product_media").delete()
        .eq("id", primaryImage.id).eq("store_id", storeId).eq("product_id", product.id);
      mediaError = deleteError;
    }
    setSaving(false);
    if (mediaError) {
      setError("Product details were saved, but the cover image could not be updated.");
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
      <label className="block text-sm font-medium sm:col-span-2">Cover image public URL<input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[#716763]">Paste a public Supabase Storage URL. Clear this field to remove the current cover image.</span></label>
      {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-2">{error}</p>}
      {message && <p role="status" className="text-sm text-[#456247] sm:col-span-2">{message}</p>}
      <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save product"}</button></div>
    </form>
  );
}

function VariantCard({ storeId, variant, locations, levels }: { storeId: string; variant: EditableVariant; locations: InventoryLocation[]; levels: InventoryLevel[] }) {
  const [sku, setSku] = useState(variant.sku);
  const [title, setTitle] = useState(variant.title);
  const [price, setPrice] = useState(formatRupees(variant.price_minor));
  const [active, setActive] = useState(variant.is_active);
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
    if (!cleanSku || cleanSku.length > 100 || !cleanTitle || cleanTitle.length > 160 || priceMinor === null) {
      setError("Enter a valid SKU, variant title, and rupee price.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error: saveError } = await supabase.from("product_variants")
      .update({ sku: cleanSku, title: cleanTitle, price_minor: priceMinor, is_active: active })
      .eq("id", variant.id).eq("store_id", storeId).select("id").maybeSingle();
    setSaving(false);
    if (saveError || !data) {
      setError(saveError?.code === "23505" ? "That SKU is already in use." : "Could not save this variant.");
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

function CreateVariantForm({ storeId, productId }: { storeId: string; productId: string }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
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
    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("product_variants").insert({
      store_id: storeId, product_id: productId, sku: cleanSku, title: cleanTitle, price_minor: priceMinor, currency: "INR", is_active: true,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "That SKU is already in use." : "Could not add the variant.");
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
      <div className="self-end"><button type="submit" disabled={saving} className="w-full rounded-xl border border-[#d9c9bf] px-4 py-2.5 text-sm font-semibold text-[#a15e61] disabled:opacity-60">{saving ? "Adding…" : "Add variant"}</button></div>
      {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-4">{error}</p>}
    </form>
  );
}
