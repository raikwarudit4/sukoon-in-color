-- Inventory changes must update stock and its audit movement atomically.
-- Direct API writes to these tables are disabled for client roles.
revoke insert, update, delete on table public.inventory_levels from public, anon, authenticated;
grant select on table public.inventory_levels to authenticated;

revoke insert, update, delete on table public.inventory_movements from public, anon, authenticated;
grant select on table public.inventory_movements to authenticated;

create or replace function public.adjust_store_inventory(
    p_store_id uuid,
    p_location_id uuid,
    p_variant_id uuid,
    p_quantity_delta integer,
    p_reason text,
    p_note text default null
)
returns table(on_hand integer, reserved integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_id uuid := public.current_user_id();
    v_on_hand integer;
    v_reserved integer;
    v_next_on_hand integer;
begin
    if v_actor_id is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to adjust this store''s inventory.';
    end if;
    if p_quantity_delta is null or p_quantity_delta = 0
       or p_quantity_delta < -100000 or p_quantity_delta > 100000 then
        raise exception 'Enter a stock adjustment between -100,000 and 100,000, excluding zero.';
    end if;
    if p_reason is null or p_reason not in ('stock_restock', 'stock_correction', 'stock_damaged') then
        raise exception 'Choose a valid stock adjustment reason.';
    end if;
    if length(coalesce(p_note, '')) > 200 then
        raise exception 'The stock adjustment note is too long.';
    end if;
    if not exists (
        select 1 from public.inventory_locations l
         where l.id = p_location_id and l.store_id = p_store_id and l.is_active
    ) then
        raise exception 'This inventory location is unavailable.';
    end if;
    if not exists (
        select 1 from public.product_variants v
         where v.id = p_variant_id and v.store_id = p_store_id
    ) then
        raise exception 'This product variant is unavailable.';
    end if;

    insert into public.inventory_levels (store_id, location_id, variant_id, on_hand, reserved)
    values (p_store_id, p_location_id, p_variant_id, 0, 0)
    on conflict (location_id, variant_id) do nothing;

    select il.on_hand, il.reserved
      into v_on_hand, v_reserved
      from public.inventory_levels il
     where il.store_id = p_store_id
       and il.location_id = p_location_id
       and il.variant_id = p_variant_id
     for update;

    v_next_on_hand := v_on_hand + p_quantity_delta;
    if v_next_on_hand < v_reserved then
        raise exception 'Stock cannot be reduced below the quantity reserved for open orders.';
    end if;

    update public.inventory_levels il
       set on_hand = v_next_on_hand, updated_at = now()
     where il.store_id = p_store_id
       and il.location_id = p_location_id
       and il.variant_id = p_variant_id;

    insert into public.inventory_movements (
        store_id, location_id, variant_id, quantity_delta, reason, reference, actor_user_id
    )
    values (
        p_store_id, p_location_id, p_variant_id, p_quantity_delta,
        p_reason, nullif(btrim(p_note), ''), v_actor_id
    );

    return query select v_next_on_hand, v_reserved;
end;
$$;

revoke all on function public.adjust_store_inventory(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_store_inventory(uuid, uuid, uuid, integer, text, text) to authenticated;
