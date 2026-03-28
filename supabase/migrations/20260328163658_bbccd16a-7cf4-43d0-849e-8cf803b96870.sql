
-- Backfill existing pre_committed assignments into surveys
INSERT INTO public.surveys (sr_id, area, technician_id, organization_id, status, comments)
SELECT a.sr_id, a.area, a.technician_id, a.organization_id, 'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ', ''
FROM public.assignments a
WHERE a.status = 'pre_committed'
  AND a.technician_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.surveys s WHERE s.sr_id = a.sr_id
  );

-- Recreate trigger to fire on INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_auto_create_survey_on_pre_committed ON public.assignments;
CREATE TRIGGER trg_auto_create_survey_on_pre_committed
AFTER INSERT OR UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_survey_on_pre_committed();
