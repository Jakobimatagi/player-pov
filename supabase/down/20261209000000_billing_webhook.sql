-- Rollback for 20261209000000_billing_webhook.sql.

begin;

drop function if exists public.billing_apply_subscription(
  text, text, timestamptz, uuid, text, text, text, text, timestamptz, int
);
drop function if exists public.billing_account_for_team(uuid, uuid);
alter table public.billing_accounts drop column if exists stripe_event_at;

commit;
