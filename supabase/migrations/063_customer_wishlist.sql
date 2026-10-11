create table public.wishlist_items (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references public.stores(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    product_id uuid not null,
    created_at timestamptz not null default now(),
    constraint wishlist_items_store_product_fkey
        foreign key (store_id, product_id)
        references public.products(store_id, id)
        on delete cascade,
    constraint wishlist_items_user_product_key unique (user_id, product_id)
);

create index idx_wishlist_items_store_user_created
    on public.wishlist_items (store_id, user_id, created_at desc);

alter table public.wishlist_items enable row level security;

create policy wishlist_items_owner_read
    on public.wishlist_items
    for select to authenticated
    using (user_id = public.current_user_id());

create policy wishlist_items_owner_insert
    on public.wishlist_items
    for insert to authenticated
    with check (
        user_id = public.current_user_id()
        and exists (
            select 1
            from public.products p
            join public.stores s on s.id = p.store_id
            where p.id = wishlist_items.product_id
              and p.store_id = wishlist_items.store_id
              and p.status = 'active'
              and s.status = 'active'
        )
    );

create policy wishlist_items_owner_delete
    on public.wishlist_items
    for delete to authenticated
    using (user_id = public.current_user_id());

revoke all on table public.wishlist_items from public, anon, authenticated;
grant select, insert, delete on table public.wishlist_items to authenticated;
