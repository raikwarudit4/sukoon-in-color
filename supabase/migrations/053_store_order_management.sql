-- Store members can read orders and change their lifecycle only through the
-- validated RPC below, which keeps inventory reservations in sync.
grant select on public.orders, public.order_events, public.order_items, public.order_addresses, public.inventory_reservations to authenticated;
revoke update on public.orders from public, anon, authenticated;

create or replace function public.manage_store_order(
    p_store_id uuid,
    p_order_id uuid,
    p_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_id uuid := public.current_user_id();
    v_status text;
    v_order_number text;
    v_next_status text;
    v_note text;
    v_reservation record;
    v_bad_reservations boolean;
    v_payment_id uuid;
begin
    if v_actor_id is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to manage this store''s orders.';
    end if;

    select o.status, o.order_number
      into v_status, v_order_number
      from public.orders o
     where o.id = p_order_id and o.store_id = p_store_id
     for update;
    if not found then raise exception 'Order not found.'; end if;

    if p_action = 'confirm' and v_status = 'pending' then
        v_next_status := 'confirmed';
        v_note := 'Order confirmed by store.';
    elsif p_action = 'process' and v_status = 'confirmed' then
        v_next_status := 'processing';
        v_note := 'Order processing started.';
    elsif p_action = 'ship' and v_status = 'processing' then
        select exists (
            select 1
              from public.order_items oi
              left join (
                  select ir.variant_id, sum(ir.quantity)::integer as quantity
                    from public.inventory_reservations ir
                   where ir.store_id = p_store_id
                     and ir.order_id = p_order_id
                     and ir.status = 'reserved'
                   group by ir.variant_id
              ) reserved on reserved.variant_id = oi.variant_id
             where oi.store_id = p_store_id
               and oi.order_id = p_order_id
               and coalesce(reserved.quantity, 0) <> oi.quantity
        ) into v_bad_reservations;
        if v_bad_reservations then
            raise exception 'The order no longer has a complete inventory reservation.';
        end if;

        for v_reservation in
            select ir.id, ir.location_id, ir.variant_id, ir.quantity
              from public.inventory_reservations ir
             where ir.store_id = p_store_id
               and ir.order_id = p_order_id
               and ir.status = 'reserved'
             order by ir.variant_id, ir.location_id
             for update
        loop
            update public.inventory_levels il
               set on_hand = il.on_hand - v_reservation.quantity,
                   reserved = il.reserved - v_reservation.quantity,
                   updated_at = now()
             where il.store_id = p_store_id
               and il.location_id = v_reservation.location_id
               and il.variant_id = v_reservation.variant_id
               and il.on_hand >= v_reservation.quantity
               and il.reserved >= v_reservation.quantity;
            if not found then raise exception 'Inventory changed before the order could ship.'; end if;

            insert into public.inventory_movements
                (store_id, location_id, variant_id, quantity_delta, reason, reference, actor_user_id)
            values
                (p_store_id, v_reservation.location_id, v_reservation.variant_id,
                 -v_reservation.quantity, 'order_fulfilled', v_order_number, v_actor_id);

            update public.inventory_reservations
               set status = 'committed', updated_at = now()
             where id = v_reservation.id;
        end loop;
        v_next_status := 'shipped';
        v_note := 'Order shipped; reserved inventory committed.';
    elsif p_action = 'deliver' and v_status = 'shipped' then
        update public.payments
           set status = 'captured', updated_at = now()
         where store_id = p_store_id
           and order_id = p_order_id
           and provider = 'cash_on_delivery'
           and status = 'pending'
        returning id into v_payment_id;
        if not found then raise exception 'No pending cash-on-delivery payment was found.'; end if;

        insert into public.payment_events (payment_id, event_key, event_type, payload, processed_at)
        values (v_payment_id, 'cod-cash-collected:' || p_order_id::text,
                'cash_collected', '{"source":"store_order_management"}'::jsonb, now())
        on conflict (event_key) do nothing;

        v_next_status := 'delivered';
        v_note := 'Delivered; store recorded cash as collected.';
    elsif p_action = 'expire'
          and v_status in ('pending', 'confirmed', 'processing')
          and exists (
              select 1 from public.inventory_reservations ir
               where ir.store_id = p_store_id and ir.order_id = p_order_id
                 and ir.status = 'reserved' and ir.expires_at <= now()
          )
          and not exists (
              select 1 from public.inventory_reservations ir
               where ir.store_id = p_store_id and ir.order_id = p_order_id
                 and ir.status = 'reserved' and ir.expires_at > now()
          ) then
        for v_reservation in
            select ir.id, ir.location_id, ir.variant_id, ir.quantity
              from public.inventory_reservations ir
             where ir.store_id = p_store_id
               and ir.order_id = p_order_id
               and ir.status = 'reserved'
             order by ir.variant_id, ir.location_id
             for update
        loop
            update public.inventory_levels il
               set reserved = il.reserved - v_reservation.quantity,
                   updated_at = now()
             where il.store_id = p_store_id
               and il.location_id = v_reservation.location_id
               and il.variant_id = v_reservation.variant_id
               and il.reserved >= v_reservation.quantity;
            if not found then raise exception 'Could not safely release the expired inventory.'; end if;

            update public.inventory_reservations
               set status = 'expired', updated_at = now()
             where id = v_reservation.id;
        end loop;
        update public.payments
           set status = 'cancelled', updated_at = now()
         where store_id = p_store_id and order_id = p_order_id and status = 'pending';
        v_next_status := 'cancelled';
        v_note := 'Reservation expired; stock released and order cancelled.';
    elsif p_action = 'cancel' and v_status in ('pending', 'confirmed', 'processing') then
        for v_reservation in
            select ir.id, ir.location_id, ir.variant_id, ir.quantity
              from public.inventory_reservations ir
             where ir.store_id = p_store_id
               and ir.order_id = p_order_id
               and ir.status = 'reserved'
             order by ir.variant_id, ir.location_id
             for update
        loop
            update public.inventory_levels il
               set reserved = il.reserved - v_reservation.quantity,
                   updated_at = now()
             where il.store_id = p_store_id
               and il.location_id = v_reservation.location_id
               and il.variant_id = v_reservation.variant_id
               and il.reserved >= v_reservation.quantity;
            if not found then raise exception 'Could not safely release the reserved inventory.'; end if;

            update public.inventory_reservations
               set status = 'released', updated_at = now()
             where id = v_reservation.id;
        end loop;

        update public.payments
           set status = 'cancelled', updated_at = now()
         where store_id = p_store_id and order_id = p_order_id and status = 'pending';
        v_next_status := 'cancelled';
        v_note := 'Order cancelled; reserved inventory released.';
    else
        raise exception 'This order cannot perform the requested action.';
    end if;

    update public.orders
       set status = v_next_status, updated_at = now()
     where id = p_order_id and store_id = p_store_id;

    insert into public.order_events (store_id, order_id, from_status, to_status, note, actor_user_id)
    values (p_store_id, p_order_id, v_status, v_next_status, v_note, v_actor_id);

    return v_next_status;
end;
$$;

revoke all on function public.manage_store_order(uuid, uuid, text) from public, anon;
grant execute on function public.manage_store_order(uuid, uuid, text) to authenticated;
