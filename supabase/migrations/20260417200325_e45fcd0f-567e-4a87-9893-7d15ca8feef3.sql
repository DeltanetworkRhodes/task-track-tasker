ALTER TABLE public.constructions
  ADD COLUMN IF NOT EXISTS bep_placement_floor text DEFAULT 'ΙΣ',
  ADD COLUMN IF NOT EXISTS vertical_infra_type text DEFAULT '';