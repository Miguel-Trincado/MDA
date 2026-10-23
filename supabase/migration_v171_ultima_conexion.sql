-- v171: última conexión y estado (activo / inactivo) de cada usuario en el panel Usuarios.
-- Es seguro correr este script varias veces.

alter table public.perfiles_ejecutivas add column if not exists ultima_conexion timestamptz;

-- Cada usuario registra su propia actividad (la app la llama al entrar y cada 2 minutos).
create or replace function public.registrar_conexion() returns void
language sql security definer set search_path = public as $$
  update perfiles_ejecutivas set ultima_conexion = now() where user_id = auth.uid();
$$;
grant execute on function public.registrar_conexion() to authenticated;

-- El listado del administrador ahora trae también la última conexión
-- (si el usuario aún no tiene actividad registrada, usa su último inicio de sesión).
drop function if exists public.listar_perfiles();
create or replace function public.listar_perfiles()
returns table (user_id uuid, email text, rol text, ejecutivo text, ultima_conexion timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  return query
    select u.id, u.email::text, coalesce(p.rol, 'sin perfil'), p.ejecutivo,
           greatest(p.ultima_conexion, u.last_sign_in_at)
    from auth.users u left join perfiles_ejecutivas p on p.user_id = u.id
    order by u.email;
end $$;
grant execute on function public.listar_perfiles() to authenticated;
