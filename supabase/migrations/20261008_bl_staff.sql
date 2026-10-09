-- Usuarios de oficina (asistente administrativa). Mismo formato {id, rec} que las demás tablas bl_*.
create table if not exists bl_staff (
  id  integer primary key,
  rec jsonb not null
);
alter table bl_staff enable row level security;
-- Solo service_role (Netlify Functions) accede; sin políticas para anon/authenticated.
