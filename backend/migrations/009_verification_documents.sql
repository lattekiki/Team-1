-- Local verification document attachments (disk storage; no cloud provider).
create table verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references verification_records (id) on delete cascade,
  original_name text not null check (length(original_name) between 1 and 200),
  stored_name text not null unique,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index verification_documents_record_idx on verification_documents (verification_id, created_at);
