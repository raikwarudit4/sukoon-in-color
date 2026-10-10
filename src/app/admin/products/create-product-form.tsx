"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export function CreateProductForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    const cleanSku = sku.trim();
    const priceMinor = parseRupees(price);
    const cleanImageUrl = imageUrl.trim();
    if (!cleanName || cleanName.length > 180 || !cleanSlug || cleanSlug.length > 180 || !cleanSku || cleanSku.length > 100) {
      setError("Enter a product name, a short URL slug, and a SKU.");
      return;
    }
    if (priceMinor === null) {
      setError("Enter a price in rupees with up to two decimal places.");
      return;
    }
    if (description.trim().length > 10000) {
      setError("Description must be 10,000 characters or fewer.");
      return;
    }
    if (cleanImageUrl && (!cleanImageUrl.startsWith("https://") || cleanImageUrl.length > 2048)) {
      setError("Use a public HTTPS image URL, or leave the image field blank.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: product, error: productError } = await supabase.from("products")
      .insert({ store_id: storeId, name: cleanName, slug: cleanSlug, description: description.trim() || null, status: "draft" })
      .select("id").single();
    if (productError || !product) {
      setSaving(false);
      setError(productError?.code === "23505" ? "That product URL slug is already in use." : "Could not create the product. Check the details and try again.");
      return;
    }

    const { error: variantError } = await supabase.from("product_variants").insert({
      store_id: storeId, product_id: product.id, sku: cleanSku, title: "Default", price_minor: priceMinor, currency: "INR", is_active: true,
    });
    if (variantError) {
      await supabase.from("products").delete().eq("id", product.id).eq("store_id", storeId);
      setSaving(false);
      setError(variantError.code === "23505" ? "That SKU is already in use." : "Could not create the first variant. No product was kept; check the details and retry.");
      return;
    }

    if (cleanImageUrl) {
      const { error: imageError } = await supabase.from("product_media").insert({
        store_id: storeId, product_id: product.id, url: cleanImageUrl, alt_text: cleanName, sort_order: 0,
      });
      if (imageError) {
        await supabase.from("products").delete().eq("id", product.id).eq("store_id", storeId);
        setSaving(false);
        setError("The product image could not be saved. The draft was removed; check the public URL and retry.");
        return;
      }
    }

    router.push(`/admin/products/${product.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={createProduct} className="mt-6 grid gap-4 rounded-2xl border border-[#eee5de] bg-white p-5 sm:grid-cols-2 sm:p-6">
      <div className="sm:col-span-2"><h2 className="text-lg font-medium">Add a product</h2><p className="mt-1 text-sm text-[#716763]">New products start as drafts so you can review them before publishing.</p></div>
      <label className="block text-sm font-medium">Product name<input required maxLength={180} value={name} onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugify(event.target.value)); }} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Product URL slug<input required maxLength={180} value={slug} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">First variant SKU<input required maxLength={100} value={sku} onChange={(event) => setSku(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium">Price (₹)<input required type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Description<textarea maxLength={10000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Cover image public URL (optional)<input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-[#716763]">Upload the image to Supabase Storage first, then paste its public URL.</span></label>
      {error && <p role="alert" className="text-sm text-[#7c4548] sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creating…" : "Create draft product"}</button></div>
    </form>
  );
}
