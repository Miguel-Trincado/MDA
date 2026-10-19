-- =====================================================================
-- Migración v130: permisos del jefe de ventas (consolida y completa la
-- v123, así que se puede correr aunque la v123 no se haya corrido).
--
--  * Jefe de ventas y administrador: ven, editan y validan las
--    comisiones de TODAS las ejecutivas (tablas comisiones_*).
--  * Jefe de ventas y administrador: pueden subir el Maestro Aval y el
--    listado de precios (se anota en el registro de cargas).
--  * Ejecutiva: solo lee sus propias comisiones.
--
-- Síntoma que corrige: con el usuario de un jefe, Comisiones mostraba
-- las unidades como "sin poder cruzar con el listado" porque la base le
-- ocultaba las filas de comisiones y le impedía guardarlas.
-- Requiere v120. Es seguro correr varias veces.
-- =====================================================================

create or replace function es_admin_o_jefe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles_ejecutivas where user_id = auth.uid() and rol in ('admin','jefe'));
$$;
grant execute on function es_admin_o_jefe() to authenticated;

-- Comisiones: admin + jefe
drop policy if exists "auth_all_comisiones_config" on comisiones_config;
drop policy if exists "auth_all_comisiones_ventas" on comisiones_ventas;
drop policy if exists "auth_all_comisiones_validacion_ejecutivo" on comisiones_validacion_ejecutivo;
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

-- La ejecutiva sigue leyendo solo lo suyo (por si faltara de la v120)
drop policy if exists "ejecutiva_lee_sus_ventas" on comisiones_ventas;
drop policy if exists "ejecutiva_lee_su_validacion" on comisiones_validacion_ejecutivo;
create policy "ejecutiva_lee_sus_ventas" on comisiones_ventas
  for select to authenticated using (ejecutivo = mi_ejecutivo());
create policy "ejecutiva_lee_su_validacion" on comisiones_validacion_ejecutivo
  for select to authenticated using (ejecutivo = mi_ejecutivo());

-- Registro de cargas (si ya existe la tabla de la v128): admin + jefe
do $$
begin
  if to_regclass('public.cargas_archivos') is not null then
    drop policy if exists "admin_insert_cargas_archivos" on cargas_archivos;
    drop policy if exists "gestion_insert_cargas_archivos" on cargas_archivos;
    create policy "gestion_insert_cargas_archivos" on cargas_archivos
      for insert to authenticated with check (es_admin_o_jefe());
  end if;
end $$;
