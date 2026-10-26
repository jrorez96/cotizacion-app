-- Carga el catálogo demo SIN usar la app. Ejecutar en el SQL Editor de Supabase.
-- Cambia el correo por el del usuario con el que entras a la app.
do $$
declare uid uuid := (select id from auth.users where email = 'TU-CORREO@ejemplo.com');
begin
  if uid is null then raise exception 'Usuario no encontrado'; end if;

  insert into public.event_types (user_id, name)
  values (uid,'Boda'), (uid,'Corporativo'), (uid,'Catering'), (uid,'Cumpleaños')
  on conflict do nothing;

  insert into public.catalog_items (user_id, name, category, pricing_mode, unit_price, description) values
    (uid,'Alquiler del salón',       'Espacio',      'fixed',      450000, 'Uso del salón por 6 horas'),
    (uid,'Hora adicional del salón', 'Espacio',      'per_hour',    60000, null),
    (uid,'Menú tres tiempos',        'Alimentación', 'per_person',  12500, 'Entrada, plato fuerte y postre'),
    (uid,'Barra libre',              'Bebidas',      'per_person',   6000, 'Bebidas nacionales por 4 horas'),
    (uid,'DJ y sonido',              'Música',       'per_hour',    35000, null),
    (uid,'Decoración básica',        'Decoración',   'fixed',      180000, 'Mantelería, centros de mesa y ambientación'),
    (uid,'Mesas y sillas',           'Mobiliario',   'per_unit',     1500, 'Precio por silla'),
    (uid,'Coordinador del evento',   'Servicio',     'fixed',       90000, null);
end $$;
