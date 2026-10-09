import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ProductDetail = {
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
    sku: string;
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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, description, stores!inner(slug), product_media(id, url, alt_text, sort_order), product_variants(id, title, sku, price_minor, currency)",
    )
    .eq("slug", slug)
    .eq("status", "active")
    .eq("stores.slug", "sukoon-in-color")
    .maybeSingle();

  if (error) {
    console.error("Could not load the product page:", error.message);
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
        <div className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
          <h1 className="text-xl font-medium">This product could not be loaded</h1>
          <p className="mt-2 text-sm leading-6 text-[#716763]">
            Please return to the collection and try again.
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-[#a15e61]">
            Back to the collection
          </Link>
        </div>
      </main>
    );
  }

  if (!data) notFound();

  const product = data as ProductDetail;
  const images = [...(product.product_media ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const variants = product.product_variants ?? [];

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">
            SUKOON <span className="text-[#b56e70]">IN COLOR</span>
          </Link>
          <Link href="/" className="text-sm text-[#716763] hover:text-[#a15e61]">
            Back to collection
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#f4e9e5]">
          {images[0] ? (
            <Image
              src={images[0].url}
              alt={images[0].alt_text || product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-6xl text-[#a15e61]">✿</div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a15e61]">
            Sukoon in Color
          </p>
          <h1 className="mt-3 text-3xl font-medium leading-tight sm:text-5xl">
            {product.name}
          </h1>
          {variants.length > 0 && (
            <p className="mt-5 text-2xl font-semibold">
              {formatPrice(variants[0].price_minor, variants[0].currency)}
            </p>
          )}
          {product.description && (
            <p className="mt-6 whitespace-pre-line text-base leading-7 text-[#716763]">
              {product.description}
            </p>
          )}

          {variants.length > 1 && (
            <div className="mt-8 border-t border-[#e8dfd7] pt-6">
              <h2 className="text-sm font-semibold">Available options</h2>
              <ul className="mt-3 space-y-2">
                {variants.map((variant) => (
                  <li key={variant.id} className="flex justify-between gap-4 text-sm">
                    <span className="text-[#716763]">{variant.title}</span>
                    <span className="font-medium">
                      {formatPrice(variant.price_minor, variant.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-9 rounded-xl bg-white px-4 py-3 text-sm text-[#716763]">
            Online ordering is coming soon. For now, browse the collection and product details.
          </p>
        </div>
      </section>
    </main>
  );
}
