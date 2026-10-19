-- v110: el Simulador ahora también puede generar simulaciones para RUTs
-- que todavía no existen en la cartera (gestion) — ej. un prospecto nuevo
-- que aún no cotiza por el Aval. Hasta ahora, cotizaciones_generadas.rut_cliente
-- tenía una llave foránea hacia gestion(rut), así que guardar una
-- simulación para un RUT fuera de gestion fallaba. Se quita esa llave
-- foránea; la columna sigue existiendo igual, solo que ya no exige que el
-- RUT esté en gestion.
--
-- Segura de correr varias veces (IF EXISTS).

alter table cotizaciones_generadas
  drop constraint if exists cotizaciones_generadas_rut_cliente_fkey;
