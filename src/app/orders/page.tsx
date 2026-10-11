import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReturnRequestForm } from "./return-request-form";
import { ReturnEvidence } from "./return-evidence";

type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  shipping_minor: number;
  tax_minor: number;
  total_minor: number;
  created_at: string;
  delivered_at: string | null;
  shipments: {
    provider: string | null;
    carrier: string | null;
    tracking_number: string | null;
    status: string;
    provider_status: string | null;
    tracking_url: string | null;
    tracking_updated_at: string | null;
    shipment_events: { status: string; detail: string | null; occurred_at: string }[];
  }[];
  order_items: {
    id: string;
    product_name_snapshot: string;
    variant_name_snapshot: string | null;
    sku_snapshot: string;
    quantity: number;
    line_total_minor: number;
    sale_type_snapshot: "original" | "print";
  }[];
  returns: {
    id: string;
    status: string;
    reason: string;
    created_at: string;
    evidence: string[];
    return_items: { order_item_id: string; quantity: number }[];
  }[];
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Forders");

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><p>Your account profile could not be found.</p></main>;
  }

  const { data: store } = await supabase.from("stores").select("id")
    .eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  const { data: returnsEnabled, error: returnsSettingError } = store
    ? await supabase.rpc("get_store_returns_enabled", { p_store_id: store.id })
    : { data: false, error: new Error("Store unavailable") };
  const { data: supportEmail } = store
    ? await supabase.rpc("get_store_customer_support_email", { p_store_id: store.id })
    : { data: null };

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, currency, subtotal_minor, shipping_minor, tax_minor, total_minor, created_at, delivered_at, order_items(id, product_name_snapshot, variant_name_snapshot, sku_snapshot, quantity, line_total_minor, sale_type_snapshot), returns(id, status, reason, created_at, evidence, return_items(order_item_id, quantity)), shipments(provider, carrier, tracking_number, status, provider_status, tracking_url, tracking_updated_at, shipment_events(status, detail, occurred_at))")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
      <header className="border-b border-[#e8dfd7]"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
        <Link href="/" className="text-sm text-[#716763] hover:text-[#a15e61]">Continue shopping</Link>
      </div></header>
      <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Your account</p>
        <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Your orders</h1>
        {error ? <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-[#7c4548]">We could not load your orders. Please refresh and try again.</div>
          : orders.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#d9c9bf] bg-white/70 px-6 py-14 text-center">
            <h2 className="text-xl font-medium">No orders yet</h2><p className="mt-2 text-sm text-[#716763]">Your completed checkouts will appear here.</p>
            <Link href="/" className="mt-5 inline-flex rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white">Browse the collection</Link>
          </div> : <ul className="mt-8 space-y-5">
            {orders.map((order) => <li key={order.id} className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
              {(() => {
                const shipment = order.shipments.find((item) => item.provider === "shiprocket");
                return shipment && ["shipped", "delivered"].includes(order.status) ? <div className="mb-4 rounded-xl border border-[#eee5de] bg-[#fffdfa] p-4 text-sm">
                  <p className="font-semibold">Delivery tracking</p>
                  <p className="mt-1 capitalize text-[#716763]">{shipment.provider_status ?? shipment.status.replaceAll("_", " ")}</p>
                  {shipment.carrier && <p className="mt-1 text-xs text-[#716763]">Courier: {shipment.carrier}</p>}
                  {shipment.tracking_number && <p className="mt-1 text-xs text-[#716763]">Tracking number: {shipment.tracking_number}</p>}
                  {shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-[#a15e61] underline">Track parcel</a>}
                  {shipment.shipment_events.length > 0 && <ol className="mt-3 space-y-1 text-xs text-[#716763]">{[...shipment.shipment_events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 3).map((event, index) => <li key={`${event.occurred_at}-${index}`}>{event.detail ?? event.status} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</li>)}</ol>}
                </div> : null;
              })()}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eee5de] pb-4">
                <div><p className="text-xs uppercase tracking-[0.14em] text-[#a15e61]">{order.order_number}</p>
                  <p className="mt-1 text-sm text-[#716763]">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</p></div>
                <div className="text-right"><p className="font-semibold">{formatPrice(order.total_minor, order.currency)}</p>
                  <p className="mt-1 text-xs text-[#716763]">Items {formatPrice(order.subtotal_minor, order.currency)} · Shipping {formatPrice(order.shipping_minor, order.currency)}</p>
                  <p className="mt-1 text-xs capitalize text-[#716763]">{order.status.replaceAll("_", " ")}</p>
                  <Link href={`/orders/${order.id}/receipt`} className="mt-2 inline-block text-xs font-semibold text-[#a15e61] underline underline-offset-4">View receipt</Link></div>
              </div>
              <ul className="divide-y divide-[#f1eae5]">
                {order.order_items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span>{item.product_name_snapshot}{item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ""} <span className="text-[#716763]">× {item.quantity}</span></span>
                  <span className="whitespace-nowrap">{formatPrice(item.line_total_minor, order.currency)}</span>
                </li>)}
              </ul>
              {order.returns.map((returnRequest) => <div key={returnRequest.id} className="mt-4 rounded-xl border border-[#eee5de] bg-[#fffdfa] p-4 text-sm">
                <p className="font-semibold">Return request · <span className="capitalize">{returnRequest.status.replaceAll("_", " ")}</span></p>
                <p className="mt-1 text-xs text-[#716763]">{returnRequest.reason}</p>
                <ReturnEvidence paths={returnRequest.evidence ?? []} />
                <ul className="mt-2 space-y-1 text-xs text-[#716763]">{returnRequest.return_items.map((line) => {
                  const item = order.order_items.find((candidate) => candidate.id === line.order_item_id);
                  return <li key={line.order_item_id}>{item?.product_name_snapshot ?? "Order item"} × {line.quantity}</li>;
                })}</ul>
              </div>)}
              {(() => {
                const printableItems = order.order_items.filter((item) => item.sale_type_snapshot === "print");
                const deadline = order.delivered_at ? new Date(new Date(order.delivered_at).getTime() + 7 * 24 * 60 * 60 * 1000) : null;
                const inWindow = Boolean(deadline && Date.now() <= deadline.getTime());
                const hasReturn = order.returns.some((entry) => ["requested", "approved", "received", "rejected"].includes(entry.status));
                return returnsEnabled === true && !returnsSettingError && order.status === "delivered" && printableItems.length > 0 && deadline && !hasReturn && inWindow
                  ? <div className="mt-4"><p className="mb-2 text-xs text-[#716763]">Printable items can be returned by {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(deadline)} IST (within 7 days of delivery).</p><ReturnRequestForm
                orderId={order.id}
                userId={profile.id}
                items={printableItems.map((item) => ({
                  id: item.id,
                  name: item.product_name_snapshot + (item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ""),
                  quantity: item.quantity,
                }))}
              /></div>
                  : order.status === "delivered" && printableItems.length > 0 && deadline && !inWindow && !hasReturn
                    ? <p className="mt-4 text-xs text-[#716763]">The 7-day return period ended on {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(deadline)} IST.</p>
                    : order.status === "delivered" && printableItems.length === 0
                      ? <p className="mt-4 text-xs text-[#716763]">Returns are available only for delivered printable items, within 7 days of delivery. Original paintings are not returnable.</p>
                      : null;
              })()}
              {order.returns.some((entry) => entry.status === "rejected") && <div className="mt-4 rounded-xl border border-[#ead5d2] bg-[#fffdfa] p-4 text-sm">
                <p className="font-semibold">Your return request was rejected.</p>
                {typeof supportEmail === "string" && supportEmail
                  ? <a className="mt-2 inline-block font-semibold text-[#a15e61] underline" href={`mailto:${supportEmail}?${new URLSearchParams({ subject: `Return request for order ${order.order_number}`, body: `Hello, I have a question about the rejected return request for order ${order.order_number}.` }).toString()}`}>Email customer support</a>
                  : <p className="mt-2 text-xs text-[#716763]">Customer support email is not configured yet. Please contact the store directly.</p>}
              </div>}
              {returnsEnabled === false && order.status === "delivered" && <p className="mt-4 text-xs text-[#716763]">Return requests are currently unavailable.</p>}
            </li>)}
          </ul>}
      </section>
    </main>
  );
}
