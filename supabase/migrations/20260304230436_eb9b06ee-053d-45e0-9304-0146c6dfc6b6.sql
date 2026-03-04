
-- Add customer fields to assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cab text,
  ADD COLUMN IF NOT EXISTS source_tab text;

-- Create work_pricing table for ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ
CREATE TABLE IF NOT EXISTS public.work_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'τεμ.',
  unit_price numeric NOT NULL DEFAULT 0,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view work_pricing"
  ON public.work_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert work_pricing"
  ON public.work_pricing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update work_pricing"
  ON public.work_pricing FOR UPDATE
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_work_pricing_updated_at
  BEFORE UPDATE ON public.work_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
