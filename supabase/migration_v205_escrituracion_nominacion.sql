-- =====================================================================
-- Migración v205: módulos "Escrituración" y "Nominación" (proyecto Sendero).
-- Requiere v120, v121, v201 y v203. Es seguro correr varias veces.
--
--  * escrituracion_config: configuración única (SLA por paso, responsables,
--    vigencias de documentos, fechas límite, bancos). Solo el administrador ESCRIBE
--    (función guardar_escrituracion_config).
--  * escrituracion_casos: una fila por unidad (clave = Opp del Aval) con las fechas
--    de cada paso y los documentos subidos. Escriben quienes tienen el menú.
--  * nominacion_clientes: una fila por cliente (clave = RUT) con el estado de cada
--    documento de la nominación SERVIU.
--  * Bucket privado "escrituracion-docs" para los archivos.
--  * Pueden ver/editar: administrador, jefes y quien tenga el menú
--    correspondiente (permisos.escrituracion / permisos.nominacion = true).
-- =====================================================================

-- ---------- Funciones de permiso ----------
create or replace function public.puede_ver_escrituracion() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles_ejecutivas
    where user_id = auth.uid()
      and (rol in ('admin','jefe') or coalesce(permisos->>'escrituracion', '') = 'true')
  );
$$;
create or replace function public.puede_ver_nominacion() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles_ejecutivas
    where user_id = auth.uid()
      and (rol in ('admin','jefe') or coalesce(permisos->>'nominacion', '') = 'true')
  );
$$;
grant execute on function public.puede_ver_escrituracion() to authenticated;
grant execute on function public.puede_ver_nominacion() to authenticated;

-- ---------- Tablas ----------
create table if not exists escrituracion_config (
  id          integer primary key default 1 check (id = 1),
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
insert into escrituracion_config (id, config) values (1, '{}'::jsonb) on conflict (id) do nothing;

create table if not exists escrituracion_casos (
  clave       text primary key,                -- Opp del Aval
  proyecto    text,
  rut         text,
  cliente     text,
  unidad      text,
  ejecutivo   text,
  banco       text,
  datos       jsonb not null default '{}'::jsonb,   -- { inicio, rep, pasos:{id:{ini,fin}}, docs:{id:{emision,path,name}} }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create table if not exists nominacion_clientes (
  rut           text primary key,              -- sin puntos, con guion: 14400630-5
  proyecto      text,
  n             integer,
  nombre        text,
  modelo        text,
  estado        text,
  programa      text,
  marca         text,
  estado_civil  text,
  telefono      text,
  email         text,
  docs          jsonb not null default '{}'::jsonb,       -- { "0":"OK", "1":"N/A", ... }
  archivos      jsonb not null default '{}'::jsonb,       -- { "0":{path,name}, "c":{path,name,emision} }
  carpeta       text,
  subcategoria  text,
  obs2          text,
  carton        text,
  credito       text,
  serv          text,
  observacion   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);

alter table escrituracion_config enable row level security;
alter table escrituracion_casos enable row level security;
alter table nominacion_clientes enable row level security;

-- ---------- Políticas ----------
drop policy if exists "esc_config_select" on escrituracion_config;
create policy "esc_config_select" on escrituracion_config for select to authenticated using (puede_ver_escrituracion());

drop policy if exists "esc_casos_select" on escrituracion_casos;
drop policy if exists "esc_casos_insert" on escrituracion_casos;
drop policy if exists "esc_casos_update" on escrituracion_casos;
drop policy if exists "esc_casos_delete" on escrituracion_casos;
create policy "esc_casos_select" on escrituracion_casos for select to authenticated using (puede_ver_escrituracion());
create policy "esc_casos_insert" on escrituracion_casos for insert to authenticated with check (puede_ver_escrituracion());
create policy "esc_casos_update" on escrituracion_casos for update to authenticated using (puede_ver_escrituracion()) with check (puede_ver_escrituracion());
create policy "esc_casos_delete" on escrituracion_casos for delete to authenticated using (es_admin());

drop policy if exists "nom_select" on nominacion_clientes;
drop policy if exists "nom_insert" on nominacion_clientes;
drop policy if exists "nom_update" on nominacion_clientes;
drop policy if exists "nom_delete" on nominacion_clientes;
create policy "nom_select" on nominacion_clientes for select to authenticated using (puede_ver_nominacion());
create policy "nom_insert" on nominacion_clientes for insert to authenticated with check (puede_ver_nominacion());
create policy "nom_update" on nominacion_clientes for update to authenticated using (puede_ver_nominacion()) with check (puede_ver_nominacion());
create policy "nom_delete" on nominacion_clientes for delete to authenticated using (es_admin());

revoke all on escrituracion_config, escrituracion_casos, nominacion_clientes from anon, authenticated;
grant select on escrituracion_config to authenticated;
grant select, insert, update, delete on escrituracion_casos, nominacion_clientes to authenticated;
grant all on escrituracion_config, escrituracion_casos, nominacion_clientes to service_role;

-- ---------- Guardar configuración (solo administrador) ----------
create or replace function public.guardar_escrituracion_config(p_config jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  update escrituracion_config set config = coalesce(p_config, '{}'::jsonb), updated_at = now(), updated_by = auth.uid() where id = 1;
end;
$$;
grant execute on function public.guardar_escrituracion_config(jsonb) to authenticated;

-- ---------- Almacenamiento privado de documentos ----------
insert into storage.buckets (id, name, public)
values ('escrituracion-docs', 'escrituracion-docs', false)
on conflict (id) do nothing;

drop policy if exists "escdocs_select" on storage.objects;
drop policy if exists "escdocs_insert" on storage.objects;
drop policy if exists "escdocs_update" on storage.objects;
drop policy if exists "escdocs_delete" on storage.objects;
create policy "escdocs_select" on storage.objects for select to authenticated
  using (bucket_id = 'escrituracion-docs' and (puede_ver_escrituracion() or puede_ver_nominacion()));
create policy "escdocs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'escrituracion-docs' and (puede_ver_escrituracion() or puede_ver_nominacion()));
create policy "escdocs_update" on storage.objects for update to authenticated
  using (bucket_id = 'escrituracion-docs' and (puede_ver_escrituracion() or puede_ver_nominacion()));
create policy "escdocs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'escrituracion-docs' and (puede_ver_escrituracion() or puede_ver_nominacion()));
