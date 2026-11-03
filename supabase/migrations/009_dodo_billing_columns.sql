-- ============================================================
-- 009 — Dodo billing columns on profiles
-- ============================================================
-- schema.sql has always named the billing columns dodo_customer_id and
-- dodo_subscription_id, and the server reads and writes only those.
-- Production was bootstrapped from an earlier script that named them
-- stripe_customer_id and stripe_subscription_id, so it never had the Dodo
-- columns (found 2026-11-03, before the deploy). Without them the payment
-- webhook, Manage subscription, account deletion and the Premium checks fail
-- with 42703.
--
-- Additive and re-runnable: it adds the two columns and the index schema.sql
-- has, if they are missing, and touches no row. It leaves the stripe_*
-- columns alone: no code reads them, and a Stripe id is not a Dodo id, so
-- nothing is copied. On a project bootstrapped from schema.sql it does
-- nothing. Record the apply in supabase/migrations/README.md.
alter table public.profiles
  add column if not exists dodo_customer_id text unique,
  add column if not exists dodo_subscription_id text;

create index if not exists idx_profiles_dodo_customer_id on public.profiles(dodo_customer_id);

-- Let the REST API see the new columns straight away.
notify pgrst, 'reload schema';
