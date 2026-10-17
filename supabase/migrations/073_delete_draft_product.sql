create or replace function public.delete_draft_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_store_id uuid;
    v_status text;
begin
    select p.store_id, p.status
      into v_store_id, v_status
      from public.products as p
     where p.id = p_product_id
     for update;

    if not found then
        raise exception 'Draft product not found.' using errcode = 'P0002';
    end if;

    if not public.is_store_member(v_store_id) then
        raise exception 'Only store members can delete products.' using errcode = '42501';
    end if;

    if v_status <> 'draft' then
        raise exception 'Only draft products can be deleted.' using errcode = '22023';
    end if;

    if exists (
        select 1
          from public.product_variants as v
         where v.store_id = v_store_id
           and v.product_id = p_product_id
           and (
               exists (
                   select 1 from public.order_items as oi
                    where oi.store_id = v.store_id and oi.variant_id = v.id
               )
               or exists (
                   select 1 from public.inventory_movements as im
                    where im.store_id = v.store_id and im.variant_id = v.id
               )
               or exists (
                   select 1 from public.inventory_reservations as ir
                    where ir.store_id = v.store_id and ir.variant_id = v.id
               )
               or exists (
                   select 1 from public.inventory_levels as il
                    where il.store_id = v.store_id and il.variant_id = v.id
                      and (il.on_hand > 0 or il.reserved > 0)
               )
           )
    ) then
        raise exception 'Product has order or inventory history and cannot be deleted.' using errcode = '23503';
    end if;

    delete from public.products as p
     where p.id = p_product_id
       and p.store_id = v_store_id
       and p.status = 'draft';
end;
$$;

revoke all on function public.delete_draft_product(uuid) from public, anon;
grant execute on function public.delete_draft_product(uuid) to authenticated;
