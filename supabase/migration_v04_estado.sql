-- =====================================================================
-- Migración v04: agrega la columna "estado" a la tabla cotizaciones
-- (Estado de la oportunidad en el Maestro Aval: Cotización, Promesada,
--  Reservada, Anulada, Desistida, Caducada, etc.)
--
-- Cómo usarlo: entra a tu proyecto en supabase.com/dashboard →
-- SQL Editor → New query, pega esto y presiona Run.
-- Es seguro correrlo aunque ya hayas corrido schema.sql antes
-- (usa "if not exists", no borra ni duplica nada).
-- =====================================================================

alter table cotizaciones add column if not exists estado text default '';

-- Las cotizaciones ya cargadas antes de esta migración quedarán con
-- estado en blanco hasta la próxima vez que subas el Maestro Aval
-- (el sistema actualiza el campo automáticamente en cada carga).
