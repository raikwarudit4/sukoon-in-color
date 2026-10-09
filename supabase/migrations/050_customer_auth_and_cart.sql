-- Create an application profile when Supabase Auth creates a customer account.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.users (auth_user_id, first_name, last_name)
    values (
        new.id,
        nullif(new.raw_user_meta_data ->> 'first_name', ''),
        nullif(new.raw_user_meta_data ->> 'last_name', '')
    )
    on conflict (auth_user_id) do nothing;

    return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- A signed-in customer has one cart per store. Guest carts remain unavailable
-- until a server-validated guest session flow is implemented.
create unique index if not exists uq_carts_store_user
    on public.carts (store_id, user_id)
    where user_id is not null;

grant select on public.users to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;

drop policy if exists carts_customer_all on public.carts;
create policy carts_customer_all
    on public.carts
    for all to authenticated
    using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

drop policy if exists cart_items_customer_all on public.cart_items;
create policy cart_items_customer_all
    on public.cart_items
    for all to authenticated
    using (
        exists (
            select 1
            from public.carts c
            where c.id = cart_items.cart_id
              and c.store_id = cart_items.store_id
              and c.user_id = public.current_user_id()
              and (c.expires_at is null or c.expires_at > now())
        )
    )
    with check (
        exists (
            select 1
            from public.carts c
            where c.id = cart_items.cart_id
              and c.store_id = cart_items.store_id
              and c.user_id = public.current_user_id()
              and (c.expires_at is null or c.expires_at > now())
        )
        and exists (
            select 1
            from public.product_variants v
            join public.products p
              on p.id = v.product_id
             and p.store_id = v.store_id
            join public.stores s on s.id = p.store_id
            where v.id = cart_items.variant_id
              and v.store_id = cart_items.store_id
              and v.is_active
              and p.status = 'active'
              and s.status = 'active'
        )
    );

create or replace function public.add_to_cart(
    p_store_id uuid,
    p_variant_id uuid,
    p_quantity integer default 1
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_currency character(3);
    v_cart_id uuid;
begin
    if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
        raise exception 'Quantity must be between 1 and 1000.';
    end if;

    v_user_id := public.current_user_id();
    if v_user_id is null then
        raise exception 'Sign in before adding items to your cart.';
    end if;

    select s.default_currency
      into v_currency
      from public.stores s
     where s.id = p_store_id
       and s.status = 'active';

    if not found then
        raise exception 'The requested store is not active.';
    end if;

    if not exists (
        select 1
        from public.product_variants v
        join public.products p
          on p.id = v.product_id
         and p.store_id = v.store_id
        where v.id = p_variant_id
          and v.store_id = p_store_id
          and v.is_active
          and p.status = 'active'
    ) then
        raise exception 'The requested product variant is not available.';
    end if;

    insert into public.carts as c (store_id, user_id, currency)
    values (p_store_id, v_user_id, v_currency)
    on conflict (store_id, user_id) where user_id is not null
    do update set updated_at = now()
    returning c.id into v_cart_id;

    insert into public.cart_items as ci (store_id, cart_id, variant_id, quantity)
    values (p_store_id, v_cart_id, p_variant_id, p_quantity)
    on conflict (cart_id, variant_id)
    do update set
        quantity = least(1000, ci.quantity + excluded.quantity),
        updated_at = now();

    return v_cart_id;
end;
$$;

revoke all on function public.add_to_cart(uuid, uuid, integer) from public, anon;
grant execute on function public.add_to_cart(uuid, uuid, integer) to authenticated;
