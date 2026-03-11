
-- Add payment tracking columns to assignments
ALTER TABLE assignments 
  ADD COLUMN IF NOT EXISTS payment_amount decimal(10,2),
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Create storage bucket for payment documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-docs', 'payment-docs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for payment-docs bucket
CREATE POLICY "Admins can upload payment docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-docs' 
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

CREATE POLICY "Admins can view payment docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-docs' 
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
);
