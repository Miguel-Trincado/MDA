-- =====================================================================
-- Migración v167: Cuotas y Pagos por cliente promesado.
-- Una fila por cuota (reporte de cobranza de Vivet): tipo de financiamiento
-- (Pie, Abono Provisión de Gastos, Pago contra escritura, …), vencimiento,
-- monto de la cuota y lo pagado. Solo administrador y jefe de ventas
-- pueden ver, cargar y borrar (son datos de pagos de clientes).
-- Requiere v120 (tabla perfiles_ejecutivas). Es seguro correr varias veces.
-- =====================================================================

create or replace function es_admin_o_jefe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles_ejecutivas where user_id = auth.uid() and rol in ('admin','jefe'));
$$;
grant execute on function es_admin_o_jefe() to authenticated;

create table if not exists public.cuotas_pago (
  opp                   text not null,
  tipo_financiamiento   text not null,
  nro_cuota             integer not null,
  proyecto              text default '',
  cliente               text default '',
  rut                   text default '',
  estado                text default '',
  fecha_promesa         text default '',
  precio_final          numeric default 0,
  unidad                text default '',
  monto_total           numeric default 0,   -- "Monto Total Financiamiento" del reporte
  cuotas_pactadas       integer default 0,
  fecha_vencimiento     text default '',     -- AAAA-MM-DD
  monto_cuota           numeric default 0,   -- UF
  monto_pagado_uf       numeric default 0,
  monto_pagado_clp      numeric default 0,
  carga                 text default '',     -- marca de la carga que la dejó (para limpiar las que ya no vienen)
  updated_at            timestamptz not null default now(),
  primary key (opp, tipo_financiamiento, nro_cuota)
);
create index if not exists cuotas_pago_proyecto_idx on public.cuotas_pago (proyecto);
create index if not exists cuotas_pago_venc_idx on public.cuotas_pago (fecha_vencimiento);

alter table public.cuotas_pago enable row level security;
drop policy if exists "gestion_all_cuotas_pago" on public.cuotas_pago;
create policy "gestion_all_cuotas_pago" on public.cuotas_pago
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());

grant select, insert, update, delete on public.cuotas_pago to authenticated;
grant select, insert, update, delete on public.cuotas_pago to service_role;
