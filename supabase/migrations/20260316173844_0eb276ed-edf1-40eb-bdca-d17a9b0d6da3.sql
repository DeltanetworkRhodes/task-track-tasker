
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS call_status text DEFAULT 'not_called',
  ADD COLUMN IF NOT EXISTS call_notes text,
  ADD COLUMN IF NOT EXISTS last_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_count integer DEFAULT 0;

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_call_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.call_status IS NOT NULL AND NEW.call_status NOT IN ('not_called', 'no_answer', 'sms_sent', 'scheduled', 'declined') THEN
    RAISE EXCEPTION 'Invalid call_status: %. Must be not_called, no_answer, sms_sent, scheduled, or declined', NEW.call_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_call_status_trigger
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_call_status();
