create or replace function public.get_store_dashboard_metrics(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    if target_store is null or not public.is_store_member(target_store) then
        raise exception 'Active store membership is required to view store insights.';
    end if;

    select jsonb_build_object(
        'currency', s.default_currency,
        'total_orders', (select count(*) from public.orders o where o.store_id = target_store),
        'open_orders', (select count(*) from public.orders o where o.store_id = target_store and o.status in ('pending', 'confirmed', 'processing')),
        'shipped_orders', (select count(*) from public.orders o where o.store_id = target_store and o.status = 'shipped'),
        'delivered_orders', (select count(*) from public.orders o where o.store_id = target_store and o.status = 'delivered'),
        'paid_sales_minor', (select coalesce(sum(p.amount_minor), 0) from public.payments p where p.store_id = target_store and p.status = 'captured'),
        'sales_30d_minor', (
            select coalesce(sum(p.amount_minor), 0)
            from public.payments p join public.orders o on o.store_id = p.store_id and o.id = p.order_id
            where p.store_id = target_store and p.status = 'captured' and o.created_at >= now() - interval '30 days'
        ),
        'customers', (select count(distinct o.user_id) from public.orders o where o.store_id = target_store and o.user_id is not null),
        'repeat_customers', (
            select count(*) from (
                select o.user_id from public.orders o
                where o.store_id = target_store and o.user_id is not null
                group by o.user_id having count(*) > 1
            ) repeat_buyers
        ),
        'average_order_value_minor', (
            select coalesce(round(sum(p.amount_minor)::numeric / nullif(count(distinct p.order_id), 0)), 0)::bigint
            from public.payments p where p.store_id = target_store and p.status = 'captured'
        ),
        'active_products', (select count(*) from public.products p where p.store_id = target_store and p.status = 'active'),
        'draft_products', (select count(*) from public.products p where p.store_id = target_store and p.status = 'draft'),
        'out_of_stock_variants', (
            select count(*) from (
                select v.id
                from public.product_variants v
                join public.products p on p.store_id = v.store_id and p.id = v.product_id
                left join public.inventory_levels il on il.store_id = v.store_id and il.variant_id = v.id
                where v.store_id = target_store and v.is_active and p.status = 'active'
                group by v.id
                having coalesce(sum(il.on_hand - il.reserved), 0) <= 0
            ) stock
        ),
        'pending_reviews', (select count(*) from public.reviews r where r.store_id = target_store and r.status = 'pending'),
        'requested_returns', (select count(*) from public.returns r where r.store_id = target_store and r.status = 'requested'),
        'return_statuses', (
            select coalesce(jsonb_agg(jsonb_build_object('status', states.status, 'count', states.count) order by states.status), '[]'::jsonb)
            from (select r.status, count(*)::bigint as count from public.returns r where r.store_id = target_store group by r.status) states
        ),
        'refunded_minor', (select coalesce(sum(p.amount_minor), 0) from public.payments p where p.store_id = target_store and p.status = 'refunded'),
        'payment_outcomes', (
            select coalesce(jsonb_agg(jsonb_build_object('status', states.status, 'count', states.count) order by states.status), '[]'::jsonb)
            from (select p.status, count(*)::bigint as count from public.payments p where p.store_id = target_store and p.created_at >= now() - interval '30 days' group by p.status) states
        ),
        'active_carts_with_items', (
            select count(distinct c.id) from public.carts c
            join public.cart_items ci on ci.store_id = c.store_id and ci.cart_id = c.id
            where c.store_id = target_store and (c.expires_at is null or c.expires_at > now())
        ),
        'inventory_fulfilled_units_30d', (
            select coalesce(-sum(m.quantity_delta), 0)::bigint from public.inventory_movements m
            where m.store_id = target_store and m.reason = 'order_fulfilled' and m.quantity_delta < 0
              and m.created_at >= now() - interval '30 days'
        ),
        'inventory_movements_30d', (
            select coalesce(jsonb_agg(jsonb_build_object('reason', movements.reason, 'units', movements.units) order by movements.reason), '[]'::jsonb)
            from (
                select m.reason, sum(m.quantity_delta)::bigint as units
                from public.inventory_movements m
                where m.store_id = target_store and m.created_at >= now() - interval '30 days'
                group by m.reason
            ) movements
        ),
        'shipping_timings', (
            select jsonb_build_object(
                'dispatched_count', count(*) filter (where sh.shipped_at is not null),
                'delivered_count', count(*) filter (where sh.shipped_at is not null and sh.delivered_at is not null),
                'avg_dispatch_hours', coalesce(round((avg(extract(epoch from (sh.shipped_at - sh.created_at)) / 3600) filter (where sh.shipped_at is not null))::numeric, 1), 0),
                'avg_transit_hours', coalesce(round((avg(extract(epoch from (sh.delivered_at - sh.shipped_at)) / 3600) filter (where sh.shipped_at is not null and sh.delivered_at is not null))::numeric, 1), 0)
            ) from public.shipments sh where sh.store_id = target_store
        ),
        'product_conversion_estimate', (
            select coalesce(round(100.0 * paid_product_orders.order_count / nullif(viewed_products.view_count, 0), 1), 0)
            from (
                select count(distinct o.id)::numeric as order_count
                from public.orders o join public.order_items oi on oi.store_id = o.store_id and oi.order_id = o.id
                where o.store_id = target_store and exists (
                    select 1 from public.payments p where p.store_id = o.store_id and p.order_id = o.id and p.status = 'captured'
                )
            ) paid_product_orders
            cross join (
                select count(*)::numeric as view_count from public.product_view_sessions v where v.store_id = target_store
            ) viewed_products
        ),
        'sales_last_7_days', (
            select coalesce(jsonb_agg(jsonb_build_object('date', d.day::date, 'amount_minor', coalesce(sales.amount_minor, 0)) order by d.day), '[]'::jsonb)
            from generate_series(current_date - 6, current_date, interval '1 day') as d(day)
            left join lateral (
                select sum(p.amount_minor) as amount_minor
                from public.payments p join public.orders o on o.store_id = p.store_id and o.id = p.order_id
                where p.store_id = target_store and p.status = 'captured' and o.created_at::date = d.day::date
            ) sales on true
        ),
        'top_products', (
            select coalesce(jsonb_agg(jsonb_build_object('name', product_name_snapshot, 'units_sold', units_sold, 'sales_minor', sales_minor) order by sales_minor desc), '[]'::jsonb)
            from (
                select oi.product_name_snapshot, sum(oi.quantity)::bigint as units_sold, sum(oi.line_total_minor)::bigint as sales_minor
                from public.order_items oi
                join public.orders o on o.store_id = oi.store_id and o.id = oi.order_id
                where oi.store_id = target_store and exists (
                    select 1 from public.payments p where p.store_id = o.store_id and p.order_id = o.id and p.status = 'captured'
                )
                group by oi.product_name_snapshot
                order by sum(oi.line_total_minor) desc
                limit 5
            ) products
        ),
        'product_engagement', (
            select coalesce(jsonb_agg(jsonb_build_object('name', engaged.name, 'views', engaged.view_count, 'wishlists', engaged.wishlist_count) order by engaged.view_count desc, engaged.wishlist_count desc), '[]'::jsonb)
            from (
                select p.name, views.view_count, wishlists.wishlist_count
                from public.products p
                cross join lateral (select count(*)::bigint as view_count from public.product_view_sessions v where v.store_id = target_store and v.product_id = p.id) views
                cross join lateral (select count(distinct w.user_id)::bigint as wishlist_count from public.wishlist_items w where w.store_id = target_store and w.product_id = p.id) wishlists
                where p.store_id = target_store and p.status = 'active'
                order by views.view_count desc, wishlists.wishlist_count desc
                limit 5
            ) engaged
        ),
        'recent_orders', (
            select coalesce(jsonb_agg(jsonb_build_object('id', recent.id, 'order_number', recent.order_number, 'status', recent.status, 'total_minor', recent.total_minor, 'currency', recent.currency, 'created_at', recent.created_at, 'payment_status', recent.payment_status) order by recent.created_at desc), '[]'::jsonb)
            from (
                select o.id, o.order_number, o.status, o.total_minor, o.currency, o.created_at,
                       (select p.status from public.payments p where p.store_id = o.store_id and p.order_id = o.id order by p.created_at desc limit 1) as payment_status
                from public.orders o where o.store_id = target_store order by o.created_at desc limit 8
            ) recent
        )
    ) into result
    from public.stores s
    where s.id = target_store;

    if result is null then raise exception 'Store not found.'; end if;
    return result;
end;
$$;

revoke all on function public.get_store_dashboard_metrics(uuid) from public, anon;
grant execute on function public.get_store_dashboard_metrics(uuid) to authenticated;

notify pgrst, 'reload schema';
