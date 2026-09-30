-- =====================================================================
-- Migración v84: el Maestro Aval trae una columna "Precio Lista" con el
-- precio REAL de venta de esa Opp — a veces ya viene sumado con otras
-- unidades del mismo cliente (depto + estacionamiento + bodega, etc.),
-- por eso puede no coincidir con el precio de una sola unidad en el
-- listado de precios. Comisiones ahora usa este valor como base del
-- cálculo (aplicándole el % de descuento de la unidad principal), en vez
-- del precio genérico de lista_precios.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

alter table cotizaciones add column if not exists precio_lista numeric;
