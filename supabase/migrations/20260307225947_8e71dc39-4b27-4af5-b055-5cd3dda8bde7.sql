ALTER TABLE public.inspection_reports 
  ADD COLUMN IF NOT EXISTS routing_aerial_notes text,
  ADD COLUMN IF NOT EXISTS routing_other_notes text,
  ADD COLUMN IF NOT EXISTS sidewalk_excavation boolean,
  ADD COLUMN IF NOT EXISTS entry_pipe_notes text;