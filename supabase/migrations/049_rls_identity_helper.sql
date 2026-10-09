-- The identity lookup reads public.users, which has RLS policies that call
-- this helper. Run the lookup as its owner to avoid recursive RLS evaluation.
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select u.id
    from public.users as u
    where u.auth_user_id = auth.uid()
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to anon, authenticated, service_role;
