-- =====================================================================
-- Migración v95 — backfill de cambios_estado_opp
--
-- Bug encontrado: cuando una Opp era NUEVA para el sistema (nunca se
-- había subido un Aval que la trajera) y el Aval ya la mostraba
-- directamente en Estado "Promesada" (se saltó los estados intermedios,
-- o es la primera vez que se sube un Aval), el código NO dejaba
-- registrado ese evento en cambios_estado_opp. Comisiones y "Promesados
-- del mes" en el panel de Jefa dependen EXCLUSIVAMENTE de esa tabla
-- (nunca del Estado guardado en la cotización), así que esas Opp nunca
-- aparecían ahí, aunque la cotización sí tuviera el Estado correcto.
--
-- Caso detectado por el usuario: Opp 52186, Estado "Promesada", Fecha
-- Promesa 30-09-2026 — faltaba en Comisiones de septiembre 2026.
--
-- El código ya se corrigió para que esto no vuelva a pasar (ver
-- src/lib/db.js). Este script repara los datos históricos: inserta un
-- registro en cambios_estado_opp para cada cotización que hoy está
-- "Promesada" y tiene Fecha Promesa, pero que todavía no tiene ningún
-- registro de "pasó a Promesada" en cambios_estado_opp.
--
-- Es seguro correr este script varias veces: no duplica nada, porque el
-- "not exists" evita insertar de nuevo una Opp que ya tiene su registro.
-- =====================================================================

insert into cambios_estado_opp (opp, rut, estado_anterior, estado_nuevo, fecha_promesa)
select c.opp, c.rut, '', c.estado, c.fecha_promesa
from cotizaciones c
where c.estado = 'Promesada'
  and c.fecha_promesa is not null
  and c.fecha_promesa <> ''
  and not exists (
    select 1 from cambios_estado_opp e
    where e.opp = c.opp and e.estado_nuevo = 'Promesada'
  );
