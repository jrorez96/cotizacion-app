-- =====================================================================
-- Cotizador de eventos · Esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor
-- =====================================================================

-- ---------- Tipos ----------
create type public.pricing_mode  as enum ('fixed', 'per_person', 'per_hour', 'per_unit');
create type public.quote_status  as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.discount_type as enum ('none', 'percent', 'fixed');

-- ---------- Utilidad: updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- TABLAS
-- =====================================================================

-- Configuración y branding del negocio (1 fila por usuario)
create table public.business_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  business_name    text not null default 'Mi salón de eventos',
  logo_path        text,                                   -- ruta en bucket 'branding'
  primary_color    text not null default '#1f2937',
  email            text,
  phone            text,
  address          text,
  currency         text not null default 'CRC',
  tax_rate         numeric(5,2) not null default 13.00 check (tax_rate between 0 and 100),
  deposit_percent  numeric(5,2) not null default 50.00 check (deposit_percent between 0 and 100),
  validity_days    int not null default 15 check (validity_days > 0),
  terms            text not null default
    'Esta cotización tiene una vigencia limitada. La fecha se reserva con el pago del adelanto. Cancelaciones sujetas a política del salón.',
  next_quote_number int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index clients_user_idx on public.clients(user_id);

create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Catálogo de servicios/productos reutilizables
create table public.catalog_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,
  pricing_mode  public.pricing_mode not null default 'fixed',
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index catalog_items_user_idx on public.catalog_items(user_id);

-- Cotizaciones. tax_rate, deposit_percent y terms se "congelan" al crearla.
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number           int not null,                                  -- consecutivo por usuario (lo asigna el trigger)
  client_id        uuid not null references public.clients(id) on delete restrict,
  event_type_id    uuid references public.event_types(id) on delete set null,
  status           public.quote_status not null default 'draft',

  event_date       date,
  start_time       time,
  end_time         time,
  guests           int check (guests is null or guests > 0),

  discount_type    public.discount_type not null default 'none',
  discount_value   numeric(12,2) not null default 0 check (discount_value >= 0),
  tax_rate         numeric(5,2)  check (tax_rate between 0 and 100),
  deposit_percent  numeric(5,2)  check (deposit_percent between 0 and 100),

  -- Totales (los calcula la base de datos)
  subtotal         numeric(12,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0,
  tax_amount       numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  deposit_amount   numeric(12,2) not null default 0,

  valid_until      date,
  notes            text,
  terms            text,
  pdf_path         text,                                          -- ruta en bucket 'quotes'

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, number)
);
create index quotes_user_idx   on public.quotes(user_id, created_at desc);
create index quotes_client_idx on public.quotes(client_id);

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.quotes(id) on delete cascade,
  catalog_item_id  uuid references public.catalog_items(id) on delete set null,
  name             text not null,                                 -- copia congelada del catálogo
  description      text,
  pricing_mode     public.pricing_mode not null default 'fixed',
  unit_price       numeric(12,2) not null check (unit_price >= 0), -- precio congelado
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  line_total       numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
create index quote_items_quote_idx on public.quote_items(quote_id, sort_order);

-- =====================================================================
-- TRIGGERS Y FUNCIONES DE CÁLCULO
-- =====================================================================

-- updated_at
create trigger settings_touch  before update on public.business_settings for each row execute function public.touch_updated_at();
create trigger clients_touch   before update on public.clients           for each row execute function public.touch_updated_at();
create trigger catalog_touch   before update on public.catalog_items     for each row execute function public.touch_updated_at();
create trigger quotes_c_touch  before update on public.quotes            for each row execute function public.touch_updated_at();

-- (a) Al crear una cotización: asigna consecutivo y congela configuración
create or replace function public.quotes_assign_defaults()
returns trigger language plpgsql as $$
declare s public.business_settings;
begin
  select * into s from public.business_settings where user_id = new.user_id;
  if not found then
    raise exception 'No existe business_settings para este usuario';
  end if;

  if new.number is null then
    update public.business_settings
       set next_quote_number = next_quote_number + 1
     where user_id = new.user_id
    returning next_quote_number - 1 into new.number;
  end if;

  new.tax_rate        := coalesce(new.tax_rate, s.tax_rate);
  new.deposit_percent := coalesce(new.deposit_percent, s.deposit_percent);
  new.terms           := coalesce(new.terms, s.terms);
  new.valid_until     := coalesce(new.valid_until, current_date + s.validity_days);
  return new;
