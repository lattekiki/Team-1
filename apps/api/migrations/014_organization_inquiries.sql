create table if not exists organization_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null default '',
  message text not null,
  workers_needed integer not null default 1 check (workers_needed between 1 and 500),
  monthly_etb integer not null default 5000,
  status text not null default 'new' check (status in ('new', 'in_talks', 'agreed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_inquiries_status_idx on organization_inquiries (status, created_at desc);
