-- =====================================================================
-- Migración v206: perfil "Solo ejecutivo".
-- Igual que Ejecutivo (ve solo los datos de su ejecutivo vinculado) pero SIN
-- menús por defecto: el administrador le asigna cada menú a mano
-- (Usuarios > permisos). Nominación y Escrituración siguen siendo solo para
-- administrador y jefe de ventas, salvo que se los asignes.
-- Requiere v120, v121, v203 y v205. Es seguro correr varias veces.
-- =====================================================================
alter table perfiles_ejecutivas drop constraint if exists perfiles_ejecutivas_rol_check;
alter table perfiles_ejecutivas add constraint perfiles_ejecutivas_rol_check check (rol in ('admin','jefe','ejecutiva','solo_ejecutivo'));

create or replace function mi_ejecutivo() returns text
language sql stable security definer set search_path = public as $$
  select ejecutivo from perfiles_ejecutivas where user_id = auth.uid() and rol in ('ejecutiva','solo_ejecutivo');
$$;

create or replace function public.crear_usuario(p_email text, p_password text, p_rol text, p_ejecutivo text default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if p_rol not in ('admin','jefe','ejecutiva','solo_ejecutivo') then raise exception 'Perfil inválido'; end if;
  if p_rol = 'admin' and not es_admin() then raise exception 'Solo el administrador puede crear administradores'; end if;
  if p_rol in ('ejecutiva','solo_ejecutivo') and coalesce(trim(p_ejecutivo), '') = '' then
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
  values (v_id, v_email, p_rol, case when p_rol in ('ejecutiva','solo_ejecutivo') then trim(p_ejecutivo) else null end);

  return v_id;
end $$;

create or replace function public.cambiar_perfil_usuario(p_user_id uuid, p_rol text, p_ejecutivo text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_gestor_usuarios() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio perfil'; end if;
  if es_usuario_admin(p_user_id) and not es_admin() then raise exception 'No se puede modificar a un administrador'; end if;
  if p_rol not in ('admin','jefe','ejecutiva','solo_ejecutivo') then raise exception 'Perfil inválido'; end if;
  if p_rol = 'admin' and not es_admin() then raise exception 'Solo el administrador puede asignar el perfil administrador'; end if;
  if p_rol in ('ejecutiva','solo_ejecutivo') and coalesce(trim(p_ejecutivo), '') = '' then
    raise exception 'Debes indicar a qué ejecutiva corresponde el usuario';
  end if;
  insert into perfiles_ejecutivas (user_id, email, rol, ejecutivo)
  select u.id, u.email, p_rol, case when p_rol in ('ejecutiva','solo_ejecutivo') then trim(p_ejecutivo) else null end
  from auth.users u where u.id = p_user_id
  on conflict (user_id) do update
    set rol = excluded.rol, ejecutivo = excluded.ejecutivo;
end $$;
