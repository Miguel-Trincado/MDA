-- v104: Comisiones deja de calcular el descuento como % desde el listado
-- de precios y pasa a tomarlo desde el Aval, en UF: la suma de las
-- columnas del Aval donde puede venir un cupón o descuento aplicado a esa
-- Opp (Cupon Uni. Principal, Cupon Estacionamiento, Cupon Bodega, Cupon
-- Ahorro Previo, Cupon Pago Contra Escritura, Descuento Uni. Principal,
-- Descuento Estacionamiento). Columnas ausentes o vacías cuentan como 0.
--
-- Se necesitan dos columnas nuevas:
-- 1) cotizaciones.descuento_uf_aval: el monto calculado desde el Aval
--    para esa Opp (lo llena el Maestro Aval, igual que lote/precio_lista).
-- 2) comisiones_ventas.descuento_uf: el monto que efectivamente se usa en
--    el cálculo de esa venta (reemplaza en la práctica a descuento_pct,
--    que se deja intacta sin usar, por si hace falta revisar el dato
--    histórico).
--
-- Segura de correr varias veces (IF NOT EXISTS).

alter table cotizaciones
  add column if not exists descuento_uf_aval numeric;

alter table comisiones_ventas
  add column if not exists descuento_uf numeric;
