import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReturnsFeatureForm } from "./returns-feature-form";

export default async function ReturnsSettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Fsettings%2Freturns");

  const { data: store, error: storeError } = await supabase.from("stores").select("id")
    .eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6 text-[#27221f]"><p>Store settings are unavailable.</p></main>;

  const { data: isMember, error: membershipError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (membershipError || isMember !== true) return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]">
      <section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
        <h1 className="text-xl font-medium">Store access required</h1>
        <p className="mt-2 text-sm text-[#716763]">This account cannot change store settings.</p>
        <Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
      </section>
    </main>
  );

  const { data: enabled, error } = await supabase.rpc("get_store_returns_enabled", { p_store_id: store.id });
  const { data: supportEmail, error: supportEmailError } = await supabase.rpc("get_store_customer_support_email", { p_store_id: store.id });
  if (error || supportEmailError || typeof enabled !== "boolean" || (supportEmail !== null && typeof supportEmail !== "string")) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6 text-[#27221f]"><p>Returns settings could not be loaded. Apply migrations 061–062, then refresh.</p></main>;

  return <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
    <header className="border-b border-[#e8dfd7]"><div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
      <nav className="flex gap-4 text-sm"><Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link><Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping</Link></nav>
    </div></header>
    <section className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p>
      <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Return requests</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#716763]">Choose whether customers can request returns for delivered orders. Turning this off hides the request form and blocks new submissions; existing requests remain available in Orders.</p>
      <ReturnsFeatureForm storeId={store.id} initiallyEnabled={enabled} initialSupportEmail={supportEmail ?? ""} />
    </section>
  </main>;
}
