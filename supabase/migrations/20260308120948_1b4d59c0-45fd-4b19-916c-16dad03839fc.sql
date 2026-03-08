
-- Add lat/lng to assignments for geocoded locations
ALTER TABLE public.assignments 
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;
