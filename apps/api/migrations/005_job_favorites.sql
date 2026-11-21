create table job_favorites (
  user_id uuid not null references users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index job_favorites_job_idx on job_favorites (job_id);
create index job_favorites_user_created_idx on job_favorites (user_id, created_at desc);
