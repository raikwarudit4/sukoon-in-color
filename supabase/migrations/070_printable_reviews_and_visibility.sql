alter table public.reviews
    add column reviewed_variant_id uuid;

alter table public.reviews
    add constraint fk_reviews_store_variant
    foreign key (store_id, reviewed_variant_id)
    references public.product_variants(store_id, id)
    on delete set null (reviewed_variant_id);

-- Per user request, clear the existing reviews for this store before starting
-- printable-purchase-only reviews. Related review_media rows cascade-delete.
delete from public.reviews r
using public.stores s
where r.store_id = s.id
  and s.slug = 'sukoon-in-color';

-- Return a printable variant the signed-in customer actually received.
create or replace function public.get_delivered_print_variant(p_product_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select oi.variant_id
      from public.orders o
      join public.order_items oi on oi.store_id = o.store_id and oi.order_id = o.id
      join public.product_variants v on v.store_id = oi.store_id and v.id = oi.variant_id
     where o.user_id = public.current_user_id()
       and o.status = 'delivered'
       and v.product_id = p_product_id
       and v.option_values ->> 'sale_type' = 'print'
     order by o.created_at desc, oi.created_at desc
     limit 1
$$;

create or replace function public.has_delivered_product_purchase(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.get_delivered_print_variant(p_product_id) is not null
$$;

create or replace function public.has_delivered_print_variant_purchase(p_product_id uuid, p_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.orders o
          join public.order_items oi on oi.store_id = o.store_id and oi.order_id = o.id
          join public.product_variants v on v.store_id = oi.store_id and v.id = oi.variant_id
         where o.user_id = public.current_user_id()
           and o.status = 'delivered'
           and v.product_id = p_product_id
           and v.id = p_variant_id
           and v.option_values ->> 'sale_type' = 'print'
    )
$$;

revoke all on function public.get_delivered_print_variant(uuid) from public, anon;
grant execute on function public.get_delivered_print_variant(uuid) to authenticated;
revoke all on function public.has_delivered_product_purchase(uuid) from public, anon;
grant execute on function public.has_delivered_product_purchase(uuid) to authenticated;
revoke all on function public.has_delivered_print_variant_purchase(uuid, uuid) from public, anon;
grant execute on function public.has_delivered_print_variant_purchase(uuid, uuid) to authenticated;

drop policy if exists reviews_owner_insert on public.reviews;
create policy reviews_owner_insert on public.reviews
for insert to authenticated
with check (
    user_id = public.current_user_id()
    and status = 'pending'
    and reviewed_variant_id is not null
    and exists (
        select 1 from public.products p
         where p.id = reviews.product_id
           and p.store_id = reviews.store_id
           and p.status = 'active'
    )
    and public.has_delivered_print_variant_purchase(product_id, reviewed_variant_id)
);

notify pgrst, 'reload schema';
