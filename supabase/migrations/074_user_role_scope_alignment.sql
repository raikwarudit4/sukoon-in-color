-- Align databases that applied the earlier user_roles primary-key definition
-- with the current schema, where NULL store_id represents a platform role.
-- On databases created from the current 004_roles_permissions.sql this is a
-- safe no-op apart from verifying the intended indexes exist.
do $$
declare
    v_primary_key_name text;
begin
    select c.conname
      into v_primary_key_name
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.user_roles'::regclass
       and c.contype = 'p';

    if v_primary_key_name is not null then
        execute format(
            'alter table public.user_roles drop constraint %I',
            v_primary_key_name
        );
    end if;
end;
$$;

alter table public.user_roles
    alter column store_id drop not null;

create unique index if not exists uq_user_roles_platform
    on public.user_roles (user_id, role_id)
    where store_id is null;

create unique index if not exists uq_user_roles_store
    on public.user_roles (user_id, role_id, store_id)
    where store_id is not null;
