-- Shared tenant and timestamp helpers.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.current_user_id() returns uuid language sql stable as $$ select id from public.users where auth_user_id = auth.uid() $$;
create table public.store_memberships (store_id uuid not null references public.stores(id) on delete cascade, user_id uuid not null references public.users(id) on delete cascade, status text not null default 'active' check (status in ('invited','active','suspended')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(store_id,user_id));
