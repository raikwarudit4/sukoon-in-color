-- Authenticated Razorpay checkout. Order totals and stock reservations are still
-- calculated atomically by place_cod_order; this wrapper changes only provider.
create or replace function public.place_razorpay_order(
    p_store_id uuid,
    p_idempotency_key text,
    p_recipient_name text,
    p_phone text,
    p_address_line1 text,
    p_address_line2 text,
    p_locality text,
    p_city text,
    p_region text,
    p_postal_code text,
    p_country_code text default 'IN'
)
returns table(order_id uuid, payment_id uuid, amount_minor bigint, currency character(3), order_number text, provider_order_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order_id uuid;
    v_user_id uuid := public.current_user_id();
begin
    if v_user_id is null then raise exception 'Sign in to place an order.'; end if;

    v_order_id := public.place_cod_order(
        p_store_id, p_idempotency_key, p_recipient_name, p_phone,
        p_address_line1, p_address_line2, p_locality, p_city,
        p_region, p_postal_code, p_country_code
    );

    update public.payments p
       set provider = 'razorpay',
           metadata = coalesce(p.metadata, '{}'::jsonb) - 'collection'
     where p.store_id = p_store_id
       and p.order_id = v_order_id
       and p.provider = 'cash_on_delivery'
       and exists (select 1 from public.orders o where o.id = v_order_id and o.user_id = v_user_id);

    return query
    select o.id, p.id, p.amount_minor, p.currency, o.order_number,
           p.metadata->>'provider_order_id'
      from public.orders o
      join public.payments p on p.store_id = o.store_id and p.order_id = o.id
     where o.id = v_order_id
       and o.store_id = p_store_id
       and o.user_id = v_user_id
       and p.provider = 'razorpay'
       and p.status = 'pending';
    if not found then raise exception 'Could not prepare this Razorpay checkout.'; end if;
end;
$$;

create or replace function public.attach_razorpay_order(p_order_id uuid, p_provider_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := public.current_user_id();
    v_existing text;
begin
    if v_user_id is null or p_provider_order_id is null or p_provider_order_id !~ '^order_[A-Za-z0-9]+$' then
        raise exception 'Invalid Razorpay order.';
    end if;
    select p.metadata->>'provider_order_id' into v_existing
      from public.payments p
      join public.orders o on o.store_id = p.store_id and o.id = p.order_id
     where p.order_id = p_order_id and p.provider = 'razorpay'
       and p.status = 'pending' and o.user_id = v_user_id
     for update of p;
    if not found then raise exception 'Payment order not found.'; end if;
    if v_existing is not null and v_existing <> p_provider_order_id then
        raise exception 'A different Razorpay order is already attached.';
    end if;
    update public.payments
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('provider_order_id', p_provider_order_id),
           updated_at = now()
     where order_id = p_order_id and provider = 'razorpay' and status = 'pending';
end;
$$;

create or replace function public.get_razorpay_payment_context(p_order_id uuid)
returns table(payment_id uuid, amount_minor bigint, currency character(3), provider_order_id text, payment_status text, provider_payment_id text)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, p.amount_minor, p.currency,
           p.metadata->>'provider_order_id', p.status, p.provider_payment_id
      from public.payments p
      join public.orders o on o.store_id = p.store_id and o.id = p.order_id
     where p.order_id = p_order_id
       and p.provider = 'razorpay'
       and o.user_id = public.current_user_id()
$$;

create or replace function public.get_customer_payment_summary(p_order_id uuid)
returns table(provider text, status text)
language sql
stable
security definer
set search_path = ''
as $$
    select p.provider, p.status
      from public.payments p
      join public.orders o on o.store_id = p.store_id and o.id = p.order_id
     where p.order_id = p_order_id
       and o.user_id = public.current_user_id()
     limit 1
$$;

create or replace function public.record_razorpay_capture(
    p_order_id uuid,
    p_provider_order_id text,
    p_provider_payment_id text,
    p_amount_minor bigint,
    p_currency text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment public.payments%rowtype;
    v_user_id uuid := public.current_user_id();
begin
    if v_user_id is null then raise exception 'Sign in to verify payment.'; end if;
    select p.* into v_payment
      from public.payments p
      join public.orders o on o.store_id = p.store_id and o.id = p.order_id
     where p.order_id = p_order_id and p.provider = 'razorpay'
       and o.user_id = v_user_id
     for update of p;
    if not found then raise exception 'Payment order not found.'; end if;
    if v_payment.metadata->>'provider_order_id' is distinct from p_provider_order_id
       or v_payment.amount_minor <> p_amount_minor
       or upper(btrim(v_payment.currency::text)) <> upper(btrim(p_currency)) then
        raise exception 'Payment details do not match this order.';
    end if;
    if v_payment.status = 'captured' and v_payment.provider_payment_id = p_provider_payment_id then
        return;
    end if;
    if v_payment.status <> 'pending' then raise exception 'This payment is no longer pending.'; end if;
    if p_provider_payment_id is null or p_provider_payment_id !~ '^pay_[A-Za-z0-9]+$' then
        raise exception 'Invalid Razorpay payment.';
    end if;

    update public.payments
       set status = 'captured', provider_payment_id = p_provider_payment_id,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('captured_at', now()),
           updated_at = now()
     where id = v_payment.id;
    insert into public.payment_events(payment_id, event_key, event_type, payload, processed_at)
    values (v_payment.id, 'razorpay-captured:' || p_provider_payment_id,
            'payment_captured', jsonb_build_object('provider_order_id', p_provider_order_id,
                'provider_payment_id', p_provider_payment_id), now())
    on conflict (event_key) do nothing;
end;
$$;

create or replace function public.deliver_paid_store_order(p_store_id uuid, p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_id uuid := public.current_user_id();
    v_status text;
    v_order_number text;
begin
    if v_actor_id is null or not public.is_store_member(p_store_id) then
        raise exception 'You are not allowed to manage this store''s orders.';
    end if;
    select o.status, o.order_number into v_status, v_order_number
      from public.orders o where o.id = p_order_id and o.store_id = p_store_id for update;
    if not found then raise exception 'Order not found.'; end if;
    if v_status <> 'shipped' or not exists (
        select 1 from public.payments p where p.store_id = p_store_id and p.order_id = p_order_id
          and p.provider = 'razorpay' and p.status = 'captured'
    ) then raise exception 'Only shipped orders with captured online payment can be delivered here.'; end if;
    update public.orders set status = 'delivered', updated_at = now()
     where id = p_order_id and store_id = p_store_id;
    insert into public.order_events(store_id, order_id, from_status, to_status, note, actor_user_id)
    values (p_store_id, p_order_id, v_status, 'delivered', 'Delivered; online payment was already captured.', v_actor_id);
    return 'delivered';
end;
$$;

revoke all on function public.place_razorpay_order(uuid,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.place_razorpay_order(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.attach_razorpay_order(uuid,text) from public, anon;
grant execute on function public.attach_razorpay_order(uuid,text) to authenticated;
revoke all on function public.get_razorpay_payment_context(uuid) from public, anon;
grant execute on function public.get_razorpay_payment_context(uuid) to authenticated;
revoke all on function public.get_customer_payment_summary(uuid) from public, anon;
grant execute on function public.get_customer_payment_summary(uuid) to authenticated;
revoke all on function public.record_razorpay_capture(uuid,text,text,bigint,text) from public, anon;
grant execute on function public.record_razorpay_capture(uuid,text,text,bigint,text) to authenticated;
revoke all on function public.deliver_paid_store_order(uuid,uuid) from public, anon;
grant execute on function public.deliver_paid_store_order(uuid,uuid) to authenticated;
