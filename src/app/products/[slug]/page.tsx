import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountNav } from "@/components/account-nav";
import { FavoriteButton } from "@/components/favorite-button";
import { ProductViewTracker } from "@/components/product-view-tracker";
import { ShareProductButton } from "@/components/share-product-button";
import { createClient } from "@/lib/supabase/server";
import { AddToCart } from "./add-to-cart";
import { ProductGallery, type GalleryImage } from "./product-gallery";
import { ReviewForm } from "./review-form";

type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
};

type ProductDetail = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  description: string | null;
  metadata: { artwork_specs?: Record<string, unknown>; artwork_links?: Record<string, unknown>; sale_options?: Record<string, unknown>; reviews_enabled?: boolean } | null;
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
    option_values: Record<string, unknown>;
    price_minor: number;
    compare_at_price_minor: number | null;
    currency: string;
  }[];
};

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
      "id, store_id, name, slug, description, metadata, stores!inner(slug), product_media(id, url, alt_text, sort_order), product_variants!inner(id, title, sku, option_values, price_minor, compare_at_price_minor, currency)",
    )
    .eq("slug", slug)
    .eq("status", "active")
    .eq("product_variants.is_active", true)
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
  const reviewsEnabled = product.metadata?.reviews_enabled !== false;
  const images = [...(product.product_media ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const variants = product.product_variants ?? [];
  const rawArtworkSpecs = product.metadata?.artwork_specs;
  const artworkSpecs = rawArtworkSpecs && typeof rawArtworkSpecs === "object" && !Array.isArray(rawArtworkSpecs)
    ? rawArtworkSpecs
    : {};
  const specificationRows = [
    ["International shipping", artworkSpecs.international_shipping],
    ["Size", artworkSpecs.size],
    ["Medium", artworkSpecs.medium],
    ["Style", artworkSpecs.style],
    ["Created in", artworkSpecs.created_in],
    ["Surface", artworkSpecs.surface],
    ["Lot number", artworkSpecs.lot_number],
    ["Domestic ships within", artworkSpecs.domestic_shipping_time],
    ["International ships within", artworkSpecs.international_shipping_time],
  ].filter((row): row is [string, string] => typeof row[1] === "string" && row[1].trim().length > 0);
  const rawArtworkLinks = product.metadata?.artwork_links;
  const artworkLinks = rawArtworkLinks && typeof rawArtworkLinks === "object" && !Array.isArray(rawArtworkLinks)
    ? rawArtworkLinks
    : {};
  const publicHttpsUrl = (value: unknown) => {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.toString() : null;
    } catch { return null; }
  };
  const certificateUrl = publicHttpsUrl(artworkLinks.certificate_url);
  const articleUrl = publicHttpsUrl(artworkLinks.article_url);
  const articleTitle = typeof artworkLinks.article_title === "string" && artworkLinks.article_title.trim().length <= 160
    ? artworkLinks.article_title.trim()
    : "";
  const { data: { user } } = await supabase.auth.getUser();
  let reviews: PublicReview[] = [];
  if (reviewsEnabled) {
    const { data: reviewData, error: reviewError } = await supabase.from("reviews")
      .select("id, rating, title, body, created_at")
      .eq("product_id", product.id).eq("status", "published")
      .not("reviewed_variant_id", "is", null)
      .order("created_at", { ascending: false });
    reviews = (reviewData ?? []) as PublicReview[];
    if (reviewError) console.error("Could not load product reviews:", reviewError.message);
  }

  const { data: metricsData, error: metricsError } = await supabase.rpc("get_public_product_metrics", {
    p_store_id: product.store_id,
    p_product_id: product.id,
  });
  const productMetrics = Array.isArray(metricsData) ? metricsData[0] : metricsData;
  if (metricsError) console.error("Could not load product metrics:", metricsError.code, metricsError.message);

  let reviewUserId: string | null = null;
  let reviewVariantId: string | null = null;
  let reviewEligibility: "eligible" | "pending" | "published" | "rejected" | null = null;
  let isWishlisted = false;
  if (user) {
    const { data: profile } = await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (profile) {
      reviewUserId = profile.id;
      const [{ data: existingReview }, { data: printVariant }, { data: savedItem }] = await Promise.all([
        supabase.from("reviews").select("status").eq("product_id", product.id).eq("user_id", profile.id).maybeSingle(),
        reviewsEnabled ? supabase.rpc("get_delivered_print_variant", { p_product_id: product.id }) : Promise.resolve({ data: null, error: null }),
        supabase.from("wishlist_items").select("id").eq("store_id", product.store_id).eq("product_id", product.id).eq("user_id", profile.id).maybeSingle(),
      ]);
      isWishlisted = Boolean(savedItem);
      reviewVariantId = typeof printVariant === "string" ? printVariant : null;
      reviewEligibility = existingReview?.status === "pending" || existingReview?.status === "published" || existingReview?.status === "rejected"
        ? existingReview.status
        : reviewVariantId ? "eligible" : null;
    }
  }
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <ProductViewTracker storeId={product.store_id} productId={product.id} />
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">
            SUKOON <span className="text-[#b56e70]">IN COLOR</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/" className="hidden text-sm text-[#716763] hover:text-[#a15e61] sm:inline">
              Back to collection
            </Link>
            <AccountNav />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-16">
        <ProductGallery images={images as GalleryImage[]} productName={product.name} />

        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a15e61]">
            Sukoon in Color
          </p>
          {productMetrics && <p className="mt-2 text-xs text-[#716763]">
            {new Intl.NumberFormat("en-IN").format(Number(productMetrics.view_count))} views
            <span aria-hidden="true"> · </span>
            Wishlisted by {new Intl.NumberFormat("en-IN").format(Number(productMetrics.wishlist_count))} {Number(productMetrics.wishlist_count) === 1 ? "customer" : "customers"}
          </p>}
          <h1 className="mt-3 text-3xl font-medium leading-tight sm:text-5xl">
            {product.name}
          </h1>
          {product.description && (
            <p className="mt-6 whitespace-pre-line text-base leading-7 text-[#716763]">
              {product.description}
            </p>
          )}

          <AddToCart
            storeId={product.store_id}
            variants={variants}
            saleOptions={product.metadata?.sale_options ?? null}
            returnPath={`/products/${product.slug}`}
            productName={product.name}
            imageUrl={images[0]?.url ?? null}
            originalDimensions={typeof artworkSpecs.size === "string" ? artworkSpecs.size : null}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <FavoriteButton
              storeId={product.store_id}
              productId={product.id}
              userId={reviewUserId}
              initiallySaved={isWishlisted}
              returnPath={`/products/${product.slug}`}
            />
            <ShareProductButton title={product.name} />
          </div>
        </div>
      </section>

      {specificationRows.length > 0 && <section className="mx-auto max-w-7xl px-6 pb-12 lg:px-10" aria-labelledby="specifications-heading">
        <div className="border-t border-[#e8dfd7] pt-8">
          <h2 id="specifications-heading" className="text-2xl font-medium">Specifications</h2>
          <dl className="mt-5 grid gap-x-12 gap-y-4 sm:grid-cols-2 lg:max-w-4xl">
            {specificationRows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-b border-[#eee5de] pb-3 text-sm">
              <dt className="text-[#716763]">{label}</dt><dd className="font-medium text-[#27221f]">{value}</dd>
            </div>)}
          </dl>
        </div>
      </section>}

      {(certificateUrl || articleUrl) && <section className="mx-auto max-w-7xl px-6 pb-12 lg:px-10" aria-label="Artwork information">
        <div className="grid gap-4 sm:grid-cols-2">
          {certificateUrl && <a href={certificateUrl} target="_blank" rel="noreferrer" className="flex min-h-24 items-center gap-4 rounded-2xl border border-[#ead5d2] bg-[#fff7f5] p-5 transition hover:border-[#a15e61]">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full border border-[#a15e61] text-xl text-[#a15e61]">✓</span>
            <span><span className="block font-medium">Authentication certificate</span><span className="mt-1 block text-sm text-[#716763]">View the certificate for this artwork ↗</span></span>
          </a>}
          {articleUrl && <a href={articleUrl} target="_blank" rel="noreferrer" className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-[#e8dfd7] bg-white p-5 font-medium underline decoration-[#a15e61] underline-offset-4 transition hover:border-[#a15e61]">
            <span>{articleTitle || "Read more about this artwork"}</span><span aria-hidden="true">↗</span>
          </a>}
        </div>
      </section>}

      {reviewsEnabled && <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10" aria-labelledby="reviews-heading">
        <div className="border-t border-[#e8dfd7] pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Customer feedback</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="reviews-heading" className="text-2xl font-medium">Reviews</h2>
            {averageRating !== null && <p className="text-sm text-[#716763]">★ {averageRating.toFixed(1)} out of 5 · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}</p>}
          </div>

          {reviews.length === 0 ? (
            <p className="mt-4 text-sm text-[#716763]">No published reviews yet.</p>
          ) : (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-2xl border border-[#eee5de] bg-white p-5">
                  <p className="text-sm tracking-wider text-[#a15e61]" aria-label={`${review.rating} out of 5 stars`}>
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </p>
                  <p className="mt-1 text-xs text-[#456247]">Verified purchase</p>
                  {review.title && <h3 className="mt-2 font-medium">{review.title}</h3>}
                  {review.body && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#716763]">{review.body}</p>}
                  <p className="mt-3 text-xs text-[#8b817c]">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(review.created_at))}</p>
                </li>
              ))}
            </ul>
          )}

          {reviewUserId && reviewEligibility === "eligible" && reviewVariantId && <ReviewForm productId={product.id} storeId={product.store_id} userId={reviewUserId} variantId={reviewVariantId} />}
          {reviewUserId && reviewEligibility === "pending" && <p className="mt-5 text-sm text-[#716763]">Your review is waiting for store approval.</p>}
          {reviewUserId && reviewEligibility === "published" && <p className="mt-5 text-sm text-[#716763]">Thanks for reviewing this product.</p>}
          {reviewUserId && reviewEligibility === "rejected" && <p className="mt-5 text-sm text-[#716763]">Your review was not approved. Please contact the store if you have questions.</p>}
          {user && reviewUserId && reviewEligibility === null && <p className="mt-5 text-sm text-[#716763]">A review becomes available after a delivered order containing a printable version.</p>}
          {!user && <p className="mt-5 text-sm text-[#716763]"><Link href={`/auth/sign-in?next=${encodeURIComponent(`/products/${product.slug}`)}`} className="font-semibold text-[#a15e61] underline">Sign in</Link> to review after delivery.</p>}
        </div>
      </section>}
    </main>
  );
}
