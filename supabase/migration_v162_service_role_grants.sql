-- v162: permisos para la función de sincronización del Aval (api/aval-sync).
-- Usa la clave service_role: normalmente ya tiene acceso, pero si las tablas se
-- crearon con permisos restringidos, esto lo asegura. Es seguro correrlo varias veces.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.aval_completo to service_role;
grant select, insert on public.cargas_archivos to service_role;
do $$ begin
  if exists (select 1 from pg_class where relname = 'cargas_archivos_id_seq') then
    execute 'grant usage, select on sequence public.cargas_archivos_id_seq to service_role';
  end if;
end $$;
