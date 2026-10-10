import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "./checkout-form";

type CartForCheckout = {
  id: string;
  currency: string;
  cart_items: {
    id: string;
    quantity: number;
    product_variants: { price_minor: number; currency: string; products: { name: string } | null } | null;
  }[];
};

function price(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim() || "INR" }).format(value / 100);
}

export default async function CheckoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=%2Fcheckout");

  const { data: profile } = await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle();
  const { data: store } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (!profile || !store) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6"><p>Checkout is unavailable. Please return to the collection.</p></main>;
  }

  const { data: shippingFeeData, error: shippingFeeError } = await supabase.rpc("get_public_shipping_fee", { p_store_id: store.id });
  const shippingMinor = Number(shippingFeeData);
  if (shippingFeeError || !Number.isSafeInteger(shippingMinor) || shippingMinor < 0) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6"><p>Checkout pricing is unavailable. Please try again shortly.</p></main>;
  }

  const { data } = await supabase.from("carts").select("id, currency, cart_items(id, quantity, product_variants(price_minor, currency, products(name)))").eq("store_id", store.id).eq("user_id", profile.id).maybeSingle();
  const cart = data as CartForCheckout | null;
  const items = cart?.cart_items ?? [];
  const subtotal = items.reduce((sum, item) => sum + (item.product_variants?.price_minor ?? 0) * item.quantity, 0);
  const currency = cart?.currency ?? "INR";

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7] bg-[#fbf8f4]"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
        <Link href="/cart" className="text-sm text-[#716763] hover:text-[#a15e61]">Back to cart</Link>
      </div></header>
      <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Delivery details</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Checkout</h1>
        {items.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white p-10 text-center">
          <p>Your cart is empty.</p><Link href="/" className="mt-4 inline-block font-semibold text-[#a15e61]">Browse the collection</Link>
        </div> : <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <CheckoutForm storeId={store.id} />
          <aside className="h-fit rounded-2xl border border-[#eee5de] bg-white p-6">
            <h2 className="text-lg font-medium">Order summary</h2>
            <ul className="mt-4 divide-y divide-[#eee5de]">
              {items.map((item) => <li key={item.id} className="flex justify-between gap-4 py-3 text-sm"><span>{item.product_variants?.products?.name ?? "Product"} × {item.quantity}</span><span className="whitespace-nowrap">{price((item.product_variants?.price_minor ?? 0) * item.quantity, item.product_variants?.currency ?? cart?.currency ?? "INR")}</span></li>)}
            </ul>
            <div className="mt-2 space-y-3 border-t border-[#e8dfd7] pt-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-[#716763]">Subtotal</span><span>{price(subtotal, currency)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[#716763]">Flat shipping</span><span>{price(shippingMinor, currency)}</span></div>
              <div className="flex justify-between gap-4 border-t border-[#eee5de] pt-3 text-base"><strong>Total</strong><strong>{price(subtotal + shippingMinor, currency)}</strong></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#716763]">Shipping is included in the amount charged. Taxes are not currently added to this checkout. Choose cash on delivery or secure Razorpay test checkout.</p>
          </aside>
        </div>}
      </section>
    </main>
  );
}
