-- v138: diseño editable (tarjetas, títulos y UF). Lo guarda solo el admin; lo leen todos.
create table if not exists public.ui_layout (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ui_layout enable row level security;

drop policy if exists ui_layout_select on public.ui_layout;
create policy ui_layout_select on public.ui_layout for select using (true);

drop policy if exists ui_layout_admin_ins on public.ui_layout;
create policy ui_layout_admin_ins on public.ui_layout for insert to authenticated with check (public.es_admin());

drop policy if exists ui_layout_admin_upd on public.ui_layout;
create policy ui_layout_admin_upd on public.ui_layout for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists ui_layout_admin_del on public.ui_layout;
create policy ui_layout_admin_del on public.ui_layout for delete to authenticated using (public.es_admin());

grant select on public.ui_layout to anon, authenticated;
grant insert, update, delete on public.ui_layout to authenticated;
