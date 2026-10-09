create table public.roles (
    id uuid primary key default gen_random_uuid(),

    name varchar(100) not null,
    description text,

    scope varchar(20) not null
        check (scope in ('platform', 'store')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint uq_roles_name_scope unique (name, scope)
);

create table public.permissions (
    id uuid primary key default gen_random_uuid(),

    code varchar(150) not null unique,
    description text,

    created_at timestamptz not null default now()
);

create table public.role_permissions (
    role_id uuid not null,
    permission_id uuid not null,

    created_at timestamptz not null default now(),

    primary key (role_id, permission_id),

    constraint fk_role_permissions_role
        foreign key (role_id)
        references public.roles(id)
        on delete cascade,

    constraint fk_role_permissions_permission
        foreign key (permission_id)
        references public.permissions(id)
        on delete cascade
);

create table public.user_roles (
    user_id uuid not null,
    role_id uuid not null,
    store_id uuid,

    created_at timestamptz not null default now(),

    constraint fk_user_roles_user
        foreign key (user_id)
        references public.users(id)
        on delete cascade,

    constraint fk_user_roles_role
        foreign key (role_id)
        references public.roles(id)
        on delete cascade,

    constraint fk_user_roles_store
        foreign key (store_id)
        references public.stores(id)
        on delete cascade
);

create index idx_user_roles_user
    on public.user_roles(user_id);

create index idx_user_roles_role
    on public.user_roles(role_id);

create index idx_user_roles_store
    on public.user_roles(store_id);

-- NULL store_id represents a platform-wide role assignment. PostgreSQL primary
-- keys make every key column NOT NULL, so enforce the two valid scopes with
-- separate partial unique indexes instead.
create unique index uq_user_roles_platform
    on public.user_roles(user_id, role_id)
    where store_id is null;

create unique index uq_user_roles_store
    on public.user_roles(user_id, role_id, store_id)
    where store_id is not null;
