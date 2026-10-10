import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrderActions } from "./order-actions";

type StoreOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  shipping_minor: number;
  tax_minor: number;
  total_minor: number;
  created_at: string;
  order_items: {
    id: string;
    product_name_snapshot: string;
    variant_name_snapshot: string | null;
    sku_snapshot: string;
    quantity: number;
    line_total_minor: number;
  }[];
  order_addresses: {
    kind: string;
    recipient_name: string;
    phone: string | null;
    address_line1: string;
    address_line2: string | null;
    locality: string;
    city: string;
    region: string;
    postal_code: string;
    country_code: string;
  }[];
  inventory_reservations: { status: string; expires_at: string }[];
  payments: { provider: string; status: string }[];
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim() || "INR", maximumFractionDigits: 2 }).format(amountMinor / 100);
}

export default async function StoreOrdersPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Forders");

  const { data: store, error: storeError } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-10">Store orders are unavailable.</main>;

  const { data: member, error: memberError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (memberError || member !== true) return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><div className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
      <h1 className="text-xl font-medium">Store access required</h1><p className="mt-2 text-sm text-[#716763]">This account is not an active member of the store.</p><Link href="/" className="mt-5 inline-block text-sm font-semibold text-[#a15e61]">Back to shop</Link>
    </div></main>
  );

  const { data, error } = await supabase.from("orders")
    .select("id, order_number, status, currency, subtotal_minor, shipping_minor, tax_minor, total_minor, created_at, order_items(id, product_name_snapshot, variant_name_snapshot, sku_snapshot, quantity, line_total_minor), order_addresses(kind, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, country_code), inventory_reservations(status, expires_at), payments(provider, status)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as StoreOrder[];

  return <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
    <header className="border-b border-[#e8dfd7]"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/admin/products" className="text-[#716763] hover:text-[#a15e61]">Products</Link>
        <Link href="/admin/reviews" className="text-[#716763] hover:text-[#a15e61]">Reviews</Link>
        <Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping fee</Link>
        <Link href="/orders" className="hidden text-[#716763] hover:text-[#a15e61] sm:inline">Customer order history</Link>
      </nav>
    </div></header>
    <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p><div className="mt-2 flex flex-wrap items-baseline justify-between gap-3"><h1 className="text-3xl font-medium sm:text-4xl">Orders</h1><Link href="/admin/reviews" className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">Review moderation</Link></div>
      {error ? <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-[#7c4548]">Could not load store orders. Apply the latest database migration, then refresh.</div>
        : orders.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 p-12 text-center text-sm text-[#716763]">No orders yet.</div>
          : <ul className="mt-8 space-y-5">{orders.map((order) => {
            const shipping = order.order_addresses.find((address) => address.kind === "shipping");
            const reserved = order.inventory_reservations.filter((reservation) => reservation.status === "reserved");
            const canExpire = ["pending", "confirmed", "processing"].includes(order.status)
              && reserved.length > 0
              && reserved.every((reservation) => new Date(reservation.expires_at).getTime() <= Date.now());
            const payment = order.payments[0];
            return <li key={order.id} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eee5de] pb-4">
                <div><p className="text-xs uppercase tracking-[0.14em] text-[#a15e61]">{order.order_number}</p>
                  <p className="mt-1 text-sm text-[#716763]">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</p>
                  {shipping && <p className="mt-3 text-sm leading-6"><strong>{shipping.recipient_name}</strong>{shipping.phone ? ` · ${shipping.phone}` : ""}<br />{shipping.address_line1}{shipping.address_line2 ? `, ${shipping.address_line2}` : ""}, {shipping.locality}, {shipping.city}, {shipping.region} {shipping.postal_code}, {shipping.country_code}</p>}
                </div>
                <div className="text-right"><p className="font-semibold">{formatPrice(order.total_minor, order.currency)}</p><p className="mt-1 text-xs text-[#716763]">Items {formatPrice(order.subtotal_minor, order.currency)} · Shipping {formatPrice(order.shipping_minor, order.currency)}</p><p className="mt-1 text-xs capitalize text-[#716763]">{order.status.replaceAll("_", " ")} · {payment?.provider === "razorpay" ? `Razorpay · ${payment.status}` : "Cash on delivery"}</p></div>
              </div>
              <ul className="divide-y divide-[#f1eae5]">{order.order_items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>{item.product_name_snapshot}{item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ""} <span className="text-[#716763]">× {item.quantity} · {item.sku_snapshot}</span></span><span className="whitespace-nowrap">{formatPrice(item.line_total_minor, order.currency)}</span>
              </li>)}</ul>
              <div className="mt-4 border-t border-[#eee5de] pt-4"><OrderActions storeId={store.id} orderId={order.id} status={order.status} canExpire={canExpire} paymentProvider={payment?.provider ?? "cash_on_delivery"} paymentStatus={payment?.status ?? "pending"} /></div>
            </li>;
          })}</ul>}
    </section>
  </main>;
}
