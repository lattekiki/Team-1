-- Track which object store holds each verification document (local disk or S3-compatible).
alter table verification_documents
  add column if not exists storage_backend text not null default 'local'
    check (storage_backend in ('local', 's3'));
