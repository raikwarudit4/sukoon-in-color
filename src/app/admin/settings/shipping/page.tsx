import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShippingFeeForm } from "./shipping-fee-form";

export default async function ShippingSettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Fsettings%2Fshipping");

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", "sukoon-in-color")
    .eq("status", "active")
    .maybeSingle();

  if (storeError || !store) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6 text-[#27221f]"><p>Store settings are unavailable.</p></main>;
  }

  const { data: isMember, error: membershipError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (membershipError || isMember !== true) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
        <section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
          <h1 className="text-xl font-medium">Store access required</h1>
          <p className="mt-2 text-sm text-[#716763]">This account cannot change store settings.</p>
          <Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
        </section>
      </main>
    );
  }

  const { data: feeData, error: feeError } = await supabase.rpc("get_public_shipping_fee", { p_store_id: store.id });
  const feeMinor = Number(feeData);
  if (feeError || !Number.isSafeInteger(feeMinor) || feeMinor < 0) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6 text-[#27221f]"><p>Shipping settings could not be loaded. Apply migration 056, then refresh.</p></main>;
  }

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
          <nav className="flex items-center gap-4 text-sm"><Link href="/admin" className="text-[#716763] hover:text-[#a15e61]">Dashboard</Link><Link href="/admin/products" className="text-[#716763] hover:text-[#a15e61]">Products</Link><Link href="/admin/reviews" className="text-[#716763] hover:text-[#a15e61]">Reviews</Link><Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link><Link href="/admin/settings/returns" className="text-[#716763] hover:text-[#a15e61]">Returns</Link></nav>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Shipping settings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#716763]">Set one flat shipping fee per order. The saved amount is included in both COD and Razorpay totals, and orders keep a snapshot of the fee at checkout.</p>
        <ShippingFeeForm storeId={store.id} initialFeeMinor={feeMinor} />
      </section>
    </main>
  );
}
