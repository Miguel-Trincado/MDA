-- Agrega la fecha de promesa real (columna "Fecha Promesa" del Aval) a
-- cada Opp, para que "Promesados del mes" cuente por la fecha real en
-- que se prometió, no por la fecha en que se subió/detectó el cambio.
alter table cotizaciones add column if not exists fecha_promesa text default '';

-- El historial de cambios de Estado también guarda esta fecha real,
-- junto a la fecha de detección (que se mantiene solo como auditoría
-- de cuándo se cargó el Aval).
alter table cambios_estado_opp add column if not exists fecha_promesa text default '';
