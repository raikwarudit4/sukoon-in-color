create table public.product_view_sessions (
    store_id uuid not null,
    product_id uuid not null,
    viewer_key uuid not null,
    created_at timestamptz not null default now(),
    primary key (store_id, product_id, viewer_key),
    constraint product_view_sessions_store_product_fkey
        foreign key (store_id, product_id)
        references public.products(store_id, id)
        on delete cascade
);

create index idx_product_view_sessions_store_product
    on public.product_view_sessions (store_id, product_id);

alter table public.product_view_sessions enable row level security;
revoke all on table public.product_view_sessions from public, anon, authenticated;

create or replace function public.record_public_product_view(
    p_store_id uuid,
    p_product_id uuid,
    p_viewer_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_viewer_key is null or not exists (
        select 1
        from public.products p
        join public.stores s on s.id = p.store_id
        where p.id = p_product_id
          and p.store_id = p_store_id
          and p.status = 'active'
          and s.status = 'active'
    ) then
        raise exception 'This product is not available.';
    end if;

    insert into public.product_view_sessions (store_id, product_id, viewer_key)
    values (p_store_id, p_product_id, p_viewer_key)
    on conflict (store_id, product_id, viewer_key) do nothing;
end;
$$;

create or replace function public.get_public_product_metrics(
    p_store_id uuid,
    p_product_id uuid
)
returns table(view_count bigint, wishlist_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select
        (select count(*)
         from public.product_view_sessions pv
         where pv.store_id = p_store_id and pv.product_id = p_product_id),
        (select count(distinct wi.user_id)
         from public.wishlist_items wi
         where wi.store_id = p_store_id and wi.product_id = p_product_id)
    where exists (
        select 1
        from public.products p
        join public.stores s on s.id = p.store_id
        where p.id = p_product_id
          and p.store_id = p_store_id
          and p.status = 'active'
          and s.status = 'active'
    );
$$;

revoke all on function public.record_public_product_view(uuid, uuid, uuid) from public;
grant execute on function public.record_public_product_view(uuid, uuid, uuid) to anon, authenticated;
revoke all on function public.get_public_product_metrics(uuid, uuid) from public;
grant execute on function public.get_public_product_metrics(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
