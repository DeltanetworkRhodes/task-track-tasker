ALTER TABLE public.constructions
  ADD COLUMN IF NOT EXISTS vertical_infra text DEFAULT 'ΙΣ',
  ADD COLUMN IF NOT EXISTS ball_marker_bep integer,
  ADD COLUMN IF NOT EXISTS ms_count integer,
  ADD COLUMN IF NOT EXISTS otdr_positions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS floor_meters jsonb DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'constructions_vertical_infra_check'
  ) THEN
    ALTER TABLE public.constructions
      ADD CONSTRAINT constructions_vertical_infra_check
      CHECK (vertical_infra IN ('ΙΣ','ΚΛΙΜΑΚΟΣΤΑΣΙΟ'));
  END IF;
END $$;