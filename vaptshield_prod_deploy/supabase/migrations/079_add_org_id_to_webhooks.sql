-- Add org_id to processed_webhooks for per-org replay protection

DELETE FROM public.processed_webhooks;

ALTER TABLE public.processed_webhooks 
ADD COLUMN org_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.processed_webhooks 
ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.processed_webhooks 
DROP CONSTRAINT IF EXISTS processed_webhooks_pkey CASCADE;

ALTER TABLE public.processed_webhooks 
ADD PRIMARY KEY (delivery_id, org_id);
