
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to trigger process-survey-completion via HTTP
CREATE OR REPLACE FUNCTION public.trigger_survey_processing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Build the Edge Function URL
  edge_function_url := current_setting('app.settings.supabase_url', true);
  IF edge_function_url IS NULL THEN
    edge_function_url := 'https://goioxtwfyjlyvefhytpi.supabase.co';
  END IF;
  edge_function_url := edge_function_url || '/functions/v1/process-survey-completion';

  -- Get service role key
  service_role_key := current_setting('app.settings.service_role_key', true);
  IF service_role_key IS NULL THEN
    -- Try from vault
    SELECT decrypted_secret INTO service_role_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' 
    LIMIT 1;
  END IF;

  -- Fire-and-forget HTTP POST to the edge function
  SELECT net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'survey_id', NEW.id,
      'sr_id', NEW.sr_id,
      'area', NEW.area
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
    )
  ) INTO request_id;

  RAISE LOG 'Triggered survey processing for survey %, request_id: %', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Create trigger on survey INSERT
DROP TRIGGER IF EXISTS trg_process_survey_on_insert ON public.surveys;
CREATE TRIGGER trg_process_survey_on_insert
  AFTER INSERT ON public.surveys
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_survey_processing();
