ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS source_dataset text, ADD COLUMN IF NOT EXISTS source_external_id text, ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS claimed_business_id uuid;
CREATE INDEX IF NOT EXISTS idx_locations_source_dataset_external ON public.locations(source_dataset,source_external_id);
CREATE INDEX IF NOT EXISTS idx_locations_claimed_business ON public.locations(claimed_business_id);
UPDATE public.locations SET source_dataset=COALESCE(source_dataset,'kleenest'), source_metadata=COALESCE(source_metadata,'{}'::jsonb) WHERE source_dataset IS NULL;
