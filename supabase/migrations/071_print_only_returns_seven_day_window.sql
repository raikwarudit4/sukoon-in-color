-- Preserve the sale type and actual delivery time so return eligibility is durable.
alter table public.order_items
  add column sale_type_snapshot text not null default 'original'
  check (sale_type_snapshot in ('original', 'print'));

update public.order_items oi
   set sale_type_snapshot = case
     when pv.option_values ->> 'sale_type' = 'print' then 'print'
     else 'original'
   end
  from public.product_variants pv
 where pv.id = oi.variant_id;

alter table public.orders add column delivered_at timestamptz;

update public.orders o
   set delivered_at = (
     select max(sh.delivered_at)
       from public.shipments sh
      where sh.store_id = o.store_id and sh.order_id = o.id
        and sh.delivered_at is not null
   )
 where o.status = 'delivered'
   and exists (
     select 1 from public.shipments sh
      where sh.store_id = o.store_id and sh.order_id = o.id
        and sh.delivered_at is not null
   );

create or replace function public.set_order_delivery_timestamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then
    select sh.delivered_at into new.delivered_at
      from public.shipments sh
     where sh.store_id = new.store_id and sh.order_id = new.id and sh.delivered_at is not null
     order by sh.delivered_at desc
     limit 1;
    new.delivered_at := coalesce(new.delivered_at, now());
  elsif tg_op = 'UPDATE' and old.status = 'delivered' and new.status = 'delivered' then
    new.delivered_at := coalesce(old.delivered_at, new.delivered_at);
  end if;
  return new;
end;
$$;

create trigger orders_set_delivery_timestamp_insert
before insert on public.orders
for each row execute function public.set_order_delivery_timestamp();

create trigger orders_set_delivery_timestamp_update
before update of status on public.orders
for each row execute function public.set_order_delivery_timestamp();

create or replace function public.set_order_item_sale_type_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select case when pv.option_values ->> 'sale_type' = 'print' then 'print' else 'original' end
    into new.sale_type_snapshot
    from public.product_variants pv
   where pv.store_id = new.store_id and pv.id = new.variant_id;
  new.sale_type_snapshot := coalesce(new.sale_type_snapshot, 'original');
  return new;
end;
$$;

create trigger order_items_set_sale_type_snapshot
before insert or update of variant_id, store_id on public.order_items
for each row execute function public.set_order_item_sale_type_snapshot();

create or replace function public.can_request_printable_order_return(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.orders o
     where o.id = p_order_id
       and o.user_id = public.current_user_id()
       and o.status = 'delivered'
       and o.delivered_at is not null
       and now() >= o.delivered_at
       and now() <= o.delivered_at + interval '7 days'
       and public.get_store_returns_enabled(o.store_id)
       and exists (
         select 1 from public.order_items oi
          where oi.store_id = o.store_id and oi.order_id = o.id
            and oi.sale_type_snapshot = 'print'
       )
  )
$$;

revoke all on function public.can_request_printable_order_return(uuid) from public, anon;
grant execute on function public.can_request_printable_order_return(uuid) to authenticated;

create or replace function public.enforce_printable_return_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_request_printable_order_return(new.order_id) then
    raise exception 'Returns are available only for delivered printable items within 7 days of delivery.';
  end if;
  return new;
end;
$$;

create trigger returns_require_eligible_print_order
before insert on public.returns
for each row execute function public.enforce_printable_return_order();

create or replace function public.enforce_printable_return_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_sale_type text;
  v_ordered_quantity integer;
begin
  select r.order_id into v_order_id
    from public.returns r
   where r.id = new.return_id and r.store_id = new.store_id;
  select oi.sale_type_snapshot, oi.quantity into v_sale_type, v_ordered_quantity
    from public.order_items oi
   where oi.id = new.order_item_id and oi.store_id = new.store_id and oi.order_id = v_order_id;
  if not found or v_sale_type <> 'print' or new.quantity > v_ordered_quantity then
    raise exception 'Only purchased printable items, up to the purchased quantity, can be returned.';
  end if;
  if not public.can_request_printable_order_return(v_order_id) then
    raise exception 'Returns are available only within 7 days of delivery.';
  end if;
  return new;
end;
$$;

create trigger return_items_require_printable_order_item
before insert or update on public.return_items
for each row execute function public.enforce_printable_return_item();

drop policy if exists return_evidence_customer_upload on storage.objects;
create policy return_evidence_customer_upload
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'return-evidence'
        and (storage.foldername(name))[1] = public.current_user_id()::text
        and public.can_request_printable_order_return(((storage.foldername(name))[2])::uuid)
    );
