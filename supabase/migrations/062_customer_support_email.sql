create or replace function public.get_store_customer_support_email(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select ss.value #>> '{}'
      from public.stores s
      left join public.store_settings ss
        on ss.store_id = s.id and ss.setting_key = 'customer_support_email'
     where s.id = p_store_id and s.status = 'active'
$$;

create or replace function public.set_store_customer_support_email(p_store_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text := nullif(btrim(p_email), '');
begin
    if public.current_user_id() is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to change this store setting.';
    end if;
    if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception 'Enter a valid support email address.';
    end if;

    insert into public.store_settings (store_id, setting_key, value, updated_at)
    values (p_store_id, 'customer_support_email', coalesce(to_jsonb(v_email), 'null'::jsonb), now())
    on conflict (store_id, setting_key) do update
       set value = excluded.value, updated_at = now();
    return v_email;
end;
$$;

revoke all on function public.get_store_customer_support_email(uuid) from public;
grant execute on function public.get_store_customer_support_email(uuid) to anon, authenticated;
revoke all on function public.set_store_customer_support_email(uuid, text) from public, anon;
grant execute on function public.set_store_customer_support_email(uuid, text) to authenticated;
