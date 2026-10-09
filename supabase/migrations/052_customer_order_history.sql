-- Let authenticated customers read only the order line/address rows belonging
-- to orders they own. Store staff policies remain in place.
grant select on public.orders, public.order_items, public.order_addresses to authenticated;

drop policy if exists order_items_customer_read on public.order_items;
create policy order_items_customer_read
    on public.order_items
    for select to authenticated
    using (
        exists (
            select 1
            from public.orders o
            where o.id = order_items.order_id
              and o.store_id = order_items.store_id
              and o.user_id = public.current_user_id()
        )
    );

drop policy if exists order_addresses_customer_read on public.order_addresses;
create policy order_addresses_customer_read
    on public.order_addresses
    for select to authenticated
    using (
        exists (
            select 1
            from public.orders o
            where o.id = order_addresses.order_id
              and o.store_id = order_addresses.store_id
              and o.user_id = public.current_user_id()
        )
    );
