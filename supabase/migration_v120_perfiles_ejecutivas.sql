-- =====================================================================
-- Migración v120: perfiles por usuario (admin / ejecutiva) y comisiones
-- visibles por ejecutiva.
--
-- * perfiles_ejecutivas: un registro por usuario de Supabase Auth con su
--   rol ('admin' o 'ejecutiva') y, si es ejecutiva, el nombre de ejecutivo
--   exactamente como aparece en el CRM.
-- * Todos los usuarios que YA existen hoy quedan como 'admin' (así nadie
--   pierde acceso). Los usuarios nuevos que se creen después NO tienen
--   perfil hasta que el admin los vincule => no ven comisiones (falla
--   cerrada).
-- * Las tablas de comisiones pasan de "todo autenticado" a:
--     - admin: lee y escribe todo
--     - ejecutiva: SOLO lee sus propias filas (ejecutivo = el suyo)
-- * RPCs para que el admin vincule usuarios desde la app, sin exponer
--   la service-role key en el navegador.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

create table if not exists perfiles_ejecutivas (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  rol        text not null default 'ejecutiva' check (rol in ('admin','ejecutiva')),
  ejecutivo  text,
  created_at timestamptz not null default now()
);

-- Usuarios existentes => admin (solo los que aún no tienen perfil).
insert into perfiles_ejecutivas (user_id, email, rol)
select u.id, u.email, 'admin' from auth.users u
on conflict (user_id) do nothing;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles_ejecutivas where user_id = auth.uid() and rol = 'admin');
$$;

create or replace function mi_ejecutivo() returns text
language sql stable security definer set search_path = public as $$
  select ejecutivo from perfiles_ejecutivas where user_id = auth.uid() and rol = 'ejecutiva';
$$;

grant execute on function es_admin(), mi_ejecutivo() to authenticated;

alter table perfiles_ejecutivas enable row level security;
drop policy if exists "perfil_propio_o_admin" on perfiles_ejecutivas;
create policy "perfil_propio_o_admin" on perfiles_ejecutivas
  for select to authenticated using (user_id = auth.uid() or es_admin());
grant select on perfiles_ejecutivas to authenticated;
-- Sin políticas de escritura: solo se modifica vía las RPC de abajo.

-- ---------- Comisiones: solo admin escribe; ejecutiva lee lo suyo ----------
drop policy if exists "auth_all_comisiones_config" on comisiones_config;
drop policy if exists "auth_all_comisiones_ventas" on comisiones_ventas;
drop policy if exists "auth_all_comisiones_validacion_ejecutivo" on comisiones_validacion_ejecutivo;
drop policy if exists "admin_all_comisiones_config" on comisiones_config;
drop policy if exists "admin_all_comisiones_ventas" on comisiones_ventas;
drop policy if exists "admin_all_comisiones_validacion" on comisiones_validacion_ejecutivo;
drop policy if exists "ejecutiva_lee_sus_ventas" on comisiones_ventas;
drop policy if exists "ejecutiva_lee_su_validacion" on comisiones_validacion_ejecutivo;

create policy "admin_all_comisiones_config" on comisiones_config
  for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin_all_comisiones_ventas" on comisiones_ventas
  for all to authenticated using (es_admin()) with check (es_admin());
create policy "admin_all_comisiones_validacion" on comisiones_validacion_ejecutivo
  for all to authenticated using (es_admin()) with check (es_admin());

create policy "ejecutiva_lee_sus_ventas" on comisiones_ventas
  for select to authenticated using (ejecutivo = mi_ejecutivo());
create policy "ejecutiva_lee_su_validacion" on comisiones_validacion_ejecutivo
  for select to authenticated using (ejecutivo = mi_ejecutivo());

-- ---------- RPC de administración ----------
create or replace function listar_perfiles()
returns table (user_id uuid, email text, rol text, ejecutivo text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  return query
    select u.id, u.email::text, coalesce(p.rol, 'sin perfil'), p.ejecutivo
    from auth.users u left join perfiles_ejecutivas p on p.user_id = u.id
    order by u.email;
end $$;

create or replace function vincular_ejecutiva(p_email text, p_ejecutivo text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'No existe un usuario con ese correo en Supabase Auth'; end if;
  if exists (select 1 from perfiles_ejecutivas where user_id = v_id and rol = 'admin') then
    raise exception 'Ese usuario es administrador; no se puede convertir en ejecutiva desde aquí';
  end if;
  insert into perfiles_ejecutivas (user_id, email, rol, ejecutivo)
  values (v_id, lower(trim(p_email)), 'ejecutiva', trim(p_ejecutivo))
  on conflict (user_id) do update set rol = 'ejecutiva', ejecutivo = excluded.ejecutivo, email = excluded.email;
end $$;

create or replace function desvincular_ejecutiva(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  delete from perfiles_ejecutivas where user_id = p_user_id and rol = 'ejecutiva';
end $$;

grant execute on function listar_perfiles(), vincular_ejecutiva(text, text), desvincular_ejecutiva(uuid) to authenticated;
