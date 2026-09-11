-- Reconciled on-chain legs are replaced by the wallet owner's Circle-native legs
-- when that wallet later performs its own activity sync.
grant delete on table public.wallet_activity_legs to service_role;
