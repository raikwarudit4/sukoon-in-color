import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintReceiptButton } from "./print-receipt-button";

type ReceiptOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_minor: number;
  created_at: string;
  order_items: {
    product_name_snapshot: string;
    variant_name_snapshot: string | null;
    sku_snapshot: string;
    quantity: number;
    unit_price_minor: number;
    tax_minor: number;
    discount_minor: number;
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
};

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.trim() || "INR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function OrderReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/orders/${id}/receipt`)}`);

  const { data: profile } = await supabase.from("users").select("id")
    .eq("auth_user_id", user.id).maybeSingle();
  if (!profile) notFound();

  const { data, error } = await supabase.from("orders")
    .select("id, order_number, status, currency, subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor, created_at, order_items(product_name_snapshot, variant_name_snapshot, sku_snapshot, quantity, unit_price_minor, tax_minor, discount_minor, line_total_minor), order_addresses(kind, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, country_code)")
    .eq("id", id).eq("user_id", profile.id).maybeSingle();
  if (error || !data) notFound();
  const order = data as ReceiptOrder;

  const { data: paymentData } = await supabase.rpc("get_customer_payment_summary", { p_order_id: order.id });
  const payment = Array.isArray(paymentData) ? paymentData[0] : paymentData;
  const shippingAddress = order.order_addresses.find((address) => address.kind === "shipping");
  const billingAddress = order.order_addresses.find((address) => address.kind === "billing");
  const paymentLabel = payment?.provider === "razorpay"
    ? payment.status === "captured" ? "Online payment · captured" : `Online payment · ${payment.status}`
    : payment?.status === "captured" ? "Cash on delivery · received" : "Cash on delivery";

  return <main className="min-h-screen bg-[#fbf8f4] px-4 py-8 text-[#27221f] print:bg-white print:p-0">
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href="/orders" className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">Back to orders</Link>
        <PrintReceiptButton />
      </div>
      <article className="rounded-2xl border border-[#eee5de] bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap justify-between gap-5 border-b border-[#eee5de] pb-6">
          <div><p className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Order receipt</p>
            <h1 className="mt-1 text-3xl font-medium">{order.order_number}</h1>
          </div>
          <dl className="space-y-1 text-sm sm:text-right">
            <div><dt className="inline text-[#716763]">Date: </dt><dd className="inline">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</dd></div>
            <div><dt className="inline text-[#716763]">Order status: </dt><dd className="inline capitalize">{order.status.replaceAll("_", " ")}</dd></div>
            <div><dt className="inline text-[#716763]">Payment: </dt><dd className="inline capitalize">{paymentLabel}</dd></div>
          </dl>
        </header>

        <div className="grid gap-5 border-b border-[#eee5de] py-6 sm:grid-cols-2">
          {[shippingAddress, billingAddress].map((address, index) => address && <section key={address.kind}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a15e61]">{index === 0 && address.kind === "shipping" ? "Ship to" : "Billing address"}</h2>
            <p className="mt-2 text-sm leading-6"><strong>{address.recipient_name}</strong>{address.phone ? <><br />{address.phone}</> : null}<br />
              {address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}<br />
              {address.locality}, {address.city}, {address.region} {address.postal_code}<br />{address.country_code}
            </p>
          </section>)}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-[#eee5de] text-xs uppercase tracking-wide text-[#716763]"><th className="py-3 pr-3">Item</th><th className="py-3 px-2 text-right">Qty</th><th className="py-3 px-2 text-right">Unit price</th><th className="py-3 pl-2 text-right">Line total</th></tr></thead>
            <tbody>{order.order_items.map((item, index) => <tr key={`${item.sku_snapshot}-${index}`} className="border-b border-[#f1eae5] align-top">
              <td className="py-3 pr-3"><p className="font-medium">{item.product_name_snapshot}{item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ""}</p><p className="mt-1 text-xs text-[#716763]">SKU {item.sku_snapshot}</p></td>
              <td className="py-3 px-2 text-right">{item.quantity}</td>
              <td className="py-3 px-2 text-right">{formatPrice(item.unit_price_minor, order.currency)}</td>
              <td className="py-3 pl-2 text-right">{formatPrice(item.line_total_minor, order.currency)}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <dl className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-5"><dt className="text-[#716763]">Items subtotal</dt><dd>{formatPrice(order.subtotal_minor, order.currency)}</dd></div>
          {order.discount_minor > 0 && <div className="flex justify-between gap-5"><dt className="text-[#716763]">Discount</dt><dd>−{formatPrice(order.discount_minor, order.currency)}</dd></div>}
          <div className="flex justify-between gap-5"><dt className="text-[#716763]">Tax</dt><dd>{formatPrice(order.tax_minor, order.currency)}</dd></div>
          <div className="flex justify-between gap-5"><dt className="text-[#716763]">Shipping</dt><dd>{formatPrice(order.shipping_minor, order.currency)}</dd></div>
          <div className="flex justify-between gap-5 border-t border-[#e8dfd7] pt-3 text-base font-semibold"><dt>Total</dt><dd>{formatPrice(order.total_minor, order.currency)}</dd></div>
        </dl>
        <p className="mt-8 border-t border-[#eee5de] pt-4 text-xs leading-5 text-[#716763]">This is an order receipt for your records. It is not a tax invoice.</p>
      </article>
    </div>
  </main>;
}
