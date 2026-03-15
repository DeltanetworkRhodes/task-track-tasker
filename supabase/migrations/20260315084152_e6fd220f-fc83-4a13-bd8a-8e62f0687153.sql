
-- Add new columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_price decimal(8,2) DEFAULT 600.00,
  ADD COLUMN IF NOT EXISTS notes text;

-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  target text DEFAULT 'all'
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can view announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    AND (target = 'all' OR target = get_user_org_id(auth.uid())::text)
  );

-- Create org_activity table
CREATE TABLE IF NOT EXISTS public.org_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.org_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage org_activity"
  ON public.org_activity FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_org_activity_org_id ON public.org_activity(organization_id);
