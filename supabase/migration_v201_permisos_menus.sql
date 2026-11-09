-- =====================================================================
-- Migración v201: ficha de permisos por usuario (qué menús puede ver).
-- Requiere v120, v121 y v171. Es seguro correr varias veces.
--
--  * perfiles_ejecutivas.permisos (jsonb): {"dashboard":true,"comisiones":false,...}
--    Si es NULL, rige lo que corresponde al perfil (admin / jefe / ejecutiva).
--  * Solo el administrador puede modificarla, mediante la función
--    establecer_permisos_usuario (el usuario común no tiene permiso de
--    UPDATE sobre la tabla, así que no puede cambiarse la suya).
--  * listar_perfiles ahora devuelve también los permisos.
-- =====================================================================

alter table perfiles_ejecutivas add column if not exists permisos jsonb;

create or replace function public.establecer_permisos_usuario(p_user_id uuid, p_permisos jsonb)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if p_permisos is not null and jsonb_typeof(p_permisos) <> 'object' then
    raise exception 'Permisos inválidos';
  end if;
  update perfiles_ejecutivas set permisos = p_permisos where user_id = p_user_id;
end $$;
grant execute on function public.establecer_permisos_usuario(uuid, jsonb) to authenticated;

drop function if exists public.listar_perfiles();
create or replace function public.listar_perfiles()
returns table (user_id uuid, email text, rol text, ejecutivo text, ultima_conexion timestamptz, permisos jsonb)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  return query
    select u.id, u.email::text, coalesce(p.rol, 'sin perfil'), p.ejecutivo,
           greatest(p.ultima_conexion, u.last_sign_in_at), p.permisos
    from auth.users u left join perfiles_ejecutivas p on p.user_id = u.id
    order by u.email;
end $$;
grant execute on function public.listar_perfiles() to authenticated;
