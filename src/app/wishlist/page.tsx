import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FavoriteButton } from "@/components/favorite-button";
import { AddWishlistItemToCart, ClearWishlistButton } from "./wishlist-actions";

type WishlistProduct = {
  id: string;
  name: string;
  slug: string;
  product_media: { url: string; alt_text: string | null; sort_order: number }[];
  product_variants: { id: string; price_minor: number; currency: string; is_active: boolean }[];
};

type WishlistItem = { id: string; store_id: string; product_id: string; products: WishlistProduct | null };

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function WishlistPage({ searchParams }: { searchParams: Promise<{ moved?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fwishlist");

  const [{ data: profile }, { data: store }] = await Promise.all([
    supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle(),
    supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle(),
  ]);
  if (!profile || !store) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><p>Your wishlist is unavailable right now.</p></main>;

  const { data, error } = await supabase.from("wishlist_items")
    .select("id, store_id, product_id, products!inner(id, name, slug, product_media(url, alt_text, sort_order), product_variants(id, price_minor, currency, is_active))")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });
  const items = (data ?? []) as unknown as WishlistItem[];

  return <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
    <header className="border-b border-[#e8dfd7]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
        <Link href="/" className="text-sm text-[#716763] hover:text-[#a15e61]">Continue shopping</Link>
      </div>
    </header>
    <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Your account</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-medium sm:text-4xl">Wishlist</h1>
        {!error && items.length > 0 && <ClearWishlistButton storeId={store.id} userId={profile.id} />}
      </div>
      {params.moved === "1" && <p role="status" className="mt-5 rounded-xl border border-[#d5e4d2] bg-white p-4 text-sm text-[#456247]">Item added to your cart and removed from your wishlist. <Link href="/cart" className="ml-1 font-semibold underline underline-offset-4">Go to cart</Link></p>}
      {error ? <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-sm text-[#7c4548]">Wishlist isn’t set up yet. Apply migrations 063 and 064, then refresh this page.</div>
        : items.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 px-6 py-14 text-center">
          <h2 className="text-xl font-medium">Your wishlist is empty</h2>
          <p className="mt-2 text-sm text-[#716763]">Add products you’d like to come back to.</p>
          <Link href="/" className="mt-5 inline-flex rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white">Browse the collection</Link>
        </div> : <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.filter((item) => item.products).map((item) => {
            const product = item.products!;
            const image = [...product.product_media].sort((a, b) => a.sort_order - b.sort_order)[0];
            const variant = product.product_variants.find((entry) => entry.is_active);
            return <li key={item.id} className="rounded-2xl border border-[#eee5de] bg-white p-5">
              <Link href={`/products/${product.slug}`} className="block">
                {image ? <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-[#f4e9e5]">
                  <Image src={image.url} alt={image.alt_text || product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized className="object-cover" />
                </div> : <div className="mb-4 grid aspect-[4/3] place-items-center rounded-xl bg-[#f4e9e5] text-4xl text-[#a15e61]">✿</div>}
                <h2 className="text-lg font-medium">{product.name}</h2>
                {variant && <p className="mt-1 text-sm text-[#716763]">{formatPrice(variant.price_minor, variant.currency)}</p>}
              </Link>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link href={`/products/${product.slug}`} className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">View product</Link>
                <div className="flex items-center gap-2">
                  <AddWishlistItemToCart storeId={item.store_id} productId={item.product_id} variantId={variant?.id} />
                  <FavoriteButton storeId={item.store_id} productId={item.product_id} userId={profile.id} initiallySaved returnPath="/wishlist" compact />
                </div>
              </div>
            </li>;
          })}
        </ul>}
    </section>
  </main>;
}
