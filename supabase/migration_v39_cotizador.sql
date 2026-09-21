-- =====================================================================
-- Migración: módulo de Cotizador (listado de precios + generación de
-- cotizaciones en PDF), adaptado del diseño de Hoggar para Pilpilén.
--
-- Dos tablas nuevas, no tocan nada de lo que ya existe:
--
--   lista_precios: el inventario de unidades disponibles (lo que se
--   sube como Excel), con su precio en UF y descuento máximo permitido.
--   Solo un usuario autenticado puede subir/editar esta lista — es
--   información sensible de precios, igual que el Maestro Aval.
--
--   cotizaciones_generadas: cada PDF de cotización que se genera desde
--   el Cotizador, ligado a un cliente de la cartera (por RUT) y a una
--   unidad de lista_precios. Guarda además un "snapshot" completo (los
--   datos que se usaron para armar ese PDF), para poder volver a verlo
--   igual aunque el precio de la unidad cambie después.
--
--   Los ejecutivos generan cotizaciones sin necesidad de login (igual
--   que el resto del sistema), así que esta tabla queda con lectura y
--   escritura abiertas.
-- =====================================================================

create table if not exists lista_precios (
  id             uuid primary key default gen_random_uuid(),
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

create unique index if not exists lista_precios_unidad_unique on lista_precios (unidad);
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

-- lista_precios: lectura abierta (para que el Cotizador funcione sin
-- login), escritura solo para un usuario autenticado (igual que el
-- Maestro Aval).
drop policy if exists "select_lista_precios" on lista_precios;
drop policy if exists "auth_insert_lista_precios" on lista_precios;
drop policy if exists "auth_update_lista_precios" on lista_precios;
drop policy if exists "auth_delete_lista_precios" on lista_precios;

create policy "select_lista_precios" on lista_precios for select using (true);
create policy "auth_insert_lista_precios" on lista_precios for insert to authenticated with check (true);
create policy "auth_update_lista_precios" on lista_precios for update to authenticated using (true) with check (true);
create policy "auth_delete_lista_precios" on lista_precios for delete to authenticated using (true);

-- cotizaciones_generadas: abierta del todo (los ejecutivos generan
-- cotizaciones sin login, igual que gestionan su cartera).
drop policy if exists "allow_all_select_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_insert_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_update_cotizaciones_generadas" on cotizaciones_generadas;
drop policy if exists "allow_all_delete_cotizaciones_generadas" on cotizaciones_generadas;

create policy "allow_all_select_cotizaciones_generadas" on cotizaciones_generadas for select using (true);
create policy "allow_all_insert_cotizaciones_generadas" on cotizaciones_generadas for insert with check (true);
create policy "allow_all_update_cotizaciones_generadas" on cotizaciones_generadas for update using (true) with check (true);
create policy "allow_all_delete_cotizaciones_generadas" on cotizaciones_generadas for delete using (true);

-- Permisos base, igual que hicimos para el resto de las tablas.
grant select on lista_precios to anon, authenticated;
grant insert, update, delete on lista_precios to authenticated;
grant select, insert, update, delete on cotizaciones_generadas to anon, authenticated;
