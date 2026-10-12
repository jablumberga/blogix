-- Km diarios por dispositivo GPS (TrackSolid Pro). Mismo formato {id, rec} que las demás tablas bl_*.
-- rec: { id, imei, truckId, date (YYYY-MM-DD), km, syncedAt }
create table if not exists bl_gps_km (
  id  integer primary key,
  rec jsonb not null
);
alter table bl_gps_km enable row level security;
-- Solo service_role (Netlify Functions) accede; sin políticas para anon/authenticated.
