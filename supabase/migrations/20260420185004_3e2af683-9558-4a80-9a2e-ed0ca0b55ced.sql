CREATE TABLE IF NOT EXISTS public.photo_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phase INT NOT NULL CHECK (phase IN (1, 2, 3)),
  building_type building_type_enum,
  category_key TEXT NOT NULL,
  category_label TEXT NOT NULL,
  category_icon TEXT DEFAULT '📷',
  min_count INT NOT NULL DEFAULT 1 CHECK (min_count >= 0),
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two partial unique indexes to handle NULL building_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_req_unique_with_bt
  ON public.photo_requirements(organization_id, phase, building_type, category_key)
  WHERE building_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_req_unique_no_bt
  ON public.photo_requirements(organization_id, phase, category_key)
  WHERE building_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_photo_req_org_phase 
  ON public.photo_requirements(organization_id, phase);

ALTER TABLE public.photo_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view photo_requirements"
  ON public.photo_requirements FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()) OR organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage photo_requirements"
  ON public.photo_requirements FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())))
  WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())));

CREATE TRIGGER trg_photo_req_updated_at
  BEFORE UPDATE ON public.photo_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.completion_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  construction_id UUID REFERENCES public.constructions(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  sr_id TEXT NOT NULL,
  phase INT NOT NULL CHECK (phase IN (1, 2, 3)),
  overridden_by UUID NOT NULL,
  reason TEXT NOT NULL,
  missing_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_completion_overrides_org ON public.completion_overrides(organization_id);
CREATE INDEX IF NOT EXISTS idx_completion_overrides_sr ON public.completion_overrides(sr_id);

ALTER TABLE public.completion_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view completion_overrides"
  ON public.completion_overrides FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())));

CREATE POLICY "Admins can insert completion_overrides"
  ON public.completion_overrides FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())));

INSERT INTO public.photo_requirements 
  (organization_id, phase, building_type, category_key, category_label, category_icon, min_count, is_required, sort_order)
SELECT 
  o.id, r.phase, NULL::building_type_enum, r.key, r.label, r.icon, r.min_count, r.required, r.sort
FROM public.organizations o
CROSS JOIN (VALUES 
  (3, 'BEP', 'BEP', '🔌', 2, true, 1),
  (3, 'BMO', 'BMO', '📡', 2, true, 2),
  (3, 'FB', 'Floor Box', '📋', 1, true, 3),
  (3, 'KAMPINA', 'Καμπίνα', '🏗️', 1, true, 4),
  (3, 'BCP', 'BCP', '📦', 0, false, 5),
  (3, 'G_FASI', 'Γ Φάση', '✨', 0, false, 6)
) AS r(phase, key, label, icon, min_count, required, sort)
ON CONFLICT DO NOTHING;