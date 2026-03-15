
-- Add payment control columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS last_payment_date date,
  ADD COLUMN IF NOT EXISTS next_payment_due date,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS payment_notes text;

-- Use validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_payment_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN ('paid', 'overdue', 'suspended') THEN
    RAISE EXCEPTION 'Invalid payment_status: %. Must be paid, overdue, or suspended', NEW.payment_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_status
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_status();
