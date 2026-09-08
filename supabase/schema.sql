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
  tipologia   text default '',
  region      text default '',
  proyecto    text default '',
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
-- Este proyecto no implementa aún un login individual por ejecutivo
-- (el "¿Quién eres?" de la vista Ejecutivo es solo una selección, no
-- una autenticación real). Para que la app funcione de inmediato con
-- la clave anónima (anon key) de Supabase, se habilita RLS con
-- políticas abiertas de lectura/escritura para los roles anon y
-- authenticated.
--
-- ⚠️ IMPORTANTE PARA PRODUCCIÓN:
-- Estas políticas permiten que cualquiera con la anon key lea y
-- escriba todos los datos. Es razonable para una app interna detrás
-- de un link no público, pero si vas a exponerla más ampliamente,
-- reemplaza estas políticas por reglas basadas en Supabase Auth
-- (por ejemplo, exigiendo auth.uid() y una tabla de usuarios/roles).
-- =====================================================================

alter table gestion            enable row level security;
alter table control_interno    enable row level security;
alter table cambios_ejecutivo  enable row level security;
alter table historial          enable row level security;
alter table cotizaciones       enable row level security;
alter table config             enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['gestion','control_interno','cambios_ejecutivo','historial','cotizaciones','config']
  loop
    execute format('drop policy if exists "allow_all_select_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_insert_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_update_%1$s" on %1$s', t);
    execute format('drop policy if exists "allow_all_delete_%1$s" on %1$s', t);

    execute format('create policy "allow_all_select_%1$s" on %1$s for select using (true)', t);
    execute format('create policy "allow_all_insert_%1$s" on %1$s for insert with check (true)', t);
    execute format('create policy "allow_all_update_%1$s" on %1$s for update using (true) with check (true)', t);
    execute format('create policy "allow_all_delete_%1$s" on %1$s for delete using (true)', t);
  end loop;
end $$;

-- =====================================================================
-- Fin del esquema
-- =====================================================================
