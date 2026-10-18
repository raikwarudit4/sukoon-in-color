import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductEditor, type EditableProduct, type EditableVariant, type InventoryLocation, type InventoryLevel, type ProductImage } from "./product-editor";
import { hasStorePermission } from "@/lib/auth/store-permissions";

export default async function EditStoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/admin/products/${id}`)}`);

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-10">Store products are unavailable.</main>;

  const [canManageCatalog, canManageInventory] = await Promise.all([
    hasStorePermission(supabase, store.id, "catalog.manage"),
    hasStorePermission(supabase, store.id, "inventory.manage"),
  ]);
  if (!canManageCatalog || !canManageInventory) return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
      <section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
        <h1 className="text-xl font-medium">Store access required</h1>
        <p className="mt-2 text-sm text-[#716763]">This account cannot manage store products.</p>
        <Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
      </section>
    </main>
  );

  const [productResult, variantResult, locationResult, levelResult, imageResult] = await Promise.all([
    supabase.from("products").select("id, store_id, name, slug, description, status, metadata").eq("id", id).eq("store_id", store.id).maybeSingle(),
    supabase.from("product_variants").select("id, product_id, store_id, sku, title, option_values, price_minor, compare_at_price_minor, currency, is_active, reorder_level").eq("store_id", store.id).eq("product_id", id).order("sku"),
    supabase.from("inventory_locations").select("id, name, is_active").eq("store_id", store.id).eq("is_active", true).order("name"),
    supabase.from("inventory_levels").select("location_id, variant_id, on_hand, reserved").eq("store_id", store.id),
    supabase.from("product_media").select("id, url, alt_text, sort_order").eq("store_id", store.id).eq("product_id", id).order("sort_order"),
  ]);
  if (!productResult.data) notFound();
  if (variantResult.error || locationResult.error || levelResult.error || imageResult.error) {
    return <main className="min-h-screen bg-[#fbf8f4] p-8 text-[#7c4548]">Could not load editing details. Confirm migration 058 is applied, then refresh.</main>;
  }

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
          <nav className="flex items-center gap-4 text-sm"><Link href="/admin" className="text-[#716763] hover:text-[#a15e61]">Dashboard</Link><Link href="/admin/products" className="text-[#716763] hover:text-[#a15e61]">Back to products</Link></nav>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Catalog editor</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">{productResult.data.name}</h1>
        <ProductEditor
          storeId={store.id}
          product={productResult.data as EditableProduct}
          variants={(variantResult.data ?? []) as EditableVariant[]}
          locations={(locationResult.data ?? []) as InventoryLocation[]}
          levels={(levelResult.data ?? []) as InventoryLevel[]}
          images={(imageResult.data ?? []) as ProductImage[]}
        />
      </section>
    </main>
  );
}
