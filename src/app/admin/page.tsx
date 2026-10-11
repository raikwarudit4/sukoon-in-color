import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SalesDay = { date: string; amount_minor: number };
type RankedProduct = { name: string; units_sold: number; sales_minor: number };
type EngagementProduct = { name: string; views: number; wishlists: number };
type RecentOrder = { id: string; order_number: string; status: string; total_minor: number; currency: string; created_at: string; payment_status: string | null };
type CountRow = { status: string; count: number };
type MovementRow = { reason: string; units: number };
type ShippingTimings = { dispatched_count: number; delivered_count: number; avg_dispatch_hours: number; avg_transit_hours: number };
type LowStockVariant = { product_id: string; product_name: string; variant_id: string; sku: string; variant_title: string; available: number; reorder_level: number };
type DashboardMetrics = {
  currency: string;
  total_orders: number;
  open_orders: number;
  shipped_orders: number;
  delivered_orders: number;
  paid_sales_minor: number;
  sales_30d_minor: number;
  customers: number;
  repeat_customers: number;
  average_order_value_minor: number;
  active_products: number;
  draft_products: number;
  out_of_stock_variants: number;
  low_stock_variant_count: number;
  low_stock_variants: LowStockVariant[];
  pending_reviews: number;
  requested_returns: number;
  return_statuses: CountRow[];
  refunded_minor: number;
  payment_outcomes: CountRow[];
  active_carts_with_items: number;
  inventory_fulfilled_units_30d: number;
  inventory_movements_30d: MovementRow[];
  shipping_timings: ShippingTimings;
  product_conversion_estimate: number;
  sales_last_7_days: SalesDay[];
  top_products: RankedProduct[];
  product_engagement: EngagementProduct[];
  recent_orders: RecentOrder[];
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.trim() || "INR", maximumFractionDigits: 0 }).format(Number(amountMinor || 0) / 100);
}

