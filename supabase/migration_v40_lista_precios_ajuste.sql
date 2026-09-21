-- =====================================================================
-- Migración: ajusta lista_precios al formato real del listado de
-- unidades de Pilpilén.
--
-- Qué cambia:
--   - Agrega las columnas "tipo" (Departamento / Estacionamiento /
--     Local Comercial) y "modelo" (A, C, D... solo para departamentos).
--   - Elimina el índice único sobre "unidad": el listado real trae
--     números de unidad repetidos de verdad (ej. estacionamientos con
--     el mismo N° listados más de una vez, con precios distintos), así
--     que no hay ninguna columna que sirva de llave única confiable.
--     Por eso la carga del listado ahora hace un reemplazo completo
--     (borra todo e inserta de nuevo) en vez de un upsert por unidad.
--
-- Es seguro correr esto aunque ya hayas corrido migration_v39_cotizador.sql.
-- =====================================================================

alter table lista_precios add column if not exists tipo text default 'Departamento';
alter table lista_precios add column if not exists modelo text default '';

drop index if exists lista_precios_unidad_unique;
