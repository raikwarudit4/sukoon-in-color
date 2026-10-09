import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
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

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, description, product_media(id, url, alt_text, sort_order), product_variants(id, title, price_minor, currency)",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load the public product catalog:", error.message);
  }

  const products = (data ?? []) as CatalogProduct[];

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7] bg-[#fbf8f4]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <a href="/" className="text-lg font-semibold tracking-[0.12em]">
            SUKOON <span className="text-[#b56e70]">IN COLOR</span>
          </a>
          <span className="text-sm text-[#716763]">A little color, a little calm.</span>
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-[#e8dfd7] px-6 py-7 text-center text-sm text-[#716763]">
        Sukoon in Color
      </footer>
    </main>
  );
}
