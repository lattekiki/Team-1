-- Core schema for the marketplace MVP. See docs/PLAN.md section 4.
-- Status columns use text + CHECK instead of Postgres enums so values can change without enum migrations.

create table users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  username text,
  language text not null default 'en' check (language in ('en', 'am', 'om')),
  role text not null default 'user' check (role in ('user', 'support', 'admin')),
  active_mode text not null default 'worker' check (active_mode in ('worker', 'employer')),
  identity_verified boolean not null default false,
  high_trust_approved boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_username_lower_key on users (lower(username));

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_codes_phone_created_idx on otp_codes (phone, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table worker_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  bio text not null default '',
  experience_level text not null default 'beginner'
    check (experience_level in ('beginner', 'intermediate', 'experienced', 'expert')),
  availability text not null default '',
  area text not null default '',
  landmark text not null default '',
  travel_km int not null default 5 check (travel_km between 0 and 100),
  updated_at timestamptz not null default now()
);

create table employer_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  employer_type text not null default 'individual'
    check (employer_type in ('individual', 'household', 'business', 'institution')),
  business_name text,
  area text not null default '',
  updated_at timestamptz not null default now()
);

create table job_categories (
  id serial primary key,
  slug text not null unique,
  name text not null,
  tier text not null check (tier in ('ordinary', 'skilled', 'vip')),
  active boolean not null default true
);

create table skills (
  id serial primary key,
  slug text not null unique,
  name text not null,
  category_id int references job_categories (id)
);

create table user_skills (
  user_id uuid not null references users (id) on delete cascade,
  skill_id int not null references skills (id),
  details text not null default '',
  primary key (user_id, skill_id)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references users (id),
  category_id int not null references job_categories (id),
  tier text not null check (tier in ('ordinary', 'skilled', 'vip')),
  invited_worker_id uuid references users (id),
  title text not null check (length(title) between 3 and 120),
  description text not null default '',
  area text not null,
  landmark text not null default '',
  lat numeric(9, 6),
  lng numeric(9, 6),
  starts_at timestamptz,
  ends_at timestamptz,
  pay_type text not null check (pay_type in ('hourly', 'daily', 'fixed', 'recurring', 'negotiable')),
  pay_min numeric(12, 2) check (pay_min >= 0),
  pay_max numeric(12, 2) check (pay_max >= 0),
  workers_needed int not null default 1 check (workers_needed between 1 and 100),
  application_deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'filled', 'cancelled', 'expired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (pay_max is null or pay_min is null or pay_max >= pay_min)
);
create index jobs_status_starts_idx on jobs (status, starts_at);
create index jobs_employer_idx on jobs (employer_id);
create index jobs_category_idx on jobs (category_id);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  worker_id uuid not null references users (id),
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'selected', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index applications_worker_idx on applications (worker_id);

create table pairings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  employer_id uuid not null references users (id),
  worker_id uuid not null references users (id),
  application_id uuid unique references applications (id),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'in_progress', 'completed', 'declined', 'cancelled', 'disputed')),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'refunded')),
  confirmed_at timestamptz,
  started_at timestamptz,
  employer_completed_at timestamptz,
  worker_completed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id),
  check (employer_id <> worker_id)
);
create index pairings_employer_idx on pairings (employer_id);
create index pairings_worker_idx on pairings (worker_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references pairings (id),
  reviewer_id uuid not null references users (id),
  reviewee_id uuid not null references users (id),
  overall smallint not null check (overall between 1 and 5),
  reliability smallint check (reliability between 1 and 5),
  communication smallint check (communication between 1 and 5),
  quality smallint check (quality between 1 and 5),
  body text not null default '',
  moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'hidden', 'flagged')),
  created_at timestamptz not null default now(),
  unique (pairing_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);
create index reviews_reviewee_idx on reviews (reviewee_id);

create table rebookings (
  id uuid primary key default gen_random_uuid(),
  original_pairing_id uuid not null references pairings (id),
  new_job_id uuid not null unique references jobs (id),
  worker_id uuid not null references users (id),
  new_pairing_id uuid references pairings (id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id),
  target_type text not null check (target_type in ('user', 'job', 'pairing', 'review')),
  target_id uuid not null,
  reason text not null check (length(reason) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on reports (status, created_at);

create table verification_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('identity', 'skill', 'high_trust')),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references users (id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index verification_one_pending_per_kind
  on verification_records (user_id, kind) where status = 'pending';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table audit_logs (
  id bigserial primary key,
  actor_id uuid references users (id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
