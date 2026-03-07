
CREATE OR REPLACE FUNCTION public.auto_create_construction_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When assignment status changes to 'construction', auto-create a construction record if one doesn't exist
  IF NEW.status = 'construction' AND (OLD.status IS DISTINCT FROM 'construction') THEN
    IF NOT EXISTS (SELECT 1 FROM public.constructions WHERE assignment_id = NEW.id) THEN
      INSERT INTO public.constructions (sr_id, assignment_id, organization_id, status, revenue, material_cost)
      VALUES (NEW.sr_id, NEW.id, NEW.organization_id, 'in_progress', 0, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_construction
  AFTER UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_construction_on_status_change();
