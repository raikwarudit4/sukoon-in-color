-- Owners may manage existing, verified Supabase Auth accounts as store admins
-- or owners. No invitations are sent by this feature.
create or replace function public.list_store_team_members(target_store uuid)
returns table (
    email text,
    first_name text,
    last_name text,
    membership_status text,
    roles text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.has_store_permission(target_store, 'store.manage') then
        raise exception 'Only store owners can view team access.' using errcode = '42501';
    end if;

    return query
    select au.email::text,
           u.first_name::text,
           u.last_name::text,
           m.status::text,
           coalesce(array_agg(r.name::text order by r.name::text)
                    filter (where r.name is not null), '{}'::text[])
      from public.store_memberships as m
      join public.users as u on u.id = m.user_id
      join auth.users as au on au.id = u.auth_user_id
      left join public.user_roles as ur
        on ur.user_id = u.id and ur.store_id = m.store_id
      left join public.roles as r
        on r.id = ur.role_id and r.scope = 'store'
     where m.store_id = target_store
     group by au.email, u.first_name, u.last_name, m.status
     order by coalesce(u.first_name, ''), coalesce(u.last_name, ''), au.email;
end;
$$;

create or replace function public.set_store_member_role(
    p_store_id uuid,
    p_email text,
    p_role_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_target_user_id uuid;
    v_owner_role_id uuid;
    v_target_role_id uuid;
    v_active_owner_count integer;
begin
    v_user_id := public.current_user_id();
    if v_user_id is null
       or not public.has_store_permission(p_store_id, 'store.manage') then
        raise exception 'Only store owners can change team access.' using errcode = '42501';
    end if;

    -- Serialize role changes for this store so two concurrent requests cannot
    -- both demote the last two owners based on the same stale count.
    perform 1 from public.stores as s where s.id = p_store_id for update;
    if not found then
        raise exception 'Store not found.' using errcode = 'P0002';
    end if;

    -- Recheck after taking the store lock: another owner may have changed this
    -- caller's role while this request was waiting for the lock.
    if not public.has_store_permission(p_store_id, 'store.manage') then
        raise exception 'Only store owners can change team access.' using errcode = '42501';
    end if;

    if p_email is null or length(btrim(p_email)) > 254
       or btrim(p_email) !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'Enter a valid account email address.' using errcode = '22023';
    end if;
    if p_role_name is not null and p_role_name not in ('admin', 'owner') then
        raise exception 'Choose admin, owner, or remove access.' using errcode = '22023';
    end if;

    select u.id
      into v_target_user_id
      from auth.users as au
      join public.users as u on u.auth_user_id = au.id
     where lower(au.email) = lower(btrim(p_email))
       and au.email_confirmed_at is not null
       and u.status = 'active'
     limit 1;
    if v_target_user_id is null then
        raise exception 'That email must belong to an existing account with a verified email and active profile.' using errcode = 'P0002';
    end if;
    if v_target_user_id = v_user_id then
        raise exception 'Use another owner account to change your own access.' using errcode = '22023';
    end if;

    select r.id into v_owner_role_id
      from public.roles as r
     where r.name = 'owner' and r.scope = 'store';

    if p_role_name is null or p_role_name = 'admin' then
        select count(*)::integer
          into v_active_owner_count
          from public.store_memberships as m
          join public.user_roles as ur
            on ur.user_id = m.user_id and ur.store_id = m.store_id
          join public.roles as r
            on r.id = ur.role_id and r.scope = 'store' and r.name = 'owner'
         where m.store_id = p_store_id
           and m.status = 'active'
           and m.user_id <> v_target_user_id;

        if exists (
            select 1
              from public.store_memberships as m
              join public.user_roles as ur
                on ur.user_id = m.user_id and ur.store_id = m.store_id
             where m.store_id = p_store_id
               and m.user_id = v_target_user_id
               and m.status = 'active'
               and ur.role_id = v_owner_role_id
        ) and v_active_owner_count = 0 then
            raise exception 'The last active owner cannot be demoted or removed.' using errcode = '23514';
        end if;
    end if;

    if p_role_name is null then
        update public.store_memberships
           set status = 'suspended', updated_at = now()
         where store_id = p_store_id and user_id = v_target_user_id;
        delete from public.user_roles as ur
         where ur.user_id = v_target_user_id
           and ur.store_id = p_store_id
           and ur.role_id in (
                select r.id from public.roles as r
                 where r.scope = 'store' and r.name in ('admin', 'owner')
           );
        return 'removed';
    end if;

    select r.id into v_target_role_id
      from public.roles as r
     where r.name = p_role_name and r.scope = 'store';
    if v_target_role_id is null then
        raise exception 'The requested store role is not configured.' using errcode = 'P0002';
    end if;

    insert into public.store_memberships (store_id, user_id, status)
    values (p_store_id, v_target_user_id, 'active')
    on conflict (store_id, user_id) do update
       set status = 'active', updated_at = now();

    delete from public.user_roles as ur
     where ur.user_id = v_target_user_id
       and ur.store_id = p_store_id
       and ur.role_id in (
            select r.id from public.roles as r
             where r.scope = 'store' and r.name in ('admin', 'owner')
       );

    insert into public.user_roles (user_id, role_id, store_id)
    values (v_target_user_id, v_target_role_id, p_store_id)
    on conflict do nothing;

    return 'assigned_' || p_role_name;
end;
$$;

revoke all on function public.list_store_team_members(uuid) from public, anon;
grant execute on function public.list_store_team_members(uuid) to authenticated;
revoke all on function public.set_store_member_role(uuid, text, text) from public, anon;
grant execute on function public.set_store_member_role(uuid, text, text) to authenticated;
