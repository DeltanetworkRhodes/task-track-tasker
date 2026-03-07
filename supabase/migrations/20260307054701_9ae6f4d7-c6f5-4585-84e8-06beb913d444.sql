
CREATE OR REPLACE FUNCTION public.auto_create_construction_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'construction' AND (OLD.status IS DISTINCT FROM 'construction') THEN
    IF NOT EXISTS (SELECT 1 FROM public.constructions WHERE assignment_id = NEW.id) THEN
      INSERT INTO public.constructions (sr_id, assignment_id, organization_id, status, revenue, material_cost, cab)
      VALUES (NEW.sr_id, NEW.id, NEW.organization_id, 'in_progress', 0, 0, NEW.cab);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
