CREATE TABLE IF NOT EXISTS public.auto_system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  sr_id text,
  system text NOT NULL CHECK (system IN ('auto_billing', 'materials_autofill', 'form_state')),
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  state_snapshot jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS idx_auto_system_logs_assignment ON public.auto_system_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_auto_system_logs_org_created ON public.auto_system_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_system_logs_expires ON public.auto_system_logs(expires_at);
CREATE INDEX IF NOT EXISTS idx_auto_system_logs_sr ON public.auto_system_logs(sr_id);

ALTER TABLE public.auto_system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_system_logs_insert_own"
  ON public.auto_system_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
  );

CREATE POLICY "auto_system_logs_admin_read"
  ON public.auto_system_logs FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "auto_system_logs_admin_delete"
  ON public.auto_system_logs FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.cleanup_expired_auto_system_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.auto_system_logs WHERE expires_at < now();
END;
$$;