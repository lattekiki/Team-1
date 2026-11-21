alter table jobs
  add column negotiable boolean not null default false,
  add column payment_terms text not null default '';

alter table applications
  add column proposed_pay numeric(12, 2) check (proposed_pay >= 0);
