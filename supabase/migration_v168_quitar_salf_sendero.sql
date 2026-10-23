-- v168: Cuotas y Pagos ya no maneja los proyectos SALF y Sendero del Monte.
delete from public.cuotas_pago
where proyecto ilike '%salf%' or proyecto ilike '%sendero%';
