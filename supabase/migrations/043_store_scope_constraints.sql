alter table public.reviews add constraint fk_reviews_store_product foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade;
alter table public.categories add constraint fk_categories_store_parent foreign key(store_id,parent_id) references public.categories(store_id,id) on delete cascade;
alter table public.products drop constraint products_category_id_fkey;
alter table public.products drop constraint products_brand_id_fkey;
alter table public.products add constraint fk_products_store_category foreign key(store_id,category_id) references public.categories(store_id,id) on delete set null (category_id);
alter table public.products add constraint fk_products_store_brand foreign key(store_id,brand_id) references public.brands(store_id,id) on delete set null (brand_id);
