-- =====================================================================
-- PILPILÉN CRM — Esquema de base de datos para Supabase (Postgres)
-- =====================================================================
-- Cómo usarlo:
--   1. Entra a tu proyecto en https://supabase.com/dashboard
--   2. Ve a "SQL Editor" -> "New query"
--   3. Pega este archivo completo y ejecuta ("Run")
--   4. Verifica en "Table Editor" que se crearon las 6 tablas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensiones necesarias
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabla: gestion
-- Un registro por cliente (RUT), con toda su ficha comercial.
-- Reemplaza la clave "gestion_records" del almacenamiento de artifacts.
-- ---------------------------------------------------------------------
create table if not exists gestion (
  rut                              text primary key,
  cliente                          text not null default '',
  telefono                         text default '',
  renta                            text default '',
  fecha_ultima_cotizacion          text default '',
  n_cotizaciones                   integer not null default 0,
  estado                           text not null default 'Activo'
                                      check (estado in ('Activo','En espera','Promesado','Perdido')),
  nivel_interes                    text default ''
                                      check (nivel_interes in ('','Alto','Medio','Bajo')),
  etapa_comercial                  text not null default 'Cotizado',
  estado_evaluacion_bancaria       text not null default 'No iniciada',
  accion_realizada                 text default '',
  respuesta                        text default '',
  objecion_actual                  text default '',
  motivo_perdida                   text default '',
  proxima_accion                   text default '',
  fecha_proxima_accion             date,
  observaciones                    text default '',
  ejecutivo                        text default '',
  flag_sistema                     text not null default 'NUEVO'
                                      check (flag_sistema in ('NUEVO','SI','')),
  flag_cambio_ejecutivo            text not null default ''
                                      check (flag_cambio_ejecutivo in ('CAMBIO','')),
  ultima_revision_fecha            date,
  ultima_actualizacion_ejecutivo   timestamptz,
  fecha_primera_gestion_efectiva   date,
  fecha_ultima_accion_efectiva     date,
  proyecto                         text default 'PILPILEN',
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

comment on table gestion is 'Ficha comercial viva de cada cliente cotizante (una fila por RUT).';

-- ---------------------------------------------------------------------
-- Tabla: control_interno
-- Estado "de control" usado para detectar diferencias al re-subir el
-- Maestro Aval (N° de cotizaciones anterior, ejecutivo anterior, etc).
-- ---------------------------------------------------------------------
create table if not exists control_interno (
  rut             text primary key references gestion(rut) on delete cascade,
  cotizaciones    integer not null default 0,
  ejecutivo       text default '',
  fecha_reserva   text default '',
  fecha_promesa   text default '',
  updated_at      timestamptz not null default now()
);

comment on table control_interno is 'Última foto conocida del Maestro Aval por cliente, para detectar cambios en la próxima carga.';

-- ---------------------------------------------------------------------
-- Tabla: cambios_ejecutivo
-- Cola de cambios de ejecutivo detectados, pendientes de resolución
-- por la Jefa de Ventas.
-- ---------------------------------------------------------------------
create table if not exists cambios_ejecutivo (
  id                  bigint generated always as identity primary key,
  fecha_deteccion     timestamptz not null default now(),
  rut                 text not null references gestion(rut) on delete cascade,
  cliente             text default '',
  ejecutivo_anterior  text default '',
  ejecutivo_nuevo     text default '',
  estado_previo       text default '',
  etapa_previa        text default '',
  resolucion          text not null default 'PENDIENTE REVISIÓN',
  fecha_resolucion    timestamptz,
  observacion         text default ''
);

comment on table cambios_ejecutivo is 'Cola de cambios de ejecutivo detectados al comparar el Maestro Aval, pendientes de aprobación.';

-- ---------------------------------------------------------------------
-- Tabla: historial
-- Bitácora de cada gestión guardada (auditoría / línea de tiempo).
-- ---------------------------------------------------------------------
create table if not exists historial (
  id                bigint generated always as identity primary key,
  fecha             timestamptz not null default now(),
  ejecutivo         text default '',
  cliente           text default '',
  rut               text default '',
  estado            text default '',
  nivel_interes     text default '',
  etapa_comercial   text default '',
  accion_realizada  text default '',
  respuesta         text default '',
  observaciones     text default '',
  nota              text default ''
);

comment on table historial is 'Bitácora inmutable de cada gestión o revisión guardada por los ejecutivos.';

-- ---------------------------------------------------------------------
-- Tabla: cotizaciones
-- Detalle fila-a-fila de cada cotización del Maestro Aval (para el
-- Reporte Ejecutivo / dashboard: tipología, región, fecha).
-- ---------------------------------------------------------------------
create table if not exists cotizaciones (
  opp         text primary key,
  rut         text references gestion(rut) on delete cascade,
  fecha       text default '',
  fecha_opp   text default '',
  tipologia   text default '',
  region      text default '',
  proyecto    text default '',
  estado      text default '',
  created_at  timestamptz not null default now()
);

comment on table cotizaciones is 'Detalle de cada fila de cotización cargada desde el Maestro Aval, usado para el dashboard ejecutivo.';

-- ---------------------------------------------------------------------
-- Tabla: config
-- Configuración simple tipo clave/valor (ej: meta_mensual).
-- ---------------------------------------------------------------------
create table if not exists config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into config (key, value)
  values ('meta_mensual', '{"value": 5}'::jsonb)
  on conflict (key) do nothing;

comment on table config is 'Configuración clave/valor (por ejemplo, la meta comercial mensual).';

-- ---------------------------------------------------------------------
-- Índices útiles
-- ---------------------------------------------------------------------
create index if not exists idx_gestion_ejecutivo on gestion (ejecutivo);
create index if not exists idx_gestion_estado on gestion (estado);
create index if not exists idx_cambios_pendientes on cambios_ejecutivo (resolucion);
create index if not exists idx_cotizaciones_rut on cotizaciones (rut);
create index if not exists idx_historial_rut on historial (rut);

-- ---------------------------------------------------------------------
-- Trigger: mantener updated_at al día en `gestion`
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_gestion_updated_at on gestion;
create trigger trg_gestion_updated_at
  before update on gestion
  for each row execute function set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================================
-- Este proyecto no implementa un login individual por ejecutivo (el
-- "¿Quién eres?" de la vista Ejecutivo es solo una selección, no una
-- autenticación real) — eso se mantiene abierto a propósito.
--
-- La única acción restringida es la SUBIDA del Maestro Aval, que solo
-- puede hacer un usuario autenticado (Supabase Auth). Por eso:
--   - gestion / cambios_ejecutivo: crear filas nuevas (insert) requiere
--     estar autenticado, porque eso solo ocurre al cargar el Aval.
--     Editar (update) una fila ya existente sigue abierto, porque los
--     ejecutivos y la Jefa lo necesitan sin login.
--   - cotizaciones / control_interno: todo el CRUD requiere estar
--     autenticado, porque son tablas que solo toca la carga del Aval.
--   - La LECTURA (select) de todo se mantiene abierta para que el
--     Dashboard, la cartera de ejecutivos y el panel de la Jefa
--     sigan funcionando para todos sin login.
--
-- Antes de usar el sistema: crea tu usuario en Supabase → Authentication
-- → Users → Add user (tu correo + una contraseña). Con esa cuenta se
-- inicia sesión en el botón "Subir plantilla" del Dashboard.
-- =====================================================================

alter table gestion            enable row level security;
alter table control_interno    enable row level security;
alter table cambios_ejecutivo  enable row level security;
alter table historial          enable row level security;
alter table cotizaciones       enable row level security;
alter table config             enable row level security;

-- Lectura abierta para todas las tablas (anon + authenticated)
do $$
declare
  t text;
begin
  foreach t in array array['gestion','control_interno','cambios_ejecutivo','historial','cotizaciones','config']
  loop
    execute format('drop policy if exists "allow_all_select_%1$s" on %1$s', t);
    execute format('create policy "allow_all_select_%1$s" on %1$s for select using (true)', t);
  end loop;
end $$;

-- historial y config: escritura abierta (no forman parte de la carga
-- del Aval como identidad protegida; historial lo escriben los
-- ejecutivos al guardar, config lo escribe la Jefa al fijar la meta)
do $$
declare
  t text;
begin
  foreach t in array array['historial','config']
  loop
    execute format('drop policy if exists "allow_all_insert_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_update_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_delete_%1$s" on %1$s', t);
    execute format('create policy "allow_all_insert_%1$s" on %1$s for insert with check (true)', t);
    execute format('create policy "allow_all_update_%1$s" on %1$s for update using (true) with check (true)', t);
    execute format('create policy "allow_all_delete_%1$s" on %1$s for delete using (true)', t);
  end loop;
end $$;

-- gestion: update abierto (ejecutivos), insert solo autenticado (Aval)
drop policy if exists "allow_all_insert_gestion" on gestion;
drop policy if exists "allow_all_update_gestion" on gestion;
drop policy if exists "allow_all_delete_gestion" on gestion;
create policy "auth_insert_gestion" on gestion for insert to authenticated with check (true);
create policy "allow_all_update_gestion" on gestion for update using (true) with check (true);
create policy "allow_all_delete_gestion" on gestion for delete using (true);

-- cambios_ejecutivo: update abierto (Jefa resuelve), insert solo autenticado (Aval)
drop policy if exists "allow_all_insert_cambios_ejecutivo" on cambios_ejecutivo;
drop policy if exists "allow_all_update_cambios_ejecutivo" on cambios_ejecutivo;
drop policy if exists "allow_all_delete_cambios_ejecutivo" on cambios_ejecutivo;
create policy "auth_insert_cambios_ejecutivo" on cambios_ejecutivo for insert to authenticated with check (true);
create policy "allow_all_update_cambios_ejecutivo" on cambios_ejecutivo for update using (true) with check (true);
create policy "allow_all_delete_cambios_ejecutivo" on cambios_ejecutivo for delete using (true);

-- cotizaciones y control_interno: todo el CRUD requiere estar autenticado
do $$
declare
  t text;
begin
  foreach t in array array['cotizaciones','control_interno']
  loop
    execute format('drop policy if exists "allow_all_insert_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_update_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_delete_%1$s" on %1$s', t);
    execute format('create policy "auth_insert_%1$s" on %1$s for insert to authenticated with check (true)', t);
    execute format('create policy "auth_update_%1$s" on %1$s for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth_delete_%1$s" on %1$s for delete to authenticated using (true)', t);
  end loop;
end $$;

-- Permiso base (GRANT) para el rol authenticated, además de las
-- políticas de RLS de arriba. Sin esto, Supabase Auth no puede escribir
-- aunque la política lo permita.
grant select, insert, update, delete on gestion, control_interno, cambios_ejecutivo, cotizaciones, historial, config
  to authenticated;

-- =====================================================================
-- Cotizador: listado de precios y cotizaciones generadas
-- =====================================================================
-- lista_precios: el inventario de unidades (Departamento, Estacionamiento,
-- Local Comercial). No tiene llave única: el listado real de la
-- inmobiliaria trae números de unidad repetidos de verdad, así que cada
-- carga reemplaza la tabla completa (borra todo e inserta de nuevo) en
-- vez de actualizar por número de unidad.
create table if not exists lista_precios (
  id             uuid primary key default gen_random_uuid(),
  tipo           text default 'Departamento',
  modelo         text default '',
  unidad         text not null,
  tipologia      text default '',
  orientacion    text default '',
  area           numeric,
  precio         numeric,
  descuento_max  numeric,
  estado         text not null default 'Disponible',
  raw_data       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_lista_precios_estado on lista_precios (estado);

create sequence if not exists cotizaciones_generadas_display_id_seq;

create table if not exists cotizaciones_generadas (
  id             uuid primary key default gen_random_uuid(),
  display_id     text not null default ('COT-' || lpad((nextval('cotizaciones_generadas_display_id_seq'))::text, 6, '0')),
  rut_cliente    text references gestion(rut) on delete set null,
  unidad_id      uuid references lista_precios(id) on delete set null,
  secondary_ids  uuid[] default '{}',
  subtotal       numeric,
  descuento      numeric default 0,
  precio_final   numeric,
  reserva        numeric default 0,
  observaciones  text default '',
  snapshot       jsonb,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create unique index if not exists cotizaciones_generadas_display_id_unique on cotizaciones_generadas (display_id);
create index if not exists idx_cotizaciones_generadas_rut on cotizaciones_generadas (rut_cliente);

alter table lista_precios            enable row level security;
alter table cotizaciones_generadas   enable row level security;

drop policy if exists "select_lista_precios" on lista_precios;
drop policy if exists "auth_insert_lista_precios" on lista_precios;
drop policy if exists "auth_update_lista_precios" on lista_precios;
drop policy if exists "auth_delete_lista_precios" on lista_precios;

create policy "select_lista_precios" on lista_precios for select using (true);
create policy "auth_insert_lista_precios" on lista_precios for insert to authenticated with check (true);
create policy "auth_update_lista_precios" on lista_precios for update to authenticated using (true) with check (true);
create policy "auth_delete_lista_precios" on lista_precios for delete to authenticated using (true);

drop policy if exists "allow_all_select_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_insert_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_update_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_delete_cotizaciones_generadas" on cotizaciones_generadas;

create policy "allow_all_select_cotizaciones_generadas" on cotizaciones_generadas for select using (true);
create policy "allow_all_insert_cotizaciones_generadas" on cotizaciones_generadas for insert with check (true);
create policy "allow_all_update_cotizaciones_generadas" on cotizaciones_generadas for update using (true) with check (true);
create policy "allow_all_delete_cotizaciones_generadas" on cotizaciones_generadas for delete using (true);

grant select on lista_precios to anon, authenticated;
grant insert, update, delete on lista_precios to authenticated;
grant select, insert, update, delete on cotizaciones_generadas to anon, authenticated;

-- =====================================================================
-- Fin del esquema
-- =====================================================================
