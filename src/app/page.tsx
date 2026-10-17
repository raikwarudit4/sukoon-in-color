import Image from "next/image";
import Link from "next/link";
import { AccountNav } from "@/components/account-nav";
import { FavoriteButton } from "@/components/favorite-button";
import { createClient } from "@/lib/supabase/server";
import { CatalogFilters } from "@/components/catalog-filters";

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  created_at: string;
  categories: { name: string; slug: string }[];
  product_media: {
    id: string;
    url: string;
    alt_text: string | null;
    sort_order: number;
  }[];
  product_variants: {
    id: string;
    title: string;
    price_minor: number;
    currency: string;
  }[];
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  const categorySlug = params.category ?? "";
  const sort = params.sort ?? "newest";
  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", "sukoon-in-color")
    .eq("status", "active")
    .maybeSingle();
  const { data: categories } = store ? await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .order("sort_order") : { data: [] };
  const selectedCategory = (categories ?? []).find((category) => category.slug === categorySlug);
  let productsQuery = supabase
    .from("products")
    .select(
      "id, name, slug, description, category_id, created_at, categories(name, slug), stores!inner(slug), product_media(id, url, alt_text, sort_order), product_variants!inner(id, title, price_minor, currency)",
    )
    .eq("status", "active")
    .eq("product_variants.is_active", true)
    .eq("stores.slug", "sukoon-in-color")
    .order("created_at", { ascending: false })
    .limit(100);
  if (query) productsQuery = productsQuery.ilike("name", `%${query.replace(/[%_]/g, "\\$&")}%`);
  if (selectedCategory) productsQuery = productsQuery.eq("category_id", selectedCategory.id);
  const { data, error } = await productsQuery;

  if (error) {
    console.error("Could not load the public product catalog:", error.message);
  }

  const products = (data ?? []) as CatalogProduct[];
  if (sort === "price-asc") products.sort((a, b) => (a.product_variants?.[0]?.price_minor ?? 0) - (b.product_variants?.[0]?.price_minor ?? 0));
  if (sort === "price-desc") products.sort((a, b) => (b.product_variants?.[0]?.price_minor ?? 0) - (a.product_variants?.[0]?.price_minor ?? 0));
  if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const { data: savedItems } = profile && store
    ? await supabase.from("wishlist_items").select("product_id").eq("store_id", store.id).eq("user_id", profile.id)
    : { data: [] };
  const savedProductIds = new Set((savedItems ?? []).map((item) => item.product_id));

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7] bg-[#fbf8f4]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">
            SUKOON <span className="text-[#b56e70]">IN COLOR</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="hidden text-sm text-[#716763] lg:inline">
              A little color, a little calm.
            </span>
            <AccountNav />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[#a15e61]">
          Made for everyday joy
        </p>
        <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          Find your favorite shade of sukoon.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#716763] sm:text-lg">
          Thoughtful finds, warm colors, and small moments that feel like you.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <CatalogFilters categories={categories ?? []} query={query} category={categorySlug} sort={sort} />
        <div className="mb-7 flex items-end justify-between border-b border-[#e8dfd7] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">
              The collection
            </p>
            <h2 className="mt-2 text-2xl font-medium">Shop our latest</h2>
          </div>
          {!error && products.length > 0 && (
            <p className="text-sm text-[#716763]">
              {products.length} {products.length === 1 ? "piece" : "pieces"}
            </p>
          )}
        </div>

        {error ? (
          <div className="rounded-2xl border border-[#ead5d2] bg-white p-6 text-[#7c4548]">
            The collection could not be loaded right now. Please refresh in a moment.
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 px-6 py-14 text-center">
            <h3 className="text-xl font-medium">The collection is taking shape</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#716763]">
              Published products will appear here as soon as they are added to an active store.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const variant = product.product_variants?.[0];
              const image = [...(product.product_media ?? [])].sort(
                (a, b) => a.sort_order - b.sort_order,
              )[0];

              return (
                <article
                  key={product.id}
                  className="flex min-h-60 flex-col rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)]"
                >
                  <Link href={`/products/${product.slug}`} className="flex flex-1 flex-col">
                    {image ? (
                      <div className="relative mb-6 aspect-[4/3] overflow-hidden rounded-xl bg-[#f4e9e5]">
                        <Image
                          src={image.url}
                          alt={image.alt_text || product.name}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="mb-6 flex h-24 items-center justify-center rounded-xl bg-[#f4e9e5] text-3xl text-[#a15e61]">
                        ✿
                      </div>
                    )}
                    <h3 className="text-lg font-medium">{product.name}</h3>
                    {product.description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#716763]">
                        {product.description}
                      </p>
                    )}
                    <div className="mt-auto pt-5 text-sm font-semibold">
                      {variant
                        ? formatPrice(variant.price_minor, variant.currency)
                        : "Price coming soon"}
                    </div>
                  </Link>
                  {store && <div className="mt-4">
                    <FavoriteButton
                      storeId={store.id}
                      productId={product.id}
                      userId={profile?.id ?? null}
                      initiallySaved={savedProductIds.has(product.id)}
                      returnPath={`/products/${product.slug}`}
                      compact
                    />
                  </div>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-[#e8dfd7] px-6 py-7 text-sm text-[#716763]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} Sukoon in Color · Pune</p>
          <nav aria-label="Store policies" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/cancellation-refunds" className="hover:text-[#a15e61]">Cancellation &amp; refunds</Link>
            <Link href="/shipping-delivery" className="hover:text-[#a15e61]">Shipping &amp; delivery</Link>
            <Link href="/contact" className="hover:text-[#a15e61]">Contact</Link>
            <a href="mailto:support@sukoonincolor.com" className="hover:text-[#a15e61]">support@sukoonincolor.com</a>
            <a href="tel:+917000887490" className="hover:text-[#a15e61]">7000887490</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
