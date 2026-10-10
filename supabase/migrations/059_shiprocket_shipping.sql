-- Persist the Shiprocket hand-off separately from the store's order lifecycle.
alter table public.shipments
    add column if not exists provider text,
    add column if not exists provider_order_reference text,
    add column if not exists provider_order_id text,
    add column if not exists provider_shipment_id text,
    add column if not exists provider_status text,
    add column if not exists tracking_url text,
    add column if not exists tracking_updated_at timestamptz;

alter table public.shipments
    add constraint shipments_provider_check
    check (provider is null or provider in ('shiprocket'));

create unique index if not exists uq_shipments_store_provider_order
    on public.shipments(store_id, provider_order_reference)
    where provider_order_reference is not null;
create unique index if not exists uq_shipments_one_shiprocket_order
    on public.shipments(store_id, order_id)
    where provider = 'shiprocket';
create unique index if not exists uq_shipments_store_provider_awb
    on public.shipments(store_id, provider, tracking_number)
    where provider is not null and tracking_number is not null;
create unique index if not exists uq_shipments_store_id
    on public.shipments(store_id, id);

create table public.shipment_events (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null,
    order_id uuid not null,
    shipment_id uuid not null,
    provider_event_key text not null unique,
    status text not null,
    detail text,
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    foreign key (store_id, order_id) references public.orders(store_id, id) on delete cascade,
    foreign key (store_id, shipment_id) references public.shipments(store_id, id) on delete cascade
);

create index shipment_events_order_timeline_idx
    on public.shipment_events(store_id, order_id, occurred_at desc);

alter table public.shipment_events enable row level security;
create policy shipment_events_store_read on public.shipment_events
    for select to authenticated using (public.is_store_member(store_id));
create policy shipment_events_customer_read on public.shipment_events
    for select to authenticated using (
        exists (
            select 1 from public.orders o
             where o.id = shipment_events.order_id
               and o.store_id = shipment_events.store_id
               and o.user_id = public.current_user_id()
        )
    );

create policy shipments_customer_read on public.shipments
    for select to authenticated using (
        exists (
            select 1 from public.orders o
             where o.id = shipments.order_id
               and o.store_id = shipments.store_id
               and o.user_id = public.current_user_id()
        )
    );

grant select, insert, update on public.shipments to authenticated;
grant select on public.shipment_events to authenticated;
revoke insert, update, delete on public.shipment_events from public, anon, authenticated;
grant insert, update, delete on public.shipment_events to service_role;
