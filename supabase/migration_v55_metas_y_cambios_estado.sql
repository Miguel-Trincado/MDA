-- =====================================================================
-- Migración: metas comerciales mensuales (solo tú las asignas/modificas)
-- + historial de cambios de Estado por Opp (para calcular "Promesados
-- del mes" de verdad, a partir del Aval, no del campo Estado que edita
-- el ejecutivo en la ficha).
-- =====================================================================

-- metas_mensuales: una fila por mes ("2026-09"). Lectura abierta (para
-- que la Jefa la vea), pero solo un usuario autenticado (tú) puede
-- crear o modificar una meta.
create table if not exists metas_mensuales (
  mes         text primary key,
  valor       numeric not null default 0,
  updated_at  timestamptz not null default now()
);

alter table metas_mensuales enable row level security;

drop policy if exists "select_metas_mensuales" on metas_mensuales;
drop policy if exists "auth_insert_metas_mensuales" on metas_mensuales;
drop policy if exists "auth_update_metas_mensuales" on metas_mensuales;
drop policy if exists "auth_delete_metas_mensuales" on metas_mensuales;

create policy "select_metas_mensuales" on metas_mensuales for select using (true);
create policy "auth_insert_metas_mensuales" on metas_mensuales for insert to authenticated with check (true);
create policy "auth_update_metas_mensuales" on metas_mensuales for update to authenticated using (true) with check (true);
create policy "auth_delete_metas_mensuales" on metas_mensuales for delete to authenticated using (true);

grant select on metas_mensuales to anon, authenticated;
grant insert, update, delete on metas_mensuales to authenticated;

-- cambios_estado_opp: un registro por cada vez que una Opp cambia de
-- Estado en una carga del Aval (Cotización → Reserva → Promesada, etc.),
-- con fecha real de detección. Es lo que permite saber cuántas Opp
-- pasaron a "Promesada" DURANTE un mes específico — el campo Estado que
-- el ejecutivo edita a mano en la ficha no sirve para eso, porque no
-- tiene fecha ni refleja el Aval.
create table if not exists cambios_estado_opp (
  id               uuid primary key default gen_random_uuid(),
  opp              text not null,
  rut              text,
  estado_anterior  text,
  estado_nuevo     text,
  fecha_deteccion  timestamptz not null default now()
);

create index if not exists idx_cambios_estado_opp_fecha on cambios_estado_opp (fecha_deteccion);
create index if not exists idx_cambios_estado_opp_estado_nuevo on cambios_estado_opp (estado_nuevo);

alter table cambios_estado_opp enable row level security;

drop policy if exists "select_cambios_estado_opp" on cambios_estado_opp;
drop policy if exists "auth_insert_cambios_estado_opp" on cambios_estado_opp;

create policy "select_cambios_estado_opp" on cambios_estado_opp for select using (true);
create policy "auth_insert_cambios_estado_opp" on cambios_estado_opp for insert to authenticated with check (true);

grant select on cambios_estado_opp to anon, authenticated;
grant insert on cambios_estado_opp to authenticated;
