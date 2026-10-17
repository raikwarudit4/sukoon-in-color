-- Customers can read and create only their own saved checkout addresses.
-- Row ownership is enforced by customer_addresses_owner_all in migration 046.
grant select, insert on table public.customer_addresses to authenticated;
