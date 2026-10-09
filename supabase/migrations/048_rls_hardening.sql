-- Keep public catalog reads aligned with product publication status.
drop policy variants_public_read on public.product_variants;
create policy variants_public_read
    on public.product_variants
    for select
    using (
        public.is_store_member(store_id)
        or (
            is_active
            and exists (
                select 1
                from public.products p
                join public.stores s on s.id = p.store_id
                where p.id = product_variants.product_id
                  and p.store_id = product_variants.store_id
                  and p.status = 'active'
                  and s.status = 'active'
            )
        )
    );

-- A self-row RLS check does not restrict which columns the user may update.
-- Allow authenticated users to edit only their public profile fields.
revoke update on public.users from public, anon, authenticated;
revoke update (id, auth_user_id, first_name, last_name, phone, avatar_url, status, created_at, updated_at)
    on public.users from public, anon, authenticated;
grant update (first_name, last_name, phone, avatar_url)
    on public.users to authenticated;
