-- v177: (1) período de comisiones configurable por mes (por defecto del 25 al 24) y
--       (2) la ejecutiva acepta o rechaza su comisión ya validada, para cerrar el ciclo de pago.
-- Es seguro correr este script varias veces. Requiere v167 (es_admin_o_jefe).

-- 1) Período por mes. El mes se llama por el mes en que TERMINA (25-sep a 24-oct = octubre).
create table if not exists public.comisiones_periodos (
  mes        text primary key,            -- 'AAAA-MM'
  desde      date not null,
  hasta      date not null,
  updated_at timestamptz not null default now()
);
alter table public.comisiones_periodos enable row level security;
drop policy if exists "periodos_lectura" on public.comisiones_periodos;
create policy "periodos_lectura" on public.comisiones_periodos for select to authenticated using (true);
drop policy if exists "periodos_gestion" on public.comisiones_periodos;
create policy "periodos_gestion" on public.comisiones_periodos
  for all to authenticated using (es_admin_o_jefe()) with check (es_admin_o_jefe());
grant select, insert, update, delete on public.comisiones_periodos to authenticated;
grant select, insert, update, delete on public.comisiones_periodos to service_role;

-- 2) Respuesta de la ejecutiva sobre la comisión validada.
alter table public.comisiones_validacion_ejecutivo
  add column if not exists aceptacion text not null default 'pendiente',
  add column if not exists aceptada_at timestamptz,
  add column if not exists motivo_rechazo text;
alter table public.comisiones_validacion_ejecutivo drop constraint if exists comisiones_aceptacion_chk;
alter table public.comisiones_validacion_ejecutivo
  add constraint comisiones_aceptacion_chk check (aceptacion in ('pendiente','aceptada','rechazada'));

create or replace function public.responder_comision(p_mes text, p_decision text, p_motivo text default null)
returns public.comisiones_validacion_ejecutivo
language plpgsql security definer set search_path = public as $$
declare
  v_eje text;
  r public.comisiones_validacion_ejecutivo;
begin
  v_eje := mi_ejecutivo();
  if v_eje is null then raise exception 'Tu usuario no tiene una ejecutiva asignada'; end if;
  if p_decision not in ('aceptada', 'rechazada') then raise exception 'Decisión inválida'; end if;
  if p_decision = 'rechazada' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del rechazo';
  end if;
  update public.comisiones_validacion_ejecutivo
     set aceptacion = p_decision,
         aceptada_at = now(),
         motivo_rechazo = case when p_decision = 'rechazada' then trim(p_motivo) else null end
   where mes = p_mes and ejecutivo = v_eje and validado
   returning * into r;
  if not found then raise exception 'Esta comisión aún no está validada'; end if;
  return r;
end $$;
grant execute on function public.responder_comision(text, text, text) to authenticated;
