-- v175: guarda el "Cupon Pago Contra Escritura" del Aval para cruzarlo con la cuota de
-- Pago contra escritura en Cuotas y Pagos. Es seguro correr este script varias veces.
alter table public.aval_completo add column if not exists cupon_contra_escritura numeric;
