alter table public.product_variants add column tax_class_id uuid references public.tax_classes(id) on delete set null;
