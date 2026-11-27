-- =====================================================================
-- Migración v204: panel de cumplimiento de metas (menú "Metas").
-- Requiere v120, v121, v201 y v203. Es seguro correr varias veces.
--
--  * metas_asignacion: por mes, proyecto y tipo de unidad -> unidades
--    meta y peso (%) en el cumplimiento.
--  * metas_config: por mes -> jefe de ventas, bono por el 100% y escala
--    de bonos por unidades [{"unidades":5,"bono":300000}, ...].
--  * Pueden LEER el administrador, los jefes y quien tenga el menú Metas.
--  * Solo el administrador ESCRIBE (función guardar_metas_mes).
-- =====================================================================

create table if not exists metas_asignacion (
  mes          text not null,
  proyecto     text not null,
  tipo_unidad  text not null,
  unidades     integer not null default 0 check (unidades >= 0),
  peso         numeric not null default 0 check (peso >= 0 and peso <= 100),
  primary key (mes, proyecto, tipo_unidad)
);

create table if not exists metas_config (
  mes         text primary key,
  jefe        text,
  bono_100    numeric not null default 0,
  escala      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table metas_asignacion enable row level security;
alter table metas_config enable row level security;

create or replace function public.puede_ver_metas() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles_ejecutivas
    where user_id = auth.uid()
      and (rol in ('admin','jefe') or coalesce(permisos->>'metas', '') = 'true')
  );
$$;
grant execute on function public.puede_ver_metas() to authenticated;

drop policy if exists "select_metas_asignacion" on metas_asignacion;
drop policy if exists "select_metas_config" on metas_config;
create policy "select_metas_asignacion" on metas_asignacion for select to authenticated using (puede_ver_metas());
create policy "select_metas_config" on metas_config for select to authenticated using (puede_ver_metas());

revoke all on metas_asignacion, metas_config from anon, authenticated;
grant select on metas_asignacion, metas_config to authenticated;
grant all on metas_asignacion, metas_config to service_role;

-- Guarda todo un mes de una vez (reemplaza lo que había de ese mes). Solo administrador.
create or replace function public.guardar_metas_mes(p_mes text, p_asignaciones jsonb, p_config jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador'; end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mes inválido'; end if;

  delete from metas_asignacion where mes = p_mes;
  insert into metas_asignacion (mes, proyecto, tipo_unidad, unidades, peso)
  select p_mes, trim(x->>'proyecto'), trim(x->>'tipo_unidad'),
         greatest(coalesce((x->>'unidades')::int, 0), 0),
         least(greatest(coalesce((x->>'peso')::numeric, 0), 0), 100)
  from jsonb_array_elements(coalesce(p_asignaciones, '[]'::jsonb)) x
  where coalesce(trim(x->>'proyecto'), '') <> '' and coalesce(trim(x->>'tipo_unidad'), '') <> '';

  insert into metas_config (mes, jefe, bono_100, escala, updated_at)
  values (p_mes, nullif(trim(coalesce(p_config->>'jefe', '')), ''),
          greatest(coalesce((p_config->>'bono_100')::numeric, 0), 0),
          coalesce(p_config->'escala', '[]'::jsonb), now())
  on conflict (mes) do update
    set jefe = excluded.jefe, bono_100 = excluded.bono_100, escala = excluded.escala, updated_at = now();
end $$;
grant execute on function public.guardar_metas_mes(text, jsonb, jsonb) to authenticated;
