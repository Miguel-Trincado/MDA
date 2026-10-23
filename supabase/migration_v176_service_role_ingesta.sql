-- v176: la sincronización automática del Aval (función de Vercel) ahora actualiza también
-- Ejecutivo, Comisiones, Jefa, etc. igual que subir el Aval a mano. Para eso la clave
-- service_role necesita permisos sobre esas tablas. Es seguro correr este script varias veces.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
