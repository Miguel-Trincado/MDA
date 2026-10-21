-- v147: el Dashboard lee el Aval completo (todos los proyectos y todos los estados).
-- Tabla aparte: no toca "cotizaciones" (que sigue usándose en Comisiones, Ejecutivo, etc.).
create table if not exists public.aval_completo (
  opp                text primary key,
  rut                text default '',
  cliente            text default '',
  ejecutivo          text default '',
  proyecto           text default '',
  estado             text default '',
  tipologia          text default '',
  region             text default '',
  lote               text default '',
  fecha              text default '',   -- Fecha Cotización
  fecha_opp          text default '',
  fecha_reserva      text default '',
  fecha_cierre       text default '',
  fecha_promesa      text default '',
  fecha_escritura    text default '',
  fecha_desistimiento text default '',
  created_at         timestamptz not null default now()
);
create index if not exists aval_completo_estado_idx on public.aval_completo (estado);
create index if not exists aval_completo_ejecutivo_idx on public.aval_completo (ejecutivo);

alter table public.aval_completo enable row level security;

drop policy if exists aval_completo_select on public.aval_completo;
create policy aval_completo_select on public.aval_completo for select using (true);

drop policy if exists aval_completo_ins on public.aval_completo;
create policy aval_completo_ins on public.aval_completo for insert to authenticated with check (true);

drop policy if exists aval_completo_upd on public.aval_completo;
create policy aval_completo_upd on public.aval_completo for update to authenticated using (true) with check (true);

drop policy if exists aval_completo_del on public.aval_completo;
create policy aval_completo_del on public.aval_completo for delete to authenticated using (true);

grant select on public.aval_completo to anon, authenticated;
grant insert, update, delete on public.aval_completo to authenticated;
