
-- Remove the survey INSERT trigger since files aren't uploaded yet at that point
DROP TRIGGER IF EXISTS trg_process_survey_on_insert ON public.surveys;
DROP FUNCTION IF EXISTS public.trigger_survey_processing();
