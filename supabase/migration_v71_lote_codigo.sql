-- =====================================================================
-- Migración v71: permite identificar automáticamente qué unidad se
-- vendió en cada Opp promesada, para la pestaña Comisiones.
--
-- El Maestro Aval trae una columna "Lote" cuyo código coincide con la
-- columna "Codigo" del listado de precios. Antes de esta migración,
-- Comisiones exigía elegir la unidad a mano por cada Opp; con estas dos
-- columnas nuevas, la app cruza automáticamente Lote (Aval) = Codigo
-- (listado de precios) y trae el precio y descuento sin intervención
-- manual.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

alter table cotizaciones   add column if not exists lote   text default '';
alter table lista_precios  add column if not exists codigo text default '';

create index if not exists idx_lista_precios_codigo on lista_precios (codigo);
