-- =====================================================================
-- Migración v86:
-- 1) La columna real del Maestro Aval con el precio de la Opp se llama
--    "Precio Lista Opp" (no "Precio Lista" a secas, como se asumió en la
--    v84) — el parser ahora acepta varias formas del nombre en vez de
--    exigir el texto exacto.
-- 2) Se agrega el % de descuento real de la unidad principal, columna
--    "Descuento Uni. Principal" del Aval, para aplicarlo sobre el Precio
--    Lista Opp en vez del descuento genérico del listado de precios.
--
-- Es seguro correr este script varias veces.
-- =====================================================================

alter table cotizaciones add column if not exists descuento_uni_principal numeric;
