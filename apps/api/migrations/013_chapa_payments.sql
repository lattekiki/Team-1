-- Chapa checkout + optional worker payout details for licensed payment rail.
alter table pairings
  add column if not exists payment_checkout_url text;

alter table worker_profiles
  add column if not exists payout_account_name text not null default '',
  add column if not exists payout_account_number text not null default '',
  add column if not exists payout_bank_code integer;

alter table payment_events drop constraint if exists payment_events_action_check;
alter table payment_events
  add constraint payment_events_action_check
  check (action in ('create', 'hold', 'release', 'mark_paid', 'refund', 'fail', 'checkout', 'verify'));
