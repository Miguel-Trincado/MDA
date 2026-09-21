select count(*) as total_filas, count(distinct opp) as opp_unicas, count(distinct rut) as rut_unicos
from cotizaciones;
