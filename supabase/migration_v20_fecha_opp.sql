-- =====================================================================
-- Migración v20: agrega la columna "fecha_opp" a la tabla cotizaciones
-- (columna "Fecha Opp" del Maestro Aval, usada para "Fecha Opp" en la
--  cartera de cada ejecutivo).
--
-- Cómo usarlo: entra a tu proyecto en supabase.com/dashboard →
-- SQL Editor → New query, pega esto y presiona Run.
-- Es seguro correrlo aunque ya hayas corrido schema.sql antes.
-- =====================================================================

alter table cotizaciones add column if not exists fecha_opp text default '';

-- Las cotizaciones cargadas antes de esta migración quedarán con
-- fecha_opp en blanco hasta la próxima vez que subas el Maestro Aval.
