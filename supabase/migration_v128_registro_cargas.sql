-- =====================================================================
-- Migración v128: registro de cargas de archivos (Maestro Aval, listado
-- de precios, descuentos por unidad). Cada vez que el administrador sube
-- un archivo queda anotado quién, cuándo y cuál, y TODOS los usuarios lo
-- ven en el menú lateral ("Datos al día"). Los datos mismos ya son
-- compartidos (viven en la base); esto solo deja constancia visible.
-- Requiere v120. Es seguro correr varias veces.
-- =====================================================================

create table if not exists cargas_archivos (
  id         bigint generated always as identity primary key,
  tipo       text not null,               -- 'aval' | 'lista_precios' | 'descuentos'
  archivo    text,
  usuario    text,
  resumen    text,
  created_at timestamptz not null default now()
);
create index if not exists idx_cargas_archivos_tipo on cargas_archivos (tipo, created_at desc);

alter table cargas_archivos enable row level security;
drop policy if exists "select_cargas_archivos" on cargas_archivos;
drop policy if exists "admin_insert_cargas_archivos" on cargas_archivos;
create policy "select_cargas_archivos" on cargas_archivos for select using (true);
create policy "admin_insert_cargas_archivos" on cargas_archivos
  for insert to authenticated with check (es_admin());

grant select on cargas_archivos to anon, authenticated;
grant insert on cargas_archivos to authenticated;
