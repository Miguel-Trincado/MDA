-- =====================================================================
-- Migración v123: el jefe de ventas también puede ver, editar y validar
-- las comisiones de todas (igual que el administrador). La ejecutiva
-- sigue viendo solo las suyas, sin editar ni validar.
-- Requiere v120 y v121. Es seguro correr varias veces.
-- =====================================================================

create or replace function es_admin_o_jefe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles_ejecutivas where user_id = auth.uid() and rol in ('admin','jefe'));
$$;
grant execute on function es_admin_o_jefe() to authenticated;

drop policy if exists "admin_all_comisiones_config" on comisiones_config;
drop policy if exists "admin_all_comisiones_ventas" on comisiones_ventas;
drop policy if exists "admin_all_comisiones_validacion" on comisiones_validacion_ejecutivo;
drop policy if exists "gestion_all_comisiones_config" on comisiones_config;
drop policy if exists "gestion_all_comisiones_ventas" on comisiones_ventas;
drop policy if exists "gestion_all_comisiones_validacion" on comisiones_validacion_ejecutivo;

create policy "gestion_all_comisiones_config" on comisiones_config
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());
create policy "gestion_all_comisiones_ventas" on comisiones_ventas
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());
create policy "gestion_all_comisiones_validacion" on comisiones_validacion_ejecutivo
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());
