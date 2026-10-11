-- Private photo storage for return evidence, limited to 3 images of 5 MiB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('return-evidence', 'return-evidence', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

alter table public.returns
    add column evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 3);

create or replace function public.get_store_returns_enabled(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((ss.value #>> '{}')::boolean, true)
      from public.stores s
      left join public.store_settings ss
        on ss.store_id = s.id and ss.setting_key = 'returns_enabled'
     where s.id = p_store_id and s.status = 'active'
$$;

create or replace function public.set_store_returns_enabled(p_store_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.current_user_id() is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to change this store setting.';
    end if;
    if p_enabled is null then raise exception 'Choose whether returns are enabled.'; end if;

    insert into public.store_settings (store_id, setting_key, value, updated_at)
    values (p_store_id, 'returns_enabled', to_jsonb(p_enabled), now())
    on conflict (store_id, setting_key) do update
       set value = excluded.value, updated_at = now();
    return p_enabled;
end;
$$;

revoke all on function public.get_store_returns_enabled(uuid) from public;
grant execute on function public.get_store_returns_enabled(uuid) to authenticated;
revoke all on function public.set_store_returns_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_store_returns_enabled(uuid, boolean) to authenticated;

create policy return_evidence_customer_upload
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'return-evidence'
        and (storage.foldername(name))[1] = public.current_user_id()::text
        and exists (
            select 1 from public.orders o
             where o.id::text = (storage.foldername(name))[2]
               and o.user_id = public.current_user_id()
               and o.status = 'delivered'
               and public.get_store_returns_enabled(o.store_id)
        )
    );

create policy return_evidence_owner_or_store_read
    on storage.objects for select to authenticated
    using (
        bucket_id = 'return-evidence'
        and exists (
            select 1 from public.orders o
             where o.id::text = (storage.foldername(name))[2]
               and (
                    (o.user_id = public.current_user_id()
                     and (storage.foldername(name))[1] = public.current_user_id()::text)
                    or public.is_store_member(o.store_id)
               )
        )
    );

create policy return_evidence_owner_delete
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'return-evidence'
        and (storage.foldername(name))[1] = public.current_user_id()::text
        and exists (
            select 1 from public.orders o
             where o.id::text = (storage.foldername(name))[2]
               and o.user_id = public.current_user_id()
        )
    );

create function public.request_order_return(
    p_order_id uuid,
    p_reason text,
    p_items jsonb,
    p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := public.current_user_id();
    v_store_id uuid;
    v_return_id uuid;
    v_item jsonb;
    v_evidence_path text;
    v_order_item public.order_items%rowtype;
    v_quantity integer;
begin
    if v_user_id is null then raise exception 'Sign in to request a return.'; end if;
    if p_reason is null or length(btrim(p_reason)) < 5 or length(btrim(p_reason)) > 1000 then
        raise exception 'Enter a return reason between 5 and 1000 characters.';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
        raise exception 'Select at least one item to return.';
    end if;
    if p_evidence is null or jsonb_typeof(p_evidence) <> 'array'
       or jsonb_array_length(p_evidence) > 3 then
        raise exception 'Attach no more than three photos.';
    end if;

    select o.store_id into v_store_id
      from public.orders o
     where o.id = p_order_id and o.user_id = v_user_id and o.status = 'delivered'
     for update;
    if not found then raise exception 'Only your delivered orders can be returned.'; end if;
    if not public.get_store_returns_enabled(v_store_id) then
        raise exception 'Return requests are currently disabled by the store.';
    end if;
    if exists (select 1 from public.returns r
                where r.store_id = v_store_id and r.order_id = p_order_id
                  and r.status in ('requested','approved','received')) then
        raise exception 'A return request is already active for this order.';
    end if;

    if exists (
        select 1 from jsonb_array_elements(p_items) as selected(item)
         where jsonb_typeof(selected.item) <> 'object'
            or coalesce(selected.item->>'order_item_id', '') !~* '^[0-9a-f-]{36}$'
            or coalesce(selected.item->>'quantity', '') !~ '^[1-9][0-9]*$'
    ) then raise exception 'Invalid return item selection.'; end if;
    if (select count(distinct selected.item->>'order_item_id')
          from jsonb_array_elements(p_items) as selected(item)) <> jsonb_array_length(p_items) then
        raise exception 'An item can appear only once in a return request.';
    end if;

    for v_item in select value from jsonb_array_elements(p_evidence)
    loop
        if jsonb_typeof(v_item) <> 'string' then raise exception 'Invalid return photo.'; end if;
        v_evidence_path := v_item #>> '{}';
        if v_evidence_path !~ ('^' || v_user_id::text || '/' || p_order_id::text || '/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$')
           or not exists (select 1 from storage.objects so
                           where so.bucket_id = 'return-evidence' and so.name = v_evidence_path) then
            raise exception 'A return photo is invalid or unavailable. Please upload it again.';
        end if;
    end loop;

    insert into public.returns(store_id, order_id, user_id, reason, evidence)
    values (v_store_id, p_order_id, v_user_id, btrim(p_reason), p_evidence)
    returning id into v_return_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_quantity := (v_item->>'quantity')::integer;
        select oi.* into v_order_item
          from public.order_items oi
         where oi.id = (v_item->>'order_item_id')::uuid
           and oi.store_id = v_store_id and oi.order_id = p_order_id;
        if not found or v_quantity > v_order_item.quantity then
            raise exception 'A selected item or quantity does not match this order.';
        end if;
        insert into public.return_items(store_id, return_id, order_item_id, quantity)
        values (v_store_id, v_return_id, v_order_item.id, v_quantity);
    end loop;
    return v_return_id;
end;
$$;

revoke all on function public.request_order_return(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.request_order_return(uuid, text, jsonb, jsonb) to authenticated;

-- Keep the original signature working for the currently deployed Netlify app.
create or replace function public.request_order_return(
    p_order_id uuid,
    p_reason text,
    p_items jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
    select public.request_order_return(p_order_id, p_reason, p_items, '[]'::jsonb)
$$;

revoke all on function public.request_order_return(uuid, text, jsonb) from public, anon;
grant execute on function public.request_order_return(uuid, text, jsonb) to authenticated;
