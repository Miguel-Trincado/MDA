-- v158: Tipo Unidad por código (todos los proyectos del listado de precios), para el filtro del Dashboard.
-- El Dashboard cruza el "Lote" del Aval con el "Código" del listado y toma su "Tipo Unidad".
create table if not exists public.lista_tipo_unidad (
  codigo     text primary key,
  tipo_unidad text default '',
  proyecto   text default '',
  updated_at timestamptz not null default now()
);

alter table public.lista_tipo_unidad enable row level security;

drop policy if exists lista_tipo_unidad_select on public.lista_tipo_unidad;
create policy lista_tipo_unidad_select on public.lista_tipo_unidad for select using (true);

drop policy if exists lista_tipo_unidad_ins on public.lista_tipo_unidad;
create policy lista_tipo_unidad_ins on public.lista_tipo_unidad for insert to authenticated with check (true);

drop policy if exists lista_tipo_unidad_upd on public.lista_tipo_unidad;
create policy lista_tipo_unidad_upd on public.lista_tipo_unidad for update to authenticated using (true) with check (true);

drop policy if exists lista_tipo_unidad_del on public.lista_tipo_unidad;
create policy lista_tipo_unidad_del on public.lista_tipo_unidad for delete to authenticated using (true);

grant select on public.lista_tipo_unidad to anon, authenticated;
grant insert, update, delete on public.lista_tipo_unidad to authenticated;
