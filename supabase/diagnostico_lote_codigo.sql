-- Diagnóstico: ¿por qué una Opp promesada no cruza con el listado de precios?
--
-- 1) Todas las Opp en estado "Promesada" con su Lote (tal como quedó
--    guardado desde el Aval) y el RUT/ejecutivo dueño.
select c.opp, c.rut, c.lote, c.estado, c.fecha_promesa, g.ejecutivo, g.cliente
from cotizaciones c
left join gestion g on g.rut = c.rut
where c.estado = 'Promesada'
order by c.fecha_promesa desc;

-- 2) Todas las filas del listado de precios que tengan Codigo parecido
--    (usa el Lote que te haya mostrado el panel de Comisiones en el
--    recuadro de "Código de Lote en el Aval para esta Opp" y pégalo aquí
--    reemplazando 'XXX'):
select id, unidad, modelo, tipologia, precio, descuento_max, codigo, estado
from lista_precios
where codigo ilike '%XXX%'
   or unidad ilike '%XXX%';

-- 3) Códigos duplicados en el listado de precios (si el mismo Codigo
--    aparece más de una vez, el cruce automático podría estar tomando la
--    fila equivocada — por ejemplo, la que no dice "Promesada"):
select codigo, count(*) as veces, array_agg(estado) as estados
from lista_precios
where codigo <> ''
group by codigo
having count(*) > 1;
