insert into public.permissions(code,description) values
('store.manage','Manage store settings'),('catalog.manage','Manage products and categories'),('inventory.manage','Manage inventory'),('orders.manage','Manage orders'),('customers.manage','Manage customers'),('marketing.manage','Manage marketing'),('reviews.moderate','Moderate reviews'),('reports.read','Read reports'),('platform.manage','Manage platform')
on conflict(code) do nothing;
insert into public.roles(name,scope,description) values ('owner','store','Store owner'),('admin','store','Store administrator'),('platform_admin','platform','Platform administrator') on conflict(name,scope) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (r.name='owner' and r.scope='store') or (r.name='platform_admin' and r.scope='platform')
on conflict(role_id,permission_id) do nothing;