function MetricCard({ label, value, detail, href }: { label: string; value: string | number; detail?: string; href?: string }) {
  const content = <div className="h-full rounded-2xl border border-[#eee5de] bg-white p-5 transition hover:border-[#d9c9bf]">
    <p className="text-sm text-[#716763]">{label}</p><p className="mt-2 text-2xl font-semibold sm:text-3xl">{value}</p>{detail && <p className="mt-2 text-xs text-[#8b817c]">{detail}</p>}
  </div>;
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

export default async function StoreDashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin");

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id, name, default_currency").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-10">Store dashboard is unavailable.</main>;

  const { data: member, error: memberError } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (memberError || member !== true) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
    <h1 className="text-xl font-medium">Store access required</h1><p className="mt-2 text-sm text-[#716763]">This account cannot access store insights.</p><Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
  </section></main>;

  const { data, error } = await supabase.rpc("get_store_dashboard_metrics", { target_store: store.id });
  const metrics = data as DashboardMetrics | null;
  const currency = metrics?.currency ?? store.default_currency ?? "INR";
  const salesDays = metrics?.sales_last_7_days ?? [];
  const maxDay = Math.max(1, ...salesDays.map((day) => Number(day.amount_minor)));
  const formatter = new Intl.DateTimeFormat("en-IN", { weekday: "short" });

  return <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
    <header className="border-b border-[#e8dfd7] bg-[#fbf8f4]"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 lg:px-10">
      <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
      <nav aria-label="Store management" className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link><Link href="/admin/products" className="text-[#716763] hover:text-[#a15e61]">Products</Link><Link href="/admin/reviews" className="text-[#716763] hover:text-[#a15e61]">Reviews</Link><Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping</Link><Link href="/admin/settings/returns" className="text-[#716763] hover:text-[#a15e61]">Returns</Link>
      </nav>
    </div></header>
    <section className="mx-auto max-w-7xl px-6 py-9 sm:py-12 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Store management</p><h1 className="mt-2 text-3xl font-medium sm:text-4xl">{store.name} dashboard</h1>
      <p className="mt-2 text-sm text-[#716763]">Sales reflect captured payments. The dashboard refreshes when you reload this page.</p>

      {error || !metrics ? <div className="mt-8 rounded-2xl border border-[#ead5d2] bg-white p-6 text-sm text-[#7c4548]">Could not load store insights. Apply migration 067, then refresh.</div> : <>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Captured sales · all time" value={money(metrics.paid_sales_minor, currency)} detail={`${money(metrics.sales_30d_minor, currency)} in the last 30 days`} />
          <MetricCard label="Orders to manage" value={metrics.open_orders} detail={`${metrics.total_orders} total orders`} href="/admin/orders" />
          <MetricCard label="Delivered orders" value={metrics.delivered_orders} detail={`${metrics.shipped_orders} currently shipped`} href="/admin/orders" />
          <MetricCard label="Customers" value={metrics.customers} detail="Customers with at least one order" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active products" value={metrics.active_products} detail={`${metrics.draft_products} drafts`} href="/admin/products" />
          <MetricCard label="Out-of-stock variants" value={metrics.out_of_stock_variants} detail="Active variants with no available stock" href="/admin/products" />
          <MetricCard label="Variants needing reorder" value={metrics.low_stock_variant_count} detail="At or below configured reorder level" href="/admin/products" />
          <MetricCard label="Reviews to approve" value={metrics.pending_reviews} href="/admin/reviews" />
          <MetricCard label="Return requests" value={metrics.requested_returns} href="/admin/settings/returns" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Average order value" value={money(metrics.average_order_value_minor, currency)} detail="Captured payments · all time" />
          <MetricCard label="Repeat customers" value={metrics.repeat_customers} detail={`${metrics.customers ? Math.round(metrics.repeat_customers / metrics.customers * 100) : 0}% of customers ordered more than once`} />
          <MetricCard label="Active carts with items" value={metrics.active_carts_with_items} detail="May include shoppers still browsing; abandonment is not confirmed" />
          <MetricCard label="Product conversion estimate" value={`${Number(metrics.product_conversion_estimate || 0).toFixed(1)}%`} detail="Captured product orders ÷ recorded product views; directional estimate" />
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="sales-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Recent performance</p><h2 id="sales-heading" className="mt-1 text-xl font-medium">Captured sales · last 7 days</h2></div><strong className="text-sm">{money(metrics.sales_30d_minor, currency)} <span className="font-normal text-[#716763]">last 30 days</span></strong></div>
            <div className="mt-7 grid h-48 grid-cols-7 items-end gap-2 sm:gap-4" role="img" aria-label="Daily captured sales in the last seven days">
              {salesDays.map((day) => {
                const height = Math.max(4, Number(day.amount_minor) / maxDay * 100);
                return <div key={day.date} className="flex h-full flex-col items-center justify-end gap-2"><span className="text-center text-[10px] text-[#716763] sm:text-xs">{Number(day.amount_minor) ? money(Number(day.amount_minor), currency) : "—"}</span><div className="w-full rounded-t-lg bg-[#a15e61]" style={{ height: `${height}%` }} /><span className="text-xs text-[#716763]">{formatter.format(new Date(`${day.date}T12:00:00`))}</span></div>;
              })}
            </div>
          </section>
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="top-products-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Best sellers</p><h2 id="top-products-heading" className="mt-1 text-xl font-medium">Top products by paid sales</h2>
            {(metrics.top_products ?? []).length === 0 ? <p className="mt-6 text-sm text-[#716763]">No captured product sales yet.</p> : <ol className="mt-4 divide-y divide-[#eee5de]">{metrics.top_products.map((product, index) => <li key={`${product.name}-${index}`} className="flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fbf3ef] text-sm font-semibold text-[#a15e61]">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-[#716763]">{product.units_sold} sold</p></div></div><strong className="whitespace-nowrap text-sm">{money(product.sales_minor, currency)}</strong></li>)}</ol>}
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="engagement-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Product engagement</p><h2 id="engagement-heading" className="mt-1 text-xl font-medium">Most viewed and wishlisted</h2>
            {(metrics.product_engagement ?? []).length === 0 ? <p className="mt-6 text-sm text-[#716763]">No product engagement recorded yet.</p> : <ul className="mt-4 divide-y divide-[#eee5de]">{metrics.product_engagement.map((product, index) => <li key={`${product.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="font-medium">{product.name}</span><span className="text-sm text-[#716763]">{product.views} views · {product.wishlists} wishlists</span></li>)}</ul>}
          </section>
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="recent-orders-heading">
            <div className="flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Latest activity</p><h2 id="recent-orders-heading" className="mt-1 text-xl font-medium">Recent orders</h2></div><Link href="/admin/orders" className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">Manage orders</Link></div>
            {(metrics.recent_orders ?? []).length === 0 ? <p className="mt-6 text-sm text-[#716763]">No orders yet.</p> : <ul className="mt-4 divide-y divide-[#eee5de]">{metrics.recent_orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{order.order_number}</p><p className="mt-1 text-xs capitalize text-[#716763]">{order.status.replaceAll("_", " ")} · {order.payment_status ?? "payment pending"}</p></div><div className="text-right"><strong className="text-sm">{money(order.total_minor, order.currency)}</strong><p className="mt-1 text-xs text-[#716763]">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.created_at))}</p></div></li>)}</ul>}
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="low-stock-heading">
            <div className="flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Inventory alerts</p><h2 id="low-stock-heading" className="mt-1 text-xl font-medium">Reorder needed</h2></div><Link href="/admin/products" className="text-sm font-semibold text-[#a15e61] underline underline-offset-4">Manage</Link></div>
            {(metrics.low_stock_variants ?? []).length === 0 ? <p className="mt-4 text-sm text-[#716763]">No variants have reached their configured reorder level.</p> : <ul className="mt-3 divide-y divide-[#eee5de]">{metrics.low_stock_variants.map((variant) => <li key={variant.variant_id} className="py-3"><Link href={`/admin/products/${variant.product_id}`} className="font-medium text-[#27221f] hover:text-[#a15e61]">{variant.product_name}</Link><p className="mt-1 text-xs text-[#716763]">{variant.sku} · {variant.variant_title}</p><p className="mt-1 text-sm text-[#9a4c25]">{variant.available} available · reorder at {variant.reorder_level}</p></li>)}</ul>}
          </section>
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="inventory-insights-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Inventory</p><h2 id="inventory-insights-heading" className="mt-1 text-xl font-medium">Stock movement · last 30 days</h2>
            <p className="mt-4 text-sm text-[#716763]">Fulfilled units: <strong className="text-[#27221f]">{metrics.inventory_fulfilled_units_30d}</strong></p>
            {(metrics.inventory_movements_30d ?? []).length === 0 ? <p className="mt-3 text-sm text-[#716763]">No inventory movements recorded.</p> : <ul className="mt-3 divide-y divide-[#eee5de]">{metrics.inventory_movements_30d.map((movement) => <li key={movement.reason} className="flex justify-between gap-3 py-2 text-sm"><span className="capitalize text-[#716763]">{movement.reason.replaceAll("_", " ")}</span><strong>{movement.units > 0 ? "+" : ""}{movement.units}</strong></li>)}</ul>}
          </section>
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="payment-insights-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Payments · last 30 days</p><h2 id="payment-insights-heading" className="mt-1 text-xl font-medium">Payment outcomes</h2>
            {(metrics.payment_outcomes ?? []).length === 0 ? <p className="mt-4 text-sm text-[#716763]">No payment records in this period.</p> : <ul className="mt-3 divide-y divide-[#eee5de]">{metrics.payment_outcomes.map((row) => <li key={row.status} className="flex justify-between gap-3 py-2 text-sm"><span className="capitalize text-[#716763]">{row.status.replaceAll("_", " ")}</span><strong>{row.count}</strong></li>)}</ul>}
            <p className="mt-4 text-sm text-[#716763]">Refunded: <strong className="text-[#27221f]">{money(metrics.refunded_minor, currency)}</strong> across all time</p>
          </section>
          <section className="rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="shipping-insights-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Fulfillment</p><h2 id="shipping-insights-heading" className="mt-1 text-xl font-medium">Shipping speed</h2>
            <p className="mt-4 text-sm text-[#716763]">Average dispatch: <strong className="text-[#27221f]">{Number(metrics.shipping_timings?.avg_dispatch_hours || 0).toFixed(1)} hours</strong></p>
            <p className="mt-2 text-sm text-[#716763]">Average transit: <strong className="text-[#27221f]">{Number(metrics.shipping_timings?.avg_transit_hours || 0).toFixed(1)} hours</strong></p>
            <p className="mt-3 text-xs text-[#8b817c]">Based on {metrics.shipping_timings?.dispatched_count ?? 0} dispatched and {metrics.shipping_timings?.delivered_count ?? 0} delivered shipments with timestamps.</p>
          </section>
        </div>
        <section className="mt-5 rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6" aria-labelledby="returns-insights-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a15e61]">Returns</p><h2 id="returns-insights-heading" className="mt-1 text-xl font-medium">Return outcomes</h2>
          {(metrics.return_statuses ?? []).length === 0 ? <p className="mt-4 text-sm text-[#716763]">No return requests recorded.</p> : <div className="mt-4 flex flex-wrap gap-3">{metrics.return_statuses.map((row) => <span key={row.status} className="rounded-xl bg-[#fbf8f4] px-4 py-2 text-sm capitalize">{row.status.replaceAll("_", " ")} <strong className="ml-1">{row.count}</strong></span>)}</div>}
        </section>
      </>}
    </section>
  </main>;
}
