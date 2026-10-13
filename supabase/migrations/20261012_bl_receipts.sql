-- Recibos por foto (gastos del camino que suben los choferes). Mismo formato {id, rec} que las demás tablas bl_*.
-- id bigint: los ids son marca de tiempo × 100 (≈1.8e14), no caben en integer.
-- rec: { id, status: draft|pending|rejected|approved|deleted, driverId, photoKey, photoHash, read, fields, changes, ai, … }
create table if not exists bl_receipts (
  id  bigint primary key,
  rec jsonb  not null
);
alter table bl_receipts enable row level security;
-- Solo service_role (Netlify Functions) accede; sin políticas para anon/authenticated.

-- Un recibo = un gasto (respaldo del control del servidor si dos personas aprueban a la vez)
create unique index if not exists bl_expenses_receipt_unique
  on bl_expenses ((rec->>'receiptId'))
  where (rec->>'receiptId') is not null;

-- Fotos: bucket privado (solo JPEG, máx. 4 MB). Se leen únicamente a través de /api/receipts/photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
