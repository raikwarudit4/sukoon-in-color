create table public.users (
    id uuid primary key default gen_random_uuid(),

    auth_user_id uuid not null unique,

    first_name varchar(100),
    last_name varchar(100),

    phone varchar(30),
    avatar_url text,

    status varchar(20) not null default 'active'
        check (status in ('active', 'blocked', 'deleted')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_users_status
    on public.users(status);

create index idx_users_phone
    on public.users(phone);