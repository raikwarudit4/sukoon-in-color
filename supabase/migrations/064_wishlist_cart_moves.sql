-- Keep wishlist/cart transfers atomic so a failed cart operation never loses a saved item.
create or replace function public.add_wishlist_item_to_cart(
    p_store_id uuid,
    p_product_id uuid,
    p_variant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := public.current_user_id();
    v_cart_id uuid;
begin
    if v_user_id is null then
        raise exception 'Sign in before moving a saved item to your cart.';
    end if;
    if not exists (
        select 1 from public.wishlist_items wi
        where wi.store_id = p_store_id
          and wi.product_id = p_product_id
          and wi.user_id = v_user_id
    ) then
        raise exception 'This item is no longer in your saved list.';
    end if;
    if not exists (
        select 1
        from public.product_variants v
        join public.products p on p.id = v.product_id and p.store_id = v.store_id
        where v.id = p_variant_id
          and v.product_id = p_product_id
          and v.store_id = p_store_id
          and v.is_active
          and p.status = 'active'
    ) then
        raise exception 'This product option is no longer available.';
    end if;

    v_cart_id := public.add_to_cart(p_store_id, p_variant_id, 1);

    delete from public.wishlist_items wi
    where wi.store_id = p_store_id
      and wi.product_id = p_product_id
      and wi.user_id = v_user_id;

    return v_cart_id;
end;
$$;

create or replace function public.move_cart_item_to_wishlist(
    p_store_id uuid,
    p_cart_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := public.current_user_id();
    v_product_id uuid;
begin
    if v_user_id is null then
        raise exception 'Sign in before moving an item to your saved list.';
    end if;

    select v.product_id into v_product_id
    from public.cart_items ci
    join public.carts c on c.id = ci.cart_id and c.store_id = ci.store_id
    join public.product_variants v on v.id = ci.variant_id and v.store_id = ci.store_id
    join public.products p on p.id = v.product_id and p.store_id = v.store_id
    join public.stores s on s.id = c.store_id
    where ci.id = p_cart_item_id
      and ci.store_id = p_store_id
      and c.store_id = p_store_id
      and c.user_id = v_user_id
      and (c.expires_at is null or c.expires_at > now())
      and v.is_active
      and p.status = 'active'
      and s.status = 'active'
    for update of ci, c;

    if v_product_id is null then
        raise exception 'This cart item is no longer available to save.';
    end if;

    insert into public.wishlist_items (store_id, user_id, product_id)
    values (p_store_id, v_user_id, v_product_id)
    on conflict (user_id, product_id) do nothing;

    delete from public.cart_items ci
    where ci.id = p_cart_item_id and ci.store_id = p_store_id;
end;
$$;

revoke all on function public.add_wishlist_item_to_cart(uuid, uuid, uuid) from public, anon;
grant execute on function public.add_wishlist_item_to_cart(uuid, uuid, uuid) to authenticated;
revoke all on function public.move_cart_item_to_wishlist(uuid, uuid) from public, anon;
grant execute on function public.move_cart_item_to_wishlist(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
