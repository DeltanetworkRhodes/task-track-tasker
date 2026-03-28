
CREATE OR REPLACE FUNCTION public.auto_create_survey_on_pre_committed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pre_committed' AND (OLD.status IS DISTINCT FROM 'pre_committed') THEN
    -- Only create survey if technician_id is set (required field)
    IF NEW.technician_id IS NOT NULL THEN
      -- Check if a survey already exists for this SR in this org
      IF NOT EXISTS (
        SELECT 1 FROM public.surveys 
        WHERE sr_id = NEW.sr_id 
        AND (organization_id = NEW.organization_id OR (organization_id IS NULL AND NEW.organization_id IS NULL))
      ) THEN
        INSERT INTO public.surveys (sr_id, area, technician_id, organization_id, status, comments)
        VALUES (NEW.sr_id, NEW.area, NEW.technician_id, NEW.organization_id, 'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ', '');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_survey_on_pre_committed
AFTER UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_survey_on_pre_committed();
