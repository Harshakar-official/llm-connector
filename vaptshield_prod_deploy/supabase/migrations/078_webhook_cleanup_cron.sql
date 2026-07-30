-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup of processed webhooks older than 7 days
SELECT cron.schedule(
    'cleanup-processed-webhooks',
    '0 0 * * *',
    $$ DELETE FROM public.processed_webhooks WHERE created_at < NOW() - INTERVAL '7 days' $$
);
