-- Expand payment tracking for manual / mock-escrow modes (SRS §12: no real escrow until legal review).
alter table pairings drop constraint if exists pairings_payment_status_check;
alter table pairings
  add constraint pairings_payment_status_check
  check (payment_status in ('not_required', 'pending', 'held', 'paid', 'refunded', 'failed'));

alter table pairings
  add column if not exists payment_amount_etb numeric(12, 2),
  add column if not exists payment_external_id text,
  add column if not exists payment_held_at timestamptz,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_refunded_at timestamptz;

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references pairings (id) on delete cascade,
  provider text not null,
  action text not null
    check (action in ('create', 'hold', 'release', 'mark_paid', 'refund', 'fail')),
  amount_etb numeric(12, 2),
  external_id text,
  note text not null default '',
  actor_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_pairing_idx on payment_events (pairing_id, created_at desc);
