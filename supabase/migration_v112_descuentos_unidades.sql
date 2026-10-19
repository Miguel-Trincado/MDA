-- v112: guarda en la base el descuento % por unidad (DEPARTAMENTO) que
-- MDA maneja aparte, para que no se pierda cada vez que se sube un nuevo
-- listado de precios sin esa columna. Tabla independiente de lista_precios
-- (que siempre se reemplaza entera con cada carga) — esta es la referencia
-- fija por unidad, y el Simulador la usa automáticamente para rellenar el
-- descuento máximo de cada unidad cuando el listado subido no lo trae.
--
-- Segura de correr varias veces (IF NOT EXISTS + upsert de los datos).

create table if not exists descuentos_unidades (
  unidad         text primary key,
  descuento_pct  numeric not null,
  updated_at     timestamptz not null default now()
);

alter table descuentos_unidades enable row level security;

drop policy if exists "select_descuentos_unidades" on descuentos_unidades;
drop policy if exists "auth_insert_descuentos_unidades" on descuentos_unidades;
drop policy if exists "auth_update_descuentos_unidades" on descuentos_unidades;
drop policy if exists "auth_delete_descuentos_unidades" on descuentos_unidades;

create policy "select_descuentos_unidades" on descuentos_unidades for select using (true);
create policy "auth_insert_descuentos_unidades" on descuentos_unidades for insert to authenticated with check (true);
create policy "auth_update_descuentos_unidades" on descuentos_unidades for update to authenticated using (true) with check (true);
create policy "auth_delete_descuentos_unidades" on descuentos_unidades for delete to authenticated using (true);

grant select on descuentos_unidades to anon, authenticated;
grant insert, update, delete on descuentos_unidades to authenticated;

-- Datos entregados por MDA (% de descuento por unidad/departamento).
insert into descuentos_unidades (unidad, descuento_pct) values
  ('101', 10.0),
  ('102', 10.0),
  ('103', 10.0),
  ('104', 10.0),
  ('105', 10.0),
  ('106', 10.0),
  ('107', 10.0),
  ('108', 10.0),
  ('109', 10.0),
  ('201', 10.0),
  ('202', 9.0),
  ('203', 9.0),
  ('204', 9.0),
  ('205', 9.0),
  ('206', 9.0),
  ('207', 9.0),
  ('208', 9.0),
  ('209', 9.0),
  ('210', 9.0),
  ('301', 8.0),
  ('302', 8.0),
  ('303', 8.0),
  ('304', 8.0),
  ('305', 8.0),
  ('306', 8.0),
  ('307', 8.0),
  ('308', 8.0),
  ('309', 8.0),
  ('310', 8.0),
  ('401', 8.0),
  ('402', 8.0),
  ('403', 8.0),
  ('404', 8.0),
  ('405', 8.0),
  ('406', 8.0),
  ('407', 8.0),
  ('408', 8.0),
  ('409', 8.0),
  ('410', 8.0),
  ('501', 7.0),
  ('502', 7.0),
  ('503', 7.0),
  ('504', 7.0),
  ('505', 7.0),
  ('506', 7.0),
  ('507', 7.0),
  ('508', 7.0),
  ('509', 7.0),
  ('510', 7.0),
  ('601', 7.0),
  ('602', 7.0),
  ('603', 7.0),
  ('604', 7.0),
  ('605', 7.0),
  ('606', 7.0),
  ('607', 7.0),
  ('608', 7.0),
  ('609', 7.0),
  ('610', 7.0),
  ('701', 7.0),
  ('702', 7.0),
  ('703', 7.0),
  ('704', 7.0),
  ('705', 7.0),
  ('706', 7.0),
  ('707', 7.0),
  ('708', 7.0),
  ('709', 7.0),
  ('710', 7.0),
  ('801', 7.0),
  ('802', 7.0),
  ('803', 7.0),
  ('804', 7.0),
  ('805', 7.0),
  ('806', 7.0),
  ('807', 7.0),
  ('808', 7.0),
  ('809', 7.0),
  ('810', 7.0),
  ('901', 6.0),
  ('902', 6.0),
  ('903', 6.0),
  ('904', 6.0),
  ('905', 6.0),
  ('906', 6.0),
  ('907', 6.0),
  ('908', 6.0),
  ('909', 6.0),
  ('910', 6.0),
  ('1001', 6.0),
  ('1002', 6.0),
  ('1003', 6.0),
  ('1004', 6.0),
  ('1005', 6.0),
  ('1006', 6.0),
  ('1007', 6.0),
  ('1008', 6.0),
  ('1009', 6.0),
  ('1010', 6.0),
  ('1101', 6.0),
  ('1102', 6.0),
  ('1103', 6.0),
  ('1104', 6.0),
  ('1105', 6.0),
  ('1106', 6.0),
  ('1107', 6.0),
  ('1108', 6.0),
  ('1109', 6.0),
  ('1110', 6.0),
  ('1201', 6.0),
  ('1202', 6.0),
  ('1203', 6.0),
  ('1204', 6.0),
  ('1205', 6.0),
  ('1206', 6.0),
  ('1207', 6.0),
  ('1208', 6.0),
  ('1209', 6.0),
  ('1210', 6.0)
on conflict (unidad) do update set descuento_pct = excluded.descuento_pct, updated_at = now();
