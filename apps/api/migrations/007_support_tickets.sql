-- User ↔ staff support threads (no external helpdesk).
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  subject text not null check (length(subject) between 3 and 120),
  category text not null
    check (category in ('account', 'job', 'pairing', 'payment', 'safety', 'other')),
  status text not null default 'open'
    check (status in ('open', 'waiting_staff', 'waiting_user', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users (id)
);

create index support_tickets_user_idx on support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on support_tickets (status, updated_at desc);

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on support_ticket_messages (ticket_id, created_at);
