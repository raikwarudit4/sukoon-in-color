-- Store-configurable flat shipping fee. The default 9900 is ₹99.00 in INR paise.
insert into public.store_settings (store_id, setting_key, value, updated_at)
select id, 'flat_shipping_fee_minor', '9900'::jsonb, now()
  from public.stores
on conflict (store_id, setting_key) do nothing;

create or replace function public.get_public_shipping_fee(p_store_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((ss.value #>> '{}')::bigint, 9900)
      from public.stores s
      left join public.store_settings ss
        on ss.store_id = s.id and ss.setting_key = 'flat_shipping_fee_minor'
     where s.id = p_store_id and s.status = 'active'
$$;
revoke all on function public.get_public_shipping_fee(uuid) from public;
grant execute on function public.get_public_shipping_fee(uuid) to anon, authenticated;

create or replace function public.set_store_shipping_fee(p_store_id uuid, p_fee_minor bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.current_user_id() is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to change this store''s settings.';
    end if;
    if p_fee_minor is null or p_fee_minor < 0 or p_fee_minor > 100000000 then
        raise exception 'Shipping fee must be between ₹0 and ₹1,000,000.';
    end if;
    insert into public.store_settings (store_id, setting_key, value, updated_at)
    values (p_store_id, 'flat_shipping_fee_minor', to_jsonb(p_fee_minor), now())
    on conflict (store_id, setting_key) do update
       set value = excluded.value, updated_at = now();
    return p_fee_minor;
end;
$$;
revoke all on function public.set_store_shipping_fee(uuid, bigint) from public, anon;
grant execute on function public.set_store_shipping_fee(uuid, bigint) to authenticated;
create or replace function public.place_cod_order(
    p_store_id uuid,
    p_idempotency_key text,
    p_recipient_name text,
    p_phone text,
    p_address_line1 text,
    p_address_line2 text,
    p_locality text,
    p_city text,
    p_region text,
    p_postal_code text,
    p_country_code text default 'IN'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := public.current_user_id();
    v_cart_id uuid;
    v_order_id uuid;
    v_order_number text;
    v_currency character(3);
    v_subtotal bigint := 0;
    v_shipping bigint := 9900;
    v_variant record;
    v_level record;
    v_remaining integer;
    v_take integer;
    v_available integer;
    v_cart_line_count integer;
    v_valid_line_count integer;
begin
    if v_user_id is null then raise exception 'Sign in to place an order.'; end if;
    if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 100 then
        raise exception 'A valid checkout request key is required.';
    end if;
    if nullif(btrim(p_recipient_name), '') is null
       or nullif(btrim(p_phone), '') is null
       or nullif(btrim(p_address_line1), '') is null
       or nullif(btrim(p_locality), '') is null
       or nullif(btrim(p_city), '') is null
       or nullif(btrim(p_region), '') is null
       or nullif(btrim(p_postal_code), '') is null
       or length(coalesce(p_country_code, '')) <> 2 then
        raise exception 'Complete all required delivery details.';
    end if;
    if length(p_recipient_name) > 160 or length(p_phone) > 32
       or length(p_address_line1) > 240 or length(coalesce(p_address_line2, '')) > 240
       or length(p_locality) > 120 or length(p_city) > 120
       or length(p_region) > 120 or length(p_postal_code) > 20 then
        raise exception 'One or more delivery details exceed the allowed length.';
    end if;

    perform 1 from public.stores s where s.id = p_store_id and s.status = 'active';
    if not found then raise exception 'This store is not available.'; end if;

    select o.id into v_order_id
      from public.orders o
     where o.store_id = p_store_id and o.idempotency_key = p_idempotency_key;
    if found then
        if not exists (select 1 from public.orders o where o.id = v_order_id and o.user_id = v_user_id) then
            raise exception 'This checkout request key is already in use.';
        end if;
        return v_order_id;
    end if;

    select s.default_currency into v_currency from public.stores s where s.id = p_store_id;
    select coalesce((ss.value #>> '{}')::bigint, 9900)
      into v_shipping
      from public.stores s
      left join public.store_settings ss
        on ss.store_id = s.id and ss.setting_key = 'flat_shipping_fee_minor'
     where s.id = p_store_id and s.status = 'active';
    if v_shipping < 0 then raise exception 'The store shipping fee is invalid.'; end if;
    select c.id into v_cart_id
      from public.carts c
     where c.store_id = p_store_id
       and c.user_id = v_user_id
       and (c.expires_at is null or c.expires_at > now())
     for update;
    if v_cart_id is null then
        -- A parallel retry may have completed while this request waited for the cart lock.
        select o.id into v_order_id
          from public.orders o
         where o.store_id = p_store_id
           and o.idempotency_key = p_idempotency_key
           and o.user_id = v_user_id;
        if found then return v_order_id; end if;
        raise exception 'Your cart is empty.';
    end if;
    if not exists (select 1 from public.cart_items ci where ci.cart_id = v_cart_id) then
        raise exception 'Your cart is empty.';
    end if;
    select count(*) into v_cart_line_count from public.cart_items ci where ci.cart_id = v_cart_id;
    select count(*) into v_valid_line_count
      from public.cart_items ci
      join public.product_variants v on v.id = ci.variant_id and v.store_id = ci.store_id
      join public.products p on p.id = v.product_id and p.store_id = v.store_id
     where ci.cart_id = v_cart_id and ci.store_id = p_store_id
       and v.is_active and p.status = 'active';
    if v_cart_line_count <> v_valid_line_count then
        raise exception 'One or more products in your cart are no longer available.';
    end if;

    -- Verify every cart line and calculate from current prices, never browser-submitted totals.
    for v_variant in
        select ci.variant_id, ci.quantity, v.sku, v.title, v.price_minor, v.currency,
               p.name as product_name
          from public.cart_items ci
          join public.product_variants v on v.id = ci.variant_id and v.store_id = ci.store_id
          join public.products p on p.id = v.product_id and p.store_id = v.store_id
         where ci.cart_id = v_cart_id and ci.store_id = p_store_id
           and v.is_active and p.status = 'active'
         order by ci.variant_id
    loop
        if v_variant.currency <> v_currency then raise exception 'Cart currency does not match the store.'; end if;
        v_subtotal := v_subtotal + v_variant.price_minor * v_variant.quantity;
    end loop;
    if v_subtotal <= 0 then raise exception 'Your cart contains no available products.'; end if;

    v_order_number := 'SIC-' || to_char(clock_timestamp() at time zone 'UTC', 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    insert into public.orders (store_id, user_id, order_number, status, currency, subtotal_minor, shipping_minor, total_minor, idempotency_key)
    values (p_store_id, v_user_id, v_order_number, 'pending', v_currency, v_subtotal, v_shipping, v_subtotal + v_shipping, p_idempotency_key)
    returning id into v_order_id;

    insert into public.order_addresses (store_id, order_id, kind, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, country_code)
    values (p_store_id, v_order_id, 'shipping', btrim(p_recipient_name), btrim(p_phone), btrim(p_address_line1), nullif(btrim(p_address_line2), ''), btrim(p_locality), btrim(p_city), btrim(p_region), btrim(p_postal_code), upper(p_country_code));
    insert into public.order_addresses (store_id, order_id, kind, recipient_name, phone, address_line1, address_line2, locality, city, region, postal_code, country_code)
    values (p_store_id, v_order_id, 'billing', btrim(p_recipient_name), btrim(p_phone), btrim(p_address_line1), nullif(btrim(p_address_line2), ''), btrim(p_locality), btrim(p_city), btrim(p_region), btrim(p_postal_code), upper(p_country_code));

    for v_variant in
        select ci.variant_id, ci.quantity, v.sku, v.title, v.price_minor, v.currency,
               p.name as product_name
          from public.cart_items ci
          join public.product_variants v on v.id = ci.variant_id and v.store_id = ci.store_id
          join public.products p on p.id = v.product_id and p.store_id = v.store_id
         where ci.cart_id = v_cart_id and ci.store_id = p_store_id
           and v.is_active and p.status = 'active'
         order by ci.variant_id
    loop
        insert into public.order_items (store_id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_name_snapshot, quantity, unit_price_minor, line_total_minor)
        values (p_store_id, v_order_id, v_variant.variant_id, v_variant.sku, v_variant.product_name, v_variant.title, v_variant.quantity, v_variant.price_minor, v_variant.price_minor * v_variant.quantity);

        v_remaining := v_variant.quantity;
        v_available := 0;
        for v_level in
            select il.location_id, il.on_hand - il.reserved as available
              from public.inventory_levels il
              join public.inventory_locations loc on loc.id = il.location_id and loc.store_id = il.store_id
             where il.store_id = p_store_id and il.variant_id = v_variant.variant_id
               and loc.is_active and il.on_hand > il.reserved
             order by il.location_id
             for update of il
        loop
            v_available := v_available + v_level.available;
            v_take := least(v_remaining, v_level.available);
            if v_take > 0 then
                update public.inventory_levels
                   set reserved = reserved + v_take, updated_at = now()
                 where store_id = p_store_id and location_id = v_level.location_id and variant_id = v_variant.variant_id;
                insert into public.inventory_reservations (store_id, order_id, location_id, variant_id, quantity, status, expires_at)
                values (p_store_id, v_order_id, v_level.location_id, v_variant.variant_id, v_take, 'reserved', now() + interval '7 days');
                v_remaining := v_remaining - v_take;
            end if;
            exit when v_remaining = 0;
        end loop;
        if v_remaining > 0 then
            raise exception 'Insufficient inventory for SKU % (available %, requested %).', v_variant.sku, v_available, v_variant.quantity;
        end if;
    end loop;

    insert into public.payments (store_id, order_id, provider, status, amount_minor, currency, idempotency_key, metadata)
    values (p_store_id, v_order_id, 'cash_on_delivery', 'pending', v_subtotal + v_shipping, v_currency, p_idempotency_key, '{"collection":"on_delivery"}'::jsonb);

    delete from public.carts where id = v_cart_id;
    return v_order_id;
end;
$$;

revoke all on function public.place_cod_order(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.place_cod_order(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
