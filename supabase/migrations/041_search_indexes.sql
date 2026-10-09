create index idx_products_name_trgm on public.products using gin(name gin_trgm_ops);
create index idx_products_description_trgm on public.products using gin(description gin_trgm_ops);
create index idx_variants_product on public.product_variants(store_id,product_id);
create index idx_orders_customer on public.orders(store_id,user_id,created_at desc);
create index idx_orders_status on public.orders(store_id,status,created_at desc);
