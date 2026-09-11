-- Suppress transaction-email jobs created before the activation cutoff feature.
-- The runtime cutoff remains authoritative for activities discovered after this migration.
update public.wallet_activity_notification_outbox as outbox
set status = 'suppressed',
    last_error = 'Activity predates transaction email activation',
    updated_at = now()
from public.wallet_activities as activity
where activity.id = outbox.activity_id
  and outbox.status in ('pending', 'failed', 'sending')
  and activity.confirmed_at < transaction_timestamp();
