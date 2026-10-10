import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountNav } from "@/components/account-nav";
import { createClient } from "@/lib/supabase/server";
import { AddToCart } from "./add-to-cart";
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
      "id, store_id, name, slug, description, stores!inner(slug), product_media(id, url, alt_text, sort_order), product_variants(id, title, sku, price_minor, currency)",
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
  const [{ data: { user } }, { data: reviewData, error: reviewError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("reviews").select("id, rating, title, body, created_at")
      .eq("product_id", product.id).eq("status", "published").order("created_at", { ascending: false }),
  ]);
  const reviews = (reviewData ?? []) as PublicReview[];
  if (reviewError) console.error("Could not load product reviews:", reviewError.message);

  let reviewUserId: string | null = null;
  let reviewEligibility: "eligible" | "pending" | "published" | "rejected" | null = null;
  if (user) {
    const { data: profile } = await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (profile) {
      reviewUserId = profile.id;
      const [{ data: existingReview }, { data: canReview }] = await Promise.all([
        supabase.from("reviews").select("status").eq("product_id", product.id).eq("user_id", profile.id).maybeSingle(),
        supabase.rpc("has_delivered_product_purchase", { p_product_id: product.id }),
      ]);
      reviewEligibility = existingReview?.status === "pending" || existingReview?.status === "published" || existingReview?.status === "rejected"
        ? existingReview.status
        : canReview === true ? "eligible" : null;
    }
  }
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
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
          {product.description && (
            <p className="mt-6 whitespace-pre-line text-base leading-7 text-[#716763]">
              {product.description}
            </p>
          )}

          <AddToCart
            storeId={product.store_id}
            variants={variants}
            returnPath={`/products/${product.slug}`}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10" aria-labelledby="reviews-heading">
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

          {reviewUserId && reviewEligibility === "eligible" && (
            <ReviewForm productId={product.id} storeId={product.store_id} userId={reviewUserId} />
          )}
          {reviewUserId && reviewEligibility === "pending" && <p className="mt-5 text-sm text-[#716763]">Your review is waiting for store approval.</p>}
          {reviewUserId && reviewEligibility === "published" && <p className="mt-5 text-sm text-[#716763]">Thanks for reviewing this product.</p>}
          {reviewUserId && reviewEligibility === "rejected" && <p className="mt-5 text-sm text-[#716763]">Your review was not approved. Please contact the store if you have questions.</p>}
          {user && reviewUserId && reviewEligibility === null && <p className="mt-5 text-sm text-[#716763]">A review becomes available after your order is delivered.</p>}
          {!user && <p className="mt-5 text-sm text-[#716763]"><Link href={`/auth/sign-in?next=${encodeURIComponent(`/products/${product.slug}`)}`} className="font-semibold text-[#a15e61] underline">Sign in</Link> to review after delivery.</p>}
        </div>
      </section>
    </main>
  );
}
