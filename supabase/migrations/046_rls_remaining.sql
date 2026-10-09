do $$ declare t text; begin foreach t in array array['store_memberships','store_addresses','customer_profiles','customer_addresses','product_media','product_options','product_option_values','tax_classes','inventory_locations','inventory_levels','inventory_movements','carts','cart_items','discounts','order_addresses','order_items','order_events','inventory_reservations','payments','payment_events','shipments','invoices','returns','return_items','damage_claims','marketing_campaigns','marketing_suppressions','notifications','reviews','review_media','audit_logs','store_settings','feature_flags'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
create policy store_memberships_self_read on public.store_memberships for select using(user_id=public.current_user_id() or public.is_store_member(store_id));
create policy users_self_read on public.users for select using(id=public.current_user_id());
create policy users_self_update on public.users for update using(id=public.current_user_id()) with check(id=public.current_user_id());
create policy roles_authenticated_read on public.roles for select to authenticated using(true);
create policy permissions_authenticated_read on public.permissions for select to authenticated using(true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using(true);
create policy user_roles_self_read on public.user_roles for select using(user_id=public.current_user_id());
-- Store staff permissions apply only to rows carrying a store_id. Customer
-- and notification rows use owner-scoped policies below.
do $$ declare t text; begin foreach t in array array['store_addresses','product_media','product_options','tax_classes','inventory_locations','inventory_levels','inventory_movements','carts','cart_items','discounts','order_addresses','order_items','order_events','inventory_reservations','payments','shipments','invoices','returns','return_items','damage_claims','marketing_campaigns','marketing_suppressions','store_settings','feature_flags'] loop execute format('create policy %I on public.%I for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id))', 'store_member_all_'||t, t); end loop; end $$;
create policy audit_logs_store_read on public.audit_logs for select using(store_id is not null and public.is_store_member(store_id));
create policy audit_logs_store_insert on public.audit_logs for insert with check(store_id is not null and public.is_store_member(store_id));
create policy customer_addresses_owner_all on public.customer_addresses for all using(user_id=public.current_user_id()) with check(user_id=public.current_user_id());
create policy customer_profiles_owner_all on public.customer_profiles for all using(user_id=public.current_user_id()) with check(user_id=public.current_user_id());
create policy notifications_owner_read on public.notifications for select using(user_id=public.current_user_id() or (store_id is not null and public.is_store_member(store_id)));
create policy reviews_public_read on public.reviews for select using(status='published' or user_id=public.current_user_id() or public.is_store_member(store_id));
create policy reviews_owner_insert on public.reviews for insert with check(user_id=public.current_user_id());
create policy reviews_store_update on public.reviews for update using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));
create policy review_media_visible on public.review_media for select using(exists(select 1 from public.reviews r where r.id=review_id and (r.status='published' or r.user_id=public.current_user_id() or public.is_store_member(r.store_id))));
