-- =====================================================================
-- Migración v121: administración de usuarios desde el propio sistema.
-- Requiere haber corrido antes la v120.
--
-- Perfiles: 'admin' (administrador), 'jefe' (jefe de ventas) y
-- 'ejecutiva' (ejecutivo/a). Solo el administrador puede crear, cambiar
-- de perfil, resetear la clave o eliminar usuarios, mediante funciones
-- seguras (security definer) — no hace falta entrar al panel de Supabase
-- ni exponer ninguna llave en el navegador.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table perfiles_ejecutivas drop constraint if exists perfiles_ejecutivas_rol_check;
alter table perfiles_ejecutivas
  add constraint perfiles_ejecutivas_rol_check check (rol in ('admin','jefe','ejecutiva'));

create or replace function crear_usuario(p_email text, p_password text, p_rol text, p_ejecutivo text default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if p_rol not in ('admin','jefe','ejecutiva') then raise exception 'Perfil inválido'; end if;
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

create or replace function cambiar_perfil_usuario(p_user_id uuid, p_rol text, p_ejecutivo text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio perfil'; end if;
  if p_rol not in ('admin','jefe','ejecutiva') then raise exception 'Perfil inválido'; end if;
  if p_rol = 'ejecutiva' and coalesce(trim(p_ejecutivo), '') = '' then
    raise exception 'Debes indicar a qué ejecutiva corresponde el usuario';
  end if;
  insert into perfiles_ejecutivas (user_id, email, rol, ejecutivo)
  select u.id, u.email, p_rol, case when p_rol = 'ejecutiva' then trim(p_ejecutivo) else null end
  from auth.users u where u.id = p_user_id
  on conflict (user_id) do update
    set rol = excluded.rol, ejecutivo = excluded.ejecutivo;
end $$;

create or replace function resetear_clave_usuario(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
end $$;

create or replace function eliminar_usuario(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes eliminar tu propio usuario'; end if;
  delete from auth.users where id = p_user_id; -- borra también identities y perfil (cascade)
end $$;

grant execute on function
  crear_usuario(text, text, text, text),
  cambiar_perfil_usuario(uuid, text, text),
  resetear_clave_usuario(uuid, text),
  eliminar_usuario(uuid)
to authenticated;
