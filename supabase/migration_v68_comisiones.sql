-- =====================================================================
-- Migración v68: pestaña "Comisiones" (solo administrador).
--
-- Crea dos tablas nuevas, totalmente privadas (ni siquiera de lectura
-- pública): solo un usuario autenticado (Supabase Auth) puede leerlas o
-- escribirlas. Así la pestaña Comisiones puede ocultarse en la app para
-- todos menos el administrador, y aunque alguien intentara consultar la
-- base directo, sin login no vería nada.
--
--   comisiones_config: por cada mes, el valor de la UF a usar y la tasa
--   de retención de la boleta de honorarios (ambos editables).
--
--   comisiones_ventas: por cada Opp que promesó, qué unidad del listado
--   de precios se vendió (elegida a mano, ya que el Aval no trae ese
--   dato) y su precio/descuento — guardados como snapshot (no como
--   referencia al listado de precios) porque el listado se reemplaza
--   completo cada vez que se sube uno nuevo.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

create table if not exists comisiones_config (
  mes             text primary key,
  valor_uf        numeric,
  retencion_pct   numeric not null default 14.5,
  updated_at      timestamptz not null default now()
);

create table if not exists comisiones_ventas (
  opp             text primary key,
  rut             text,
  cliente         text default '',
  ejecutivo       text not null,
  mes             text not null,
  unidad_label    text not null,
  precio_uf       numeric not null,
  descuento_pct   numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_comisiones_ventas_mes on comisiones_ventas (mes);
create index if not exists idx_comisiones_ventas_ejecutivo on comisiones_ventas (ejecutivo);

alter table comisiones_config enable row level security;
alter table comisiones_ventas enable row level security;

drop policy if exists "auth_all_comisiones_config" on comisiones_config;
drop policy if exists "auth_all_comisiones_ventas" on comisiones_ventas;

-- A diferencia del resto del sistema, aquí NO se crea ninguna política
-- para "anon": sin sesión, select/insert/update/delete quedan bloqueados
-- por RLS (no existe ninguna regla que los permita).
create policy "auth_all_comisiones_config" on comisiones_config
  for all to authenticated using (true) with check (true);

create policy "auth_all_comisiones_ventas" on comisiones_ventas
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on comisiones_config, comisiones_ventas to authenticated;
