create table public.feature_flags (id uuid primary key default gen_random_uuid(), store_id uuid references public.stores(id) on delete cascade, flag_key text not null, enabled boolean not null default false, config jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create unique index uq_feature_flag_platform on public.feature_flags(flag_key) where store_id is null;
create unique index uq_feature_flag_store on public.feature_flags(store_id,flag_key) where store_id is not null;
