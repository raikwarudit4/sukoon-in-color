-- Prevent store staff from shipping online orders before a captured payment is
-- recorded in public.payments. The trigger also protects direct RPC/API calls.
create or replace function public.require_captured_razorpay_payment_before_ship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'shipped'
       and old.status is distinct from new.status
       and exists (
           select 1
             from public.payments p
            where p.store_id = new.store_id
              and p.order_id = new.id
              and p.provider = 'razorpay'
              and p.status <> 'captured'
       ) then
        raise exception 'Razorpay payment must be captured before shipping this order.';
    end if;
    return new;
end;
$$;

revoke all on function public.require_captured_razorpay_payment_before_ship() from public, anon, authenticated;

drop trigger if exists trg_orders_require_captured_payment on public.orders;
create trigger trg_orders_require_captured_payment
before update of status on public.orders
for each row execute function public.require_captured_razorpay_payment_before_ship();
