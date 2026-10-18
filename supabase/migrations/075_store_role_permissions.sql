-- Enforce store role permissions in the database and expose the same checks
-- to server-rendered admin pages and route handlers.
create or replace function public.has_store_permission(
    target_store uuid,
    required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select target_store is not null
       and required_permission is not null
       and exists (
            select 1
              from public.store_memberships as m
              join public.user_roles as ur
                on ur.user_id = m.user_id
               and ur.store_id = m.store_id
              join public.roles as r
                on r.id = ur.role_id
               and r.scope = 'store'
              join public.role_permissions as rp
                on rp.role_id = r.id
              join public.permissions as p
                on p.id = rp.permission_id
             where m.store_id = target_store
               and m.user_id = public.current_user_id()
               and m.status = 'active'
               and p.code = required_permission
       )
$$;

revoke all on function public.has_store_permission(uuid, text) from public, anon;
-- Public catalog policies call this helper as anon; without membership it
-- simply evaluates to false.
grant execute on function public.has_store_permission(uuid, text) to anon, authenticated, service_role;

-- Store administrators receive operational permissions only. Owners retain
-- the full permission set seeded by migration 047.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles as r
  join public.permissions as p on p.code in (
      'catalog.manage', 'inventory.manage', 'orders.manage',
      'reviews.moderate', 'reports.read'
  )
 where r.name = 'admin'
   and r.scope = 'store'
on conflict (role_id, permission_id) do nothing;

-- Replace the old any-active-member store data policies. Policies are
-- permissive, so leaving an old policy in place would keep granting access.
do $$
declare
    item record;
begin
    for item in
        select * from (values
            ('store_addresses', 'store.manage'),
            ('product_media', 'catalog.manage'),
            ('product_options', 'catalog.manage'),
            ('tax_classes', 'store.manage'),
            ('inventory_locations', 'inventory.manage'),
            ('inventory_levels', 'inventory.manage'),
            ('inventory_movements', 'inventory.manage'),
            ('carts', 'customers.manage'),
            ('cart_items', 'customers.manage'),
            ('discounts', 'marketing.manage'),
            ('order_addresses', 'orders.manage'),
            ('order_items', 'orders.manage'),
            ('order_events', 'orders.manage'),
            ('inventory_reservations', 'orders.manage'),
            ('payments', 'orders.manage'),
            ('shipments', 'orders.manage'),
            ('invoices', 'orders.manage'),
            ('returns', 'orders.manage'),
            ('return_items', 'orders.manage'),
            ('damage_claims', 'orders.manage'),
            ('marketing_campaigns', 'marketing.manage'),
            ('marketing_suppressions', 'marketing.manage'),
            ('store_settings', 'store.manage'),
            ('feature_flags', 'store.manage')
        ) as permissions(table_name, permission_code)
    loop
        execute format('drop policy if exists %I on public.%I', 'store_member_all_' || item.table_name, item.table_name);
        execute format('create policy %I on public.%I for all to authenticated using (public.has_store_permission(store_id, %L)) with check (public.has_store_permission(store_id, %L))',
            'store_permission_all_' || item.table_name,
            item.table_name,
            item.permission_code,
            item.permission_code);
    end loop;
end;
$$;

drop policy if exists brands_store_manage on public.brands;
create policy brands_store_manage on public.brands for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists products_store_manage on public.products;
create policy products_store_manage on public.products for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists categories_store_manage on public.categories;
create policy categories_store_manage on public.categories for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists variants_store_manage on public.product_variants;
create policy variants_store_manage on public.product_variants for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists product_media_store_manage on public.product_media;
create policy product_media_store_manage on public.product_media for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists product_options_store_manage on public.product_options;
create policy product_options_store_manage on public.product_options for all to authenticated
    using (public.has_store_permission(store_id, 'catalog.manage'))
    with check (public.has_store_permission(store_id, 'catalog.manage'));

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated
    using (
        (status = 'active' and exists (
            select 1 from public.stores as s where s.id = products.store_id and s.status = 'active'
        ))
        or public.has_store_permission(store_id, 'catalog.manage')
    );

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated
    using (
        (is_active and exists (
            select 1 from public.stores as s where s.id = categories.store_id and s.status = 'active'
        ))
        or public.has_store_permission(store_id, 'catalog.manage')
    );

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read on public.product_variants for select to anon, authenticated
    using (
        public.has_store_permission(store_id, 'catalog.manage')
        or (
            is_active and exists (
                select 1 from public.products as p
                join public.stores as s on s.id = p.store_id
                where p.id = product_variants.product_id
                  and p.store_id = product_variants.store_id
                  and p.status = 'active'
                  and s.status = 'active'
            )
        )
    );

drop policy if exists brands_public_read on public.brands;
create policy brands_public_read on public.brands for select to anon, authenticated
    using (
        is_active and exists (
            select 1 from public.stores as s where s.id = brands.store_id and s.status = 'active'
        )
    );

drop policy if exists product_media_public_read on public.product_media;
create policy product_media_public_read on public.product_media for select to anon, authenticated
    using (
        exists (
            select 1 from public.products as p
            join public.stores as s on s.id = p.store_id
            where p.id = product_media.product_id
              and p.store_id = product_media.store_id
              and p.status = 'active'
              and s.status = 'active'
        )
        or public.has_store_permission(store_id, 'catalog.manage')
    );

drop policy if exists orders_customer_read on public.orders;
create policy orders_customer_read on public.orders for select to authenticated
    using (user_id = public.current_user_id() or public.has_store_permission(store_id, 'orders.manage'));

drop policy if exists store_memberships_self_read on public.store_memberships;
create policy store_memberships_self_read on public.store_memberships for select to authenticated
    using (user_id = public.current_user_id() or public.has_store_permission(store_id, 'store.manage'));

drop policy if exists audit_logs_store_read on public.audit_logs;
create policy audit_logs_store_read on public.audit_logs for select to authenticated
    using (store_id is not null and public.has_store_permission(store_id, 'reports.read'));
drop policy if exists audit_logs_store_insert on public.audit_logs;
create policy audit_logs_store_insert on public.audit_logs for insert to authenticated
    with check (
        store_id is not null and (
            public.has_store_permission(store_id, 'catalog.manage')
            or public.has_store_permission(store_id, 'inventory.manage')
            or public.has_store_permission(store_id, 'orders.manage')
            or public.has_store_permission(store_id, 'reviews.moderate')
            or public.has_store_permission(store_id, 'store.manage')
        )
    );

drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications for select to authenticated
    using (
        user_id = public.current_user_id()
        or (store_id is not null and public.has_store_permission(store_id, 'reports.read'))
    );

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews for select to anon, authenticated
    using (
        status = 'published'
        or user_id = public.current_user_id()
        or public.has_store_permission(store_id, 'reviews.moderate')
    );
drop policy if exists reviews_store_update on public.reviews;
create policy reviews_store_update on public.reviews for update to authenticated
    using (public.has_store_permission(store_id, 'reviews.moderate'))
    with check (
        public.has_store_permission(store_id, 'reviews.moderate')
        and status in ('published', 'rejected')
    );
drop policy if exists review_media_visible on public.review_media;
create policy review_media_visible on public.review_media for select to anon, authenticated
    using (
        exists (
            select 1 from public.reviews as r
            where r.id = review_media.review_id
              and (
                  r.status = 'published'
                  or r.user_id = public.current_user_id()
                  or public.has_store_permission(r.store_id, 'reviews.moderate')
              )
        )
    );

drop policy if exists shipment_events_store_read on public.shipment_events;
create policy shipment_events_store_read on public.shipment_events for select to authenticated
    using (public.has_store_permission(store_id, 'orders.manage'));

drop policy if exists return_evidence_owner_or_store_read on storage.objects;
create policy return_evidence_owner_or_store_read on storage.objects for select to authenticated
    using (
        bucket_id = 'return-evidence'
        and exists (
            select 1 from public.orders as o
            where o.id::text = (storage.foldername(name))[2]
              and (
                  (o.user_id = public.current_user_id()
                   and (storage.foldername(name))[1] = public.current_user_id()::text)
                  or public.has_store_permission(o.store_id, 'orders.manage')
              )
        )
    );

-- Harden security-definer RPCs too; RLS alone does not protect their writes.
do $$
declare
    item record;
    definition text;
begin
    for item in
        select * from (values
            ('public.manage_store_order(uuid,uuid,text)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''orders.manage'')'),
            ('public.deliver_paid_store_order(uuid,uuid)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''orders.manage'')'),
            ('public.adjust_store_inventory(uuid,uuid,uuid,integer,text,text)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''inventory.manage'')'),
            ('public.set_store_shipping_fee(uuid,bigint)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''store.manage'')'),
            ('public.set_store_returns_enabled(uuid,boolean)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''store.manage'')'),
            ('public.set_store_customer_support_email(uuid,text)'::regprocedure, 'public.is_store_member(p_store_id)', 'public.has_store_permission(p_store_id, ''store.manage'')'),
            ('public.get_store_dashboard_metrics(uuid)'::regprocedure, 'public.is_store_member(target_store)', 'public.has_store_permission(target_store, ''reports.read'')'),
            ('public.delete_draft_product(uuid)'::regprocedure, 'public.is_store_member(v_store_id)', 'public.has_store_permission(v_store_id, ''catalog.manage'')')
        ) as functions(function_id, old_check, new_check)
    loop
        definition := pg_get_functiondef(item.function_id);
        if position(item.old_check in definition) = 0 then
            raise exception 'Expected authorization check not found in %', item.function_id;
        end if;
        execute replace(definition, item.old_check, item.new_check);
    end loop;
end;
$$;

revoke all on function public.manage_store_order(uuid, uuid, text) from public, anon;
grant execute on function public.manage_store_order(uuid, uuid, text) to authenticated;
revoke all on function public.deliver_paid_store_order(uuid, uuid) from public, anon;
grant execute on function public.deliver_paid_store_order(uuid, uuid) to authenticated;
revoke all on function public.adjust_store_inventory(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_store_inventory(uuid, uuid, uuid, integer, text, text) to authenticated;
revoke all on function public.set_store_shipping_fee(uuid, bigint) from public, anon;
grant execute on function public.set_store_shipping_fee(uuid, bigint) to authenticated;
revoke all on function public.set_store_returns_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_store_returns_enabled(uuid, boolean) to authenticated;
revoke all on function public.set_store_customer_support_email(uuid, text) from public, anon;
grant execute on function public.set_store_customer_support_email(uuid, text) to authenticated;
revoke all on function public.get_store_dashboard_metrics(uuid) from public, anon;
grant execute on function public.get_store_dashboard_metrics(uuid) to authenticated;
revoke all on function public.delete_draft_product(uuid) from public, anon;
grant execute on function public.delete_draft_product(uuid) to authenticated;
