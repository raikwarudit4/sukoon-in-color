-- Customers can review a product only after a delivered order containing it.
create or replace function public.has_delivered_product_purchase(p_product_id uuid)
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
    )
$$;

revoke all on function public.has_delivered_product_purchase(uuid) from public, anon;
grant execute on function public.has_delivered_product_purchase(uuid) to authenticated;

-- Keep store staff read/moderation access, but do not let their broad store
-- policy bypass the verified-purchase rule for customer review submissions.
drop policy if exists store_member_all_reviews on public.reviews;
drop policy if exists reviews_owner_insert on public.reviews;
drop policy if exists reviews_store_update on public.reviews;

-- Keep public/customer reads and authenticated customer submissions explicit.
-- Store members can only change the moderation status, not rewrite review content.
revoke all on table public.reviews from public, anon, authenticated;
grant select on table public.reviews to anon, authenticated;
grant insert on table public.reviews to authenticated;
grant update (status) on table public.reviews to authenticated;

create policy reviews_store_update on public.reviews
for update to authenticated
using (public.is_store_member(store_id))
with check (
    public.is_store_member(store_id)
    and status in ('published', 'rejected')
);

create policy reviews_owner_insert on public.reviews
for insert to authenticated
with check (
    user_id = public.current_user_id()
    and status = 'pending'
    and exists (
        select 1 from public.products p
         where p.id = reviews.product_id
           and p.store_id = reviews.store_id
           and p.status = 'active'
    )
    and public.has_delivered_product_purchase(reviews.product_id)
);
