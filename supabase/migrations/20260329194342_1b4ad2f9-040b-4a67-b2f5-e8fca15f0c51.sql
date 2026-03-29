
CREATE TABLE public.daily_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  backup_date date NOT NULL DEFAULT CURRENT_DATE,
  backup_type text NOT NULL DEFAULT 'full_snapshot',
  assignments_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  materials_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignments_count integer NOT NULL DEFAULT 0,
  materials_count integer NOT NULL DEFAULT 0,
  changes_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, backup_date)
);

ALTER TABLE public.daily_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view own org backups"
  ON public.daily_backups FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid()) OR 
    (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Service role can manage backups"
  ON public.daily_backups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_daily_backups_org_date ON public.daily_backups(organization_id, backup_date DESC);
