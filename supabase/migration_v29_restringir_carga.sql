-- =====================================================================
-- Migración: restringe la SUBIDA del Maestro Aval a un usuario
-- autenticado (Supabase Auth), sin afectar el uso normal del sistema
-- por ejecutivos y Jefa de Ventas (que siguen sin necesitar login).
--
-- Qué cambia:
--   - cotizaciones y control_interno: solo un usuario autenticado
--     puede insertar/editar/borrar (son tablas que SOLO toca la carga
--     del Maestro Aval, nunca los ejecutivos).
--   - cambios_ejecutivo: solo un usuario autenticado puede CREAR un
--     cambio detectado (eso solo pasa al cargar el Aval). Resolverlo
--     (aprobar / mantener) lo sigue haciendo la Jefa sin login.
--   - gestion: solo un usuario autenticado puede CREAR un cliente
--     nuevo (eso solo pasa al cargar el Aval). Los ejecutivos siguen
--     pudiendo editar (UPDATE) las fichas existentes sin login.
--   - La LECTURA (select) de todas las tablas se mantiene abierta para
--     que el Dashboard, la cartera de ejecutivos y el panel de la
--     Jefa sigan funcionando igual para todos, sin necesidad de login.
--
-- Este script es seguro de correr varias veces (no falla si ya lo
-- habías corrido antes).
--
-- Antes de correr esto: crea tu usuario en Supabase → Authentication →
-- Users → Add user (tu correo + una contraseña). Con esa cuenta vas a
-- iniciar sesión en el botón "Subir plantilla" del Dashboard.
-- =====================================================================

-- cotizaciones: todo el CRUD requiere estar autenticado
drop policy if exists "allow_all_insert_cotizaciones" on cotizaciones;
drop policy if exists "allow_all_update_cotizaciones" on cotizaciones;
drop policy if exists "allow_all_delete_cotizaciones" on cotizaciones;
drop policy if exists "auth_insert_cotizaciones" on cotizaciones;
drop policy if exists "auth_update_cotizaciones" on cotizaciones;
drop policy if exists "auth_delete_cotizaciones" on cotizaciones;

create policy "auth_insert_cotizaciones" on cotizaciones
  for insert to authenticated with check (true);
create policy "auth_update_cotizaciones" on cotizaciones
  for update to authenticated using (true) with check (true);
create policy "auth_delete_cotizaciones" on cotizaciones
  for delete to authenticated using (true);

-- control_interno: todo el CRUD requiere estar autenticado
drop policy if exists "allow_all_insert_control_interno" on control_interno;
drop policy if exists "allow_all_update_control_interno" on control_interno;
drop policy if exists "allow_all_delete_control_interno" on control_interno;
drop policy if exists "auth_insert_control_interno" on control_interno;
drop policy if exists "auth_update_control_interno" on control_interno;
drop policy if exists "auth_delete_control_interno" on control_interno;

create policy "auth_insert_control_interno" on control_interno
  for insert to authenticated with check (true);
create policy "auth_update_control_interno" on control_interno
  for update to authenticated using (true) with check (true);
create policy "auth_delete_control_interno" on control_interno
  for delete to authenticated using (true);

-- cambios_ejecutivo: crear un cambio requiere estar autenticado;
-- resolverlo (update) se mantiene abierto para la Jefa, sin login.
drop policy if exists "allow_all_insert_cambios_ejecutivo" on cambios_ejecutivo;
drop policy if exists "auth_insert_cambios_ejecutivo" on cambios_ejecutivo;

create policy "auth_insert_cambios_ejecutivo" on cambios_ejecutivo
  for insert to authenticated with check (true);

-- gestion: crear un cliente nuevo requiere estar autenticado;
-- editar (update) una ficha existente se mantiene abierto para
-- que los ejecutivos sigan guardando su gestión sin login.
drop policy if exists "allow_all_insert_gestion" on gestion;
drop policy if exists "auth_insert_gestion" on gestion;

create policy "auth_insert_gestion" on gestion
  for insert to authenticated with check (true);

-- =====================================================================
-- Permisos base (GRANT): además de la política de RLS, Postgres exige
-- el permiso base sobre la tabla para el rol "authenticated". Como
-- estas tablas se crearon por SQL directo (no desde el panel de
-- Supabase), es posible que "authenticated" nunca haya recibido este
-- permiso explícitamente — solo "anon", que es el que se usó siempre
-- hasta ahora. Sin este GRANT, la subida falla con "violates row-level
-- security policy" aunque la política y el login estén bien.
-- =====================================================================
grant select, insert, update, delete on gestion, control_interno, cambios_ejecutivo, cotizaciones, historial, config
  to authenticated;
