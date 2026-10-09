create table public.stores (
    id uuid primary key default gen_random_uuid(),

    name varchar(150) not null,
    slug varchar(100) not null unique,
    description text,

    logo_url text,
    favicon_url text,

    default_currency varchar(3) not null default 'INR',
    timezone varchar(100) not null default 'Asia/Kolkata',

    status varchar(20) not null default 'draft'
        check (status in ('draft', 'active', 'suspended', 'archived')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_stores_status
    on public.stores(status);