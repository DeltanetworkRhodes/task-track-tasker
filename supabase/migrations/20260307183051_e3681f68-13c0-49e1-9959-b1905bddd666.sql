CREATE OR REPLACE FUNCTION public.validate_construction_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block transition to 'construction' unless GIS data exists
  IF NEW.status = 'construction' AND (OLD.status IS DISTINCT FROM 'construction') THEN
    IF NOT EXISTS (SELECT 1 FROM public.gis_data WHERE assignment_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot transition to construction without GIS data for assignment %', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_construction_transition
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_construction_transition();