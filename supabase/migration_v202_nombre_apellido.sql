-- =====================================================================
-- Migración v202: nombre y apellido de cada usuario (se muestran en la
-- lista y en la ficha de Usuarios en vez del correo).
-- Requiere v120, v121, v171 y v201. Es seguro correr varias veces.
-- Solo el administrador puede cambiarlos (función security definer).
-- =====================================================================

alter table perfiles_ejecutivas add column if not exists permisos jsonb;   -- por si falta la v201
alter table perfiles_ejecutivas add column if not exists nombre text;
alter table perfiles_ejecutivas add column if not exists apellido text;

drop function if exists public.establecer_nombre_usuario(uuid, text);   -- versión anterior (solo nombre)
create or replace function public.establecer_nombre_usuario(p_user_id uuid, p_nombre text, p_apellido text)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  update perfiles_ejecutivas
     set nombre = nullif(trim(coalesce(p_nombre, '')), ''),
         apellido = nullif(trim(coalesce(p_apellido, '')), '')
   where user_id = p_user_id;
end $$;
grant execute on function public.establecer_nombre_usuario(uuid, text, text) to authenticated;

drop function if exists public.listar_perfiles();
create or replace function public.listar_perfiles()
returns table (user_id uuid, email text, rol text, ejecutivo text, ultima_conexion timestamptz, permisos jsonb, nombre text, apellido text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  return query
    select u.id, u.email::text, coalesce(p.rol, 'sin perfil'), p.ejecutivo,
           greatest(p.ultima_conexion, u.last_sign_in_at), p.permisos, p.nombre, p.apellido
    from auth.users u left join perfiles_ejecutivas p on p.user_id = u.id
    order by u.email;
end $$;
grant execute on function public.listar_perfiles() to authenticated;
