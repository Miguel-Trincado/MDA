-- v159: la tipología del Dashboard sale de la columna "Tipologia" del listado de precios (sin la letra entre paréntesis).
alter table public.lista_tipo_unidad add column if not exists tipologia text default '';
