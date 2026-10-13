-- Transferencias entre cuentas del Banco (Income, OpEx, Reserva, Suplidores, Caja y las que se agreguen).
-- Mismo formato {id, rec} que las demás tablas bl_*. Solo la usan las Netlify Functions (service_role).
-- rec: { id, date, fromId, toId, amount, note, kind: transfer|distribution|deposit|set_aside, groupId, cobroIds, createdAt, createdBy }
create table if not exists bl_bank_transfers (
  id  bigint primary key,
  rec jsonb  not null
);
alter table bl_bank_transfers enable row level security;
