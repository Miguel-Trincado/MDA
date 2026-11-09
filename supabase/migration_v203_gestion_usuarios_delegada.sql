-- =====================================================================
-- Migración v203: el administrador puede dar el menú "Usuarios" a otros.
-- Requiere v121, v171, v201 y v202. Es seguro correr varias veces.
--
-- Reglas:
--  * El administrador decide quién tiene el menú Usuarios (ficha → Acceso a
--    menús). Solo él puede cambiar los accesos a menús de cualquiera.
--  * Quien tiene el menú Usuarios puede ver la lista, crear usuarios,
--    cambiar nombre / perfil / contraseña y eliminar usuarios...
--  * ...pero NUNCA sobre un administrador, ni crear o asignar el perfil
--    administrador. Nadie puede hacerle nada al administrador.
-- =====================================================================

-- ¿Quien llama puede gestionar usuarios? (administrador o con el menú Usuarios)
create or replace function public.es_gestor_usuarios() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles_ejecutivas
    where user_id = auth.uid() and (rol = 'admin' or coalesce(permisos->>'usuarios', '') = 'true')
  );
$$;
grant execute on function public.es_gestor_usuarios() to authenticated;

-- ¿El usuario indicado es administrador?
create or replace function public.es_usuario_admin(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles_ejecutivas where user_id = p_user_id and rol = 'admin');
$$;
grant execute on function public.es_usuario_admin(uuid) to authenticated;

create or replace function public.crear_usuario(p_email text, p_password text, p_rol text, p_ejecutivo text default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if p_rol not in ('admin','jefe','ejecutiva') then raise exception 'Perfil inválido'; end if;
  if p_rol = 'admin' and not es_admin() then raise exception 'Solo el administrador puede crear administradores'; end if;
  if p_rol = 'ejecutiva' and coalesce(trim(p_ejecutivo), '') = '' then
    raise exception 'Debes indicar a qué ejecutiva corresponde el usuario';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Correo inválido'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Ya existe un usuario con ese correo';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into perfiles_ejecutivas (user_id, email, rol, ejecutivo)
  values (v_id, v_email, p_rol, case when p_rol = 'ejecutiva' then trim(p_ejecutivo) else null end);

  return v_id;
end $$;

create or replace function public.cambiar_perfil_usuario(p_user_id uuid, p_rol text, p_ejecutivo text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio perfil'; end if;
  if es_usuario_admin(p_user_id) and not es_admin() then raise exception 'No se puede modificar a un administrador'; end if;
  if p_rol not in ('admin','jefe','ejecutiva') then raise exception 'Perfil inválido'; end if;
  if p_rol = 'admin' and not es_admin() then raise exception 'Solo el administrador puede asignar el perfil administrador'; end if;
  if p_rol = 'ejecutiva' and coalesce(trim(p_ejecutivo), '') = '' then
    raise exception 'Debes indicar a qué ejecutiva corresponde el usuario';
  end if;
  insert into perfiles_ejecutivas (user_id, email, rol, ejecutivo)
  select u.id, u.email, p_rol, case when p_rol = 'ejecutiva' then trim(p_ejecutivo) else null end
  from auth.users u where u.id = p_user_id
  on conflict (user_id) do update
    set rol = excluded.rol, ejecutivo = excluded.ejecutivo;
end $$;

create or replace function public.resetear_clave_usuario(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if es_usuario_admin(p_user_id) and not es_admin() then raise exception 'No se puede modificar a un administrador'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
end $$;

create or replace function public.eliminar_usuario(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes eliminar tu propio usuario'; end if;
  if es_usuario_admin(p_user_id) and not es_admin() then raise exception 'No se puede eliminar a un administrador'; end if;
  delete from auth.users where id = p_user_id; -- borra también identities y perfil (cascade)
end $$;

create or replace function public.establecer_nombre_usuario(p_user_id uuid, p_nombre text, p_apellido text)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if es_usuario_admin(p_user_id) and not es_admin() then raise exception 'No se puede modificar a un administrador'; end if;
  update perfiles_ejecutivas
     set nombre = nullif(trim(coalesce(p_nombre, '')), ''),
         apellido = nullif(trim(coalesce(p_apellido, '')), '')
   where user_id = p_user_id;
end $$;

-- Los accesos a menús (y por tanto quién tiene "Usuarios") los decide solo el administrador.
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

drop function if exists public.listar_perfiles();
create or replace function public.listar_perfiles()
returns table (user_id uuid, email text, rol text, ejecutivo text, ultima_conexion timestamptz, permisos jsonb, nombre text, apellido text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  return query
    select u.id, u.email::text, coalesce(p.rol, 'sin perfil'), p.ejecutivo,
           greatest(p.ultima_conexion, u.last_sign_in_at), p.permisos, p.nombre, p.apellido
    from auth.users u left join perfiles_ejecutivas p on p.user_id = u.id
    order by u.email;
end $$;

grant execute on function
  crear_usuario(text, text, text, text),
  cambiar_perfil_usuario(uuid, text, text),
  resetear_clave_usuario(uuid, text),
  eliminar_usuario(uuid),
  establecer_nombre_usuario(uuid, text, text),
  establecer_permisos_usuario(uuid, jsonb),
  listar_perfiles()
to authenticated;
