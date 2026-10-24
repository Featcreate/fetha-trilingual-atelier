-- Roles
create type public.app_role as enum ('admin', 'user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price_millimes integer not null check (price_millimes > 0),
  image_path text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Anyone reads active products" on public.products for select to anon, authenticated using (is_active);
create policy "Admins read all products" on public.products for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins insert products" on public.products for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update products" on public.products for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete products" on public.products for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create table public.product_files (
  product_id uuid primary key references public.products(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.product_files to authenticated;
grant all on public.product_files to service_role;
alter table public.product_files enable row level security;
create policy "Admins manage product files" on public.product_files for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  customer_email text,
  status public.order_status not null default 'pending',
  total_millimes integer not null check (total_millimes > 0),
  currency text not null default 'TND',
  checkout_key text not null,
  konnect_payment_ref text unique,
  paid_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkout_key)
);
create index orders_user_idx on public.orders(user_id, created_at desc);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "Customers read own orders" on public.orders for select to authenticated using (user_id = auth.uid());
create policy "Admins read all orders" on public.orders for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price_millimes integer not null check (unit_price_millimes > 0),
  unique (order_id, product_id)
);
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "Customers read own order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "Admins read all order items" on public.order_items for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  payment_ref text not null,
  source text not null,
  konnect_status text,
  outcome text not null,
  created_at timestamptz not null default now()
);
grant select on public.payment_events to authenticated;
grant all on public.payment_events to service_role;
alter table public.payment_events enable row level security;
create policy "Admins read payment events" on public.payment_events for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.create_order(_product_ids uuid[], _checkout_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _existing uuid;
  _order uuid;
  _count int;
  _found int;
  _total int;
begin
  if _uid is null then raise exception 'not_authenticated'; end if;
  if _checkout_key is null or length(_checkout_key) < 8 or length(_checkout_key) > 100 then raise exception 'invalid_checkout_key'; end if;
  select id into _existing from orders where user_id = _uid and checkout_key = _checkout_key;
  if _existing is not null then return _existing; end if;

  select count(distinct x) into _count from unnest(_product_ids) x;
  if _count = 0 or _count > 50 then raise exception 'invalid_cart'; end if;
  select count(*), coalesce(sum(price_millimes), 0) into _found, _total
    from products p
    where p.id = any(_product_ids) and p.is_active
      and exists (select 1 from product_files f where f.product_id = p.id);
  if _found <> _count then raise exception 'product_unavailable'; end if;

  insert into orders (user_id, customer_email, total_millimes, checkout_key)
  values (_uid, (select email from auth.users where id = _uid), _total, _checkout_key)
  returning id into _order;
  insert into order_items (order_id, product_id, product_name, unit_price_millimes)
  select _order, p.id, p.name, p.price_millimes from products p where p.id = any(_product_ids);
  return _order;
end $$;
revoke all on function public.create_order(uuid[], text) from public, anon;
grant execute on function public.create_order(uuid[], text) to authenticated;

create policy "Anyone reads product images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "Admins upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins manage product files objects" on storage.objects for all to authenticated
  using (bucket_id = 'product-files' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'product-files' and public.has_role(auth.uid(), 'admin'));