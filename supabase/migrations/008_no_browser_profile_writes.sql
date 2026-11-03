-- ============================================================
-- 008 — No browser writes to profiles or the credit ledger
-- ============================================================
-- profiles is written only by the server (service role) and the sign-up
-- trigger (security definer). The "Users can update own profile" policy
-- let a signed-in user update every column of their own row, credits and
-- is_premium included: RLS limits rows, not columns, and Supabase grants
-- UPDATE on every column to `authenticated` by default. No client writes
-- profiles directly.
--
-- Re-runnable; touches no row. The SQL Editor's "destructive operations"
-- warning reacts to the words drop and revoke. The same statements are in
-- supabase/schema.sql, so a fresh project gets them there. Record the apply
-- in supabase/migrations/README.md.
drop policy if exists "Users can update own profile" on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.credit_transactions from anon, authenticated;
