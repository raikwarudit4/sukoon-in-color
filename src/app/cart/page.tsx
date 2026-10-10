import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CartLineControls } from "./cart-line-controls";

type CartRow = {
  id: string;
  currency: string;
  cart_items: {
    id: string;
    quantity: number;
    product_variants: {
      id: string;
      sku: string;
      title: string;
      price_minor: number;
      currency: string;
      products: { name: string; slug: string } | null;
    } | null;
  }[];
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function CartPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/sign-in?next=%2Fcart");
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", "sukoon-in-color")
    .eq("status", "active")
    .maybeSingle();

  if (appUserError || storeError || !appUser || !store) {
    console.error("Could not load the cart owner or store.", appUserError ?? storeError);
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
        <div className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
          <h1 className="text-xl font-medium">Your cart is unavailable right now</h1>
          <p className="mt-2 text-sm leading-6 text-[#716763]">
            Please refresh the page or return to the collection.
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-[#a15e61]">
            Back to collection
          </Link>
        </div>
      </main>
    );
  }

  const { data: shippingFeeData, error: shippingFeeError } = await supabase.rpc("get_public_shipping_fee", { p_store_id: store.id });
  const shippingMinor = Number(shippingFeeData);
  const validShippingFee = !shippingFeeError && Number.isSafeInteger(shippingMinor) && shippingMinor >= 0;

  const { data, error } = await supabase
    .from("carts")
    .select(
      "id, currency, cart_items(id, quantity, product_variants(id, sku, title, price_minor, currency, products(name, slug)))",
    )
    .eq("store_id", store.id)
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load the customer's cart:", error.message);
  }

  const cart = (data ?? null) as CartRow | null;
  const items = cart?.cart_items ?? [];
  const subtotalMinor = items.reduce((total, item) => {
    return total + (item.product_variants?.price_minor ?? 0) * item.quantity;
  }, 0);
  const currency = cart?.currency ?? "INR";

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">
            SUKOON <span className="text-[#b56e70]">IN COLOR</span>
          </Link>
          <Link href="/" className="text-sm text-[#716763] hover:text-[#a15e61]">
            Continue shopping
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">
          Your bag
        </p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Shopping cart</h1>

        {error || !validShippingFee ? (
          <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-[#7c4548]">
            We could not load your cart. Please refresh and try again.
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 px-6 py-14 text-center">
            <h2 className="text-xl font-medium">Your cart is empty</h2>
            <p className="mt-2 text-sm text-[#716763]">Find something lovely in the collection.</p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white hover:bg-[#884d50]"
            >
              Browse collection
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
            <ul className="divide-y divide-[#e8dfd7] rounded-2xl border border-[#eee5de] bg-white px-5">
              {items.map((item) => {
                const variant = item.product_variants;
                const product = variant?.products;

                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-5 py-5">
                    <div className="min-w-48 flex-1">
                      {product ? (
                        <Link
                          href={`/products/${product.slug}`}
                          className="font-medium hover:text-[#a15e61]"
                        >
                          {product.name}
                        </Link>
                      ) : (
                        <p className="font-medium">Product unavailable</p>
                      )}
                      {variant && (
                        <p className="mt-1 text-sm text-[#716763]">
                          {variant.title} · {variant.sku}
                        </p>
                      )}
                      {variant && (
                        <p className="mt-2 text-sm font-semibold">
                          {formatPrice(variant.price_minor, variant.currency)}
                        </p>
                      )}
                    </div>
                    <CartLineControls
                      cartItemId={item.id}
                      storeId={store.id}
                      quantity={item.quantity}
                    />
                  </li>
                );
              })}
            </ul>

            <aside className="h-fit rounded-2xl border border-[#eee5de] bg-white p-6">
              <h2 className="text-lg font-medium">Order summary</h2>
              <div className="mt-5 flex justify-between border-t border-[#e8dfd7] pt-4 text-sm">
                <span className="text-[#716763]">Subtotal</span>
                <span className="font-semibold">{formatPrice(subtotalMinor, currency)}</span>
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-[#716763]">Flat shipping</span>
                <span>{formatPrice(shippingMinor, currency)}</span>
              </div>
              <div className="mt-3 flex justify-between border-t border-[#e8dfd7] pt-3 text-sm">
                <span className="font-medium">Estimated total</span>
                <span className="font-semibold">{formatPrice(subtotalMinor + shippingMinor, currency)}</span>
              </div>
              <p className="mt-4 text-xs leading-5 text-[#716763]">Taxes are not currently added to this checkout.</p>
              <Link href="/checkout" className="mt-6 block rounded-xl bg-[#a15e61] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#884d50]">
                Continue to checkout
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
