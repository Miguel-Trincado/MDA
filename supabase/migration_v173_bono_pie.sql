-- v173: marcar cuotas como "Bono pie" (bono entregado al cliente sin pago: no se suma a lo adeudado).
-- Es seguro correr este script varias veces. Requiere la migración v167 (es_admin_o_jefe).
create table if not exists public.cuotas_bono_pie (
  opp                 text not null,
  tipo_financiamiento text not null,
  nro_cuota           integer not null,
  marcado_por         text default '',
  updated_at          timestamptz not null default now(),
  primary key (opp, tipo_financiamiento, nro_cuota)
);
alter table public.cuotas_bono_pie enable row level security;
drop policy if exists "gestion_all_cuotas_bono_pie" on public.cuotas_bono_pie;
create policy "gestion_all_cuotas_bono_pie" on public.cuotas_bono_pie
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());
grant select, insert, update, delete on public.cuotas_bono_pie to authenticated;
grant select, insert, update, delete on public.cuotas_bono_pie to service_role;
