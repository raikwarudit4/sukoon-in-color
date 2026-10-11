-- Customer return requests are created atomically through the RPC below.
-- Customers can read only their own requests; store staff retain their existing
-- store-scoped management access.
create policy returns_customer_read
    on public.returns for select to authenticated
    using (user_id = public.current_user_id());

create policy return_items_customer_read
    on public.return_items for select to authenticated
    using (exists (
        select 1 from public.returns r
         where r.id = return_items.return_id
           and r.store_id = return_items.store_id
           and r.user_id = public.current_user_id()
    ));

grant select on public.returns, public.return_items to authenticated;

create or replace function public.request_order_return(
    p_order_id uuid,
    p_reason text,
    p_items jsonb
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

    select o.store_id into v_store_id
      from public.orders o
     where o.id = p_order_id and o.user_id = v_user_id and o.status = 'delivered'
     for update;
    if not found then raise exception 'Only your delivered orders can be returned.'; end if;

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

    insert into public.returns(store_id, order_id, user_id, reason)
    values (v_store_id, p_order_id, v_user_id, btrim(p_reason))
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

revoke all on function public.request_order_return(uuid, text, jsonb) from public, anon;
grant execute on function public.request_order_return(uuid, text, jsonb) to authenticated;

 grant update (status) on public.returns to authenticated;
