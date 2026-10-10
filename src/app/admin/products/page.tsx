import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateProductForm } from "./create-product-form";

type Product = { id: string; name: string; slug: string; status: string; description: string | null };
type Variant = { id: string; product_id: string; sku: string; title: string; price_minor: number; currency: string; is_active: boolean };
type StockLevel = { variant_id: string; location_id: string; on_hand: number; reserved: number };

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim() || "INR", maximumFractionDigits: 2 }).format(amountMinor / 100);
}

export default async function StoreProductsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Fproducts");

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-10">Store products are unavailable.</main>;

  const { data: isMember, error: memberError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (memberError || isMember !== true) return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
      <section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
        <h1 className="text-xl font-medium">Store access required</h1>
        <p className="mt-2 text-sm text-[#716763]">This account cannot manage store products.</p>
        <Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
      </section>
    </main>
  );

  const [productResult, variantResult, levelResult] = await Promise.all([
    supabase.from("products").select("id, name, slug, status, description").eq("store_id", store.id).order("name"),
    supabase.from("product_variants").select("id, product_id, sku, title, price_minor, currency, is_active").eq("store_id", store.id).order("sku"),
    supabase.from("inventory_levels").select("variant_id, location_id, on_hand, reserved").eq("store_id", store.id),
  ]);
  const loadError = productResult.error || variantResult.error || levelResult.error;
  const products = (productResult.data ?? []) as Product[];
  const variants = (variantResult.data ?? []) as Variant[];
  const levels = (levelResult.data ?? []) as StockLevel[];
  const variantsByProduct = new Map<string, Variant[]>();
  for (const variant of variants) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), variant]);
  const stockByVariant = new Map<string, number>();
  for (const level of levels) stockByVariant.set(level.variant_id, (stockByVariant.get(level.variant_id) ?? 0) + Math.max(0, level.on_hand - level.reserved));

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link>
            <Link href="/admin/reviews" className="text-[#716763] hover:text-[#a15e61]">Reviews</Link>
            <Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping</Link>
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Products and inventory</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#716763]">Edit product details and prices, create draft products, and record stock changes. Inventory adjustments cannot consume stock reserved for open orders.</p>

        {loadError ? (
          <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-sm text-[#7c4548]">Could not load products or inventory. Confirm migration 058 is applied, then refresh.</div>
        ) : (
          <>
            <CreateProductForm storeId={store.id} />
            <div className="mt-10 flex items-end justify-between border-b border-[#e8dfd7] pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Catalog</p><h2 className="mt-2 text-2xl font-medium">{products.length} {products.length === 1 ? "product" : "products"}</h2></div>
              <Link href="/" className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">View shop</Link>
            </div>
            {products.length === 0 ? (
              <p className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 p-10 text-center text-sm text-[#716763]">No products yet. Create your first draft above.</p>
            ) : (
              <ul className="mt-6 space-y-4">
                {products.map((product) => {
                  const productVariants = variantsByProduct.get(product.id) ?? [];
                  const available = productVariants.reduce((sum, variant) => sum + (stockByVariant.get(variant.id) ?? 0), 0);
                  return (
                    <li key={product.id} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-medium">{product.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${product.status === "active" ? "bg-[#e7f0e6] text-[#456247]" : "bg-[#f3ece7] text-[#716763]"}`}>{product.status}</span></div>
                          <p className="mt-1 text-sm text-[#716763]">/{product.slug} · {productVariants.length} {productVariants.length === 1 ? "variant" : "variants"} · {available} available</p>
                          {productVariants.length > 0 && <ul className="mt-4 space-y-2 text-sm">{productVariants.map((variant) => <li key={variant.id} className="flex flex-wrap justify-between gap-2"><span>{variant.sku} · {variant.title}{!variant.is_active ? " · inactive" : ""}</span><span>{formatPrice(variant.price_minor, variant.currency)} · {stockByVariant.get(variant.id) ?? 0} available</span></li>)}</ul>}
                          {productVariants.length === 0 && <p className="mt-3 text-sm text-[#7c4548]">No variant yet.</p>}
                        </div>
                        <Link href={`/admin/products/${product.id}`} className="rounded-xl border border-[#d9c9bf] px-4 py-2.5 text-sm font-semibold text-[#a15e61] hover:bg-[#fbf8f4]">Manage</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
