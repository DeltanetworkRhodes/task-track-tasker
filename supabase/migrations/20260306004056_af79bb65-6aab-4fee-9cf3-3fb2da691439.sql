
ALTER TABLE public.constructions 
  ADD COLUMN IF NOT EXISTS routing_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pending_note text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS routes jsonb DEFAULT '[]'::jsonb;
