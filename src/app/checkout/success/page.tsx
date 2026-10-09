import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  if (!order) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const { data } = await supabase.from("orders").select("order_number, total_minor, currency, status").eq("id", order).maybeSingle();
  if (!data) notFound();
  const total = new Intl.NumberFormat("en-IN", { style: "currency", currency: data.currency.trim() || "INR" }).format(data.total_minor / 100);
  return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><section className="w-full max-w-lg rounded-3xl border border-[#eee5de] bg-white p-8 text-center shadow-sm sm:p-10">
    <p className="text-4xl text-[#a15e61]">✓</p><p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Order received</p>
    <h1 className="mt-2 text-3xl font-medium">Thank you for your order</h1><p className="mt-4 text-sm leading-6 text-[#716763]">Order <strong className="text-[#27221f]">{data.order_number}</strong> has been received and is pending processing. Pay {total} when it is delivered.</p>
    <Link href="/" className="mt-7 inline-flex rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white">Continue shopping</Link>
  </section></main>;
}
