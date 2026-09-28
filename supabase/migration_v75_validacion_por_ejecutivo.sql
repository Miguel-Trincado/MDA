-- =====================================================================
-- Migración v75: la UF y la retención de boleta de honorarios dejan de
-- ser un valor único para todo el mes — cada ejecutivo entrega su boleta
-- en un día distinto (con su propia UF) y cada caso se revisa por
-- separado, así que ahora se aprueban ("validan") uno por uno.
--
-- También permite corregir a mano el % de tramo de una venta puntual
-- (por defecto sigue calculándose solo según el N° de orden del mes).
--
-- La tabla comisiones_config (v68) queda en desuso, pero no se borra por
-- si tenía algo guardado; comisiones_ventas se extiende con tramo_pct.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

create table if not exists comisiones_validacion_ejecutivo (
  mes             text not null,
  ejecutivo       text not null,
  valor_uf        numeric,
  retencion_pct   numeric not null default 14.5,
  validado        boolean not null default false,
  validado_at     timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (mes, ejecutivo)
);

alter table comisiones_ventas add column if not exists tramo_pct numeric;

alter table comisiones_validacion_ejecutivo enable row level security;

drop policy if exists "auth_all_comisiones_validacion_ejecutivo" on comisiones_validacion_ejecutivo;
create policy "auth_all_comisiones_validacion_ejecutivo" on comisiones_validacion_ejecutivo
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on comisiones_validacion_ejecutivo to authenticated;
