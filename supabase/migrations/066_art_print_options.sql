-- Tag existing catalogue variants as originals; admins can configure print variants
-- in the product editor and price every size/material combination independently.
update public.product_variants
set option_values = option_values || jsonb_build_object('sale_type', 'original')
where not (option_values ? 'sale_type');

create unique index if not exists uq_product_variant_print_option
    on public.product_variants (store_id, product_id, (option_values ->> 'print_size'), (option_values ->> 'print_material'))
    where option_values ->> 'sale_type' = 'print';

create or replace function public.enforce_art_cart_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_options jsonb;
    v_sale_type text;
    v_original_enabled boolean;
    v_printable_enabled boolean;
begin
    select v.option_values,
           coalesce((p.metadata #>> '{sale_options,original_enabled}')::boolean, true),
           coalesce((p.metadata #>> '{sale_options,printable_enabled}')::boolean, false)
      into v_options, v_original_enabled, v_printable_enabled
      from public.product_variants v
      join public.products p on p.id = v.product_id and p.store_id = v.store_id
     where v.id = new.variant_id and v.store_id = new.store_id;

    if not found then
        return new;
    end if;

    v_sale_type := coalesce(v_options ->> 'sale_type', 'original');
    if v_sale_type = 'original' and not v_original_enabled then
        raise exception 'Original artwork is not currently available for this product.';
    end if;
    if v_sale_type = 'original' and new.quantity > 1 then
        raise exception 'Original artwork is limited to one per cart line.';
    end if;
    if v_sale_type = 'print' and not v_printable_enabled then
        raise exception 'Print options are not currently available for this product.';
    end if;
    if v_sale_type not in ('original', 'print') then
        raise exception 'This product option is not available.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_cart_items_art_options on public.cart_items;
create trigger trg_cart_items_art_options
before insert or update of variant_id, quantity, store_id on public.cart_items
for each row execute function public.enforce_art_cart_options();

drop trigger if exists trg_order_items_art_options on public.order_items;
create trigger trg_order_items_art_options
before insert or update of variant_id, quantity, store_id on public.order_items
for each row execute function public.enforce_art_cart_options();

revoke all on function public.enforce_art_cart_options() from public, anon, authenticated;