end $$;

create trigger quotes_a_defaults
  before insert on public.quotes
  for each row execute function public.quotes_assign_defaults();

-- (b) Calcula descuento, IVA, total y adelanto a partir del subtotal
create or replace function public.quotes_calc_totals()
returns trigger language plpgsql as $$
begin
  new.discount_amount := case new.discount_type
    when 'percent' then round(new.subtotal * new.discount_value / 100, 2)
    when 'fixed'   then least(new.discount_value, new.subtotal)
    else 0
  end;
  new.tax_amount     := round((new.subtotal - new.discount_amount) * new.tax_rate / 100, 2);
  new.total          := new.subtotal - new.discount_amount + new.tax_amount;
  new.deposit_amount := round(new.total * new.deposit_percent / 100, 2);
  return new;
end $$;

create trigger quotes_b_totals
  before insert or update of subtotal, discount_type, discount_value, tax_rate, deposit_percent
  on public.quotes
  for each row execute function public.quotes_calc_totals();

-- Al cambiar los ítems, recalcula el subtotal (el trigger anterior hace el resto)
create or replace function public.quote_items_sync_subtotal()
returns trigger language plpgsql as $$
declare v_id uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
begin
  update public.quotes
     set subtotal = coalesce((select sum(line_total) from public.quote_items where quote_id = v_id), 0)
   where id = v_id;
  return null;
end $$;

create trigger quote_items_sync
  after insert or update or delete on public.quote_items
  for each row execute function public.quote_items_sync_subtotal();

-- Al registrarse un usuario, crea su configuración
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['business_settings','clients','event_types','catalog_items','quotes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner all" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.quote_items enable row level security;
create policy "owner all" on public.quote_items for all to authenticated
  using (exists (select 1 from public.quotes q
                 where q.id = quote_items.quote_id and q.user_id = (select auth.uid())))
  with check (exists (select 1 from public.quotes q
                      where q.id = quote_items.quote_id and q.user_id = (select auth.uid())));

-- =====================================================================
-- STORAGE (buckets privados; archivos en carpeta <user_id>/...)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('branding', 'branding', false), ('quotes', 'quotes', false)
on conflict (id) do nothing;

create policy "owner files" on storage.objects for all to authenticated
  using (bucket_id in ('branding','quotes')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('branding','quotes')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- DATOS DEMO (llamar una vez con el usuario logueado: select seed_demo_data();)
-- =====================================================================
create or replace function public.seed_demo_data()
returns void language plpgsql as $$
begin
  if exists (select 1 from public.catalog_items) then return; end if;

  insert into public.event_types (name)
  values ('Boda'), ('Corporativo'), ('Catering'), ('Cumpleaños')
  on conflict do nothing;

  insert into public.catalog_items (name, category, pricing_mode, unit_price, description) values
    ('Alquiler del salón',        'Espacio',     'fixed',      450000, 'Uso del salón por 6 horas'),
    ('Hora adicional del salón',  'Espacio',     'per_hour',    60000, null),
    ('Menú tres tiempos',         'Alimentación','per_person',  12500, 'Entrada, plato fuerte y postre'),
    ('Barra libre',               'Bebidas',     'per_person',   6000, 'Bebidas nacionales por 4 horas'),
    ('DJ y sonido',               'Música',      'per_hour',    35000, null),
    ('Decoración básica',         'Decoración',  'fixed',      180000, 'Mantelería, centros de mesa y ambientación'),
    ('Mesas y sillas',            'Mobiliario',  'per_unit',     1500, 'Precio por silla'),
    ('Coordinador del evento',    'Servicio',    'fixed',       90000, null);
end $$;
