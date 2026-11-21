-- Pairing disputes: either party freezes an active pairing for staff review.
create table disputes (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null unique references pairings (id),
  opened_by uuid not null references users (id),
  reason text not null check (length(reason) between 5 and 2000),
  prior_status text not null
    check (prior_status in ('pending_confirmation', 'confirmed', 'in_progress')),
  status text not null default 'open'
    check (status in ('open', 'resolved_resume', 'resolved_cancel')),
  resolution_note text,
  resolved_by uuid references users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index disputes_status_idx on disputes (status, created_at desc);
create index disputes_opened_by_idx on disputes (opened_by);
