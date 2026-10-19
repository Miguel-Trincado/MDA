-- v100: el Dashboard ahora resuelve la Tipología de cada Opp cruzando el
-- "Lote" del Aval con el "Codigo" del listado de precios y usando la
-- columna "Tipología Reporte" de esa fila (el Aval a veces trae la
-- Tipología mal o vacía). Para eso, la tabla lista_precios necesita esta
-- columna nueva. Segura de correr varias veces (IF NOT EXISTS).

alter table lista_precios
  add column if not exists tipologia_reporte text;
