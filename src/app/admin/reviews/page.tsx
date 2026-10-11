import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewActions } from "./review-actions";

type PendingReview = {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
};

export default async function StoreReviewsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Freviews");

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-10">Store reviews are unavailable.</main>;

  const { data: isMember, error: memberError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (memberError || isMember !== true) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
        <section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
          <h1 className="text-xl font-medium">Store access required</h1>
          <p className="mt-2 text-sm text-[#716763]">This account cannot moderate store reviews.</p>
          <Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
        </section>
      </main>
    );
  }

  const { data, error } = await supabase.from("reviews")
    .select("id, product_id, rating, title, body, created_at")
    .eq("store_id", store.id).eq("status", "pending")
    .order("created_at", { ascending: true }).limit(100);
  const reviews = (data ?? []) as PendingReview[];
  const productIds = [...new Set(reviews.map((review) => review.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, slug").eq("store_id", store.id).in("id", productIds)
    : { data: [] };
  const productNames = new Map((products ?? []).map((product) => [product.id, product.name]));

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
          <nav className="flex items-center gap-4 text-sm"><Link href="/admin" className="text-[#716763] hover:text-[#a15e61]">Dashboard</Link><Link href="/admin/products" className="text-[#716763] hover:text-[#a15e61]">Products</Link><Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link><Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping</Link></nav>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Review moderation</h1>
        <p className="mt-3 text-sm text-[#716763]">Only approved reviews appear on product pages. Reviews are limited to customers with delivered orders.</p>
        {error ? (
          <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-[#7c4548]">Could not load reviews. Apply migration 057, then refresh.</div>
        ) : reviews.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 p-12 text-center text-sm text-[#716763]">No reviews are waiting for approval.</div>
        ) : (
          <ul className="mt-8 space-y-4">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a15e61]">{productNames.get(review.product_id) ?? "Product"}</p>
                    <p className="mt-2 text-sm tracking-wider text-[#a15e61]" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                    {review.title && <h2 className="mt-2 font-medium">{review.title}</h2>}
                    {review.body && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#716763]">{review.body}</p>}
                    <p className="mt-3 text-xs text-[#8b817c]">Submitted {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.created_at))}</p>
                  </div>
                  <ReviewActions reviewId={review.id} storeId={store.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
