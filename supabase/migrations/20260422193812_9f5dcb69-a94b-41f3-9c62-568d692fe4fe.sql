-- =========================================
-- 1. sr_billing_items table
-- =========================================
CREATE TABLE public.sr_billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,

  article_id uuid NOT NULL REFERENCES public.ote_articles(id),
  article_code text NOT NULL,

  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price_eur numeric(10,2) NOT NULL,
  total_eur numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price_eur) STORED,

  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'override')),

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sr_billing_items_assignment_article_unique
    UNIQUE (assignment_id, article_id)
);

CREATE INDEX idx_sr_billing_items_assignment ON public.sr_billing_items(assignment_id);
CREATE INDEX idx_sr_billing_items_org ON public.sr_billing_items(organization_id);

-- updated_at trigger
CREATE TRIGGER sr_billing_items_updated_at
  BEFORE UPDATE ON public.sr_billing_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- 2. RLS
-- =========================================
ALTER TABLE public.sr_billing_items ENABLE ROW LEVEL SECURITY;

-- SELECT: org members + super admin
CREATE POLICY "sr_billing_items_select"
  ON public.sr_billing_items FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_org_id(auth.uid())
  );

-- ADMIN: full management within org
CREATE POLICY "sr_billing_items_admin_all"
  ON public.sr_billing_items FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND organization_id = public.get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND organization_id = public.get_user_org_id(auth.uid()))
  );

-- TECHNICIAN: insert only on own assignments (responsible OR crew member)
CREATE POLICY "sr_billing_items_technician_insert"
  ON public.sr_billing_items FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = sr_billing_items.assignment_id
        AND (
          a.technician_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.sr_crew_assignments sca
            WHERE sca.assignment_id = a.id AND sca.technician_id = auth.uid()
          )
        )
    )
  );

-- TECHNICIAN: update own
CREATE POLICY "sr_billing_items_technician_update"
  ON public.sr_billing_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = sr_billing_items.assignment_id
        AND (
          a.technician_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.sr_crew_assignments sca
            WHERE sca.assignment_id = a.id AND sca.technician_id = auth.uid()
          )
        )
    )
  );

-- TECHNICIAN: delete own
CREATE POLICY "sr_billing_items_technician_delete"
  ON public.sr_billing_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = sr_billing_items.assignment_id
        AND (
          a.technician_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.sr_crew_assignments sca
            WHERE sca.assignment_id = a.id AND sca.technician_id = auth.uid()
          )
        )
    )
  );

-- =========================================
-- 3. View for totals (security_invoker so RLS applies)
-- =========================================
CREATE OR REPLACE VIEW public.sr_billing_totals
WITH (security_invoker = true) AS
SELECT
  a.id AS assignment_id,
  a.sr_id,
  a.organization_id,
  COUNT(sbi.id) AS article_count,
  COALESCE(SUM(sbi.total_eur), 0) AS total_ote_eur,
  MAX(sbi.updated_at) AS last_updated
FROM public.assignments a
LEFT JOIN public.sr_billing_items sbi ON sbi.assignment_id = a.id
GROUP BY a.id, a.sr_id, a.organization_id;

GRANT SELECT ON public.sr_billing_totals TO authenticated;

-- =========================================
-- 4. Extra fields on constructions for auto-calculator
-- =========================================
ALTER TABLE public.constructions
  ADD COLUMN IF NOT EXISTS distribution_type text
    CHECK (distribution_type IN ('bcp_public', 'bcp_private', 'eskalit', 'new_pipe', 'direct', 'none')),
  ADD COLUMN IF NOT EXISTS distribution_surface text
    CHECK (distribution_surface IN ('formed', 'unformed')),
  ADD COLUMN IF NOT EXISTS distribution_meters numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fb_same_level_as_bep boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cab_to_bep_damaged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_aerial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aerial_ftth_meters numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horizontal_ftth_meters numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_commercial_center boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fb_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_damage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_type text
    CHECK (damage_type IS NULL OR damage_type IN ('bep_bcp', 'polypipe', 'bcp_splice')),
  ADD COLUMN IF NOT EXISTS damage_fiber_count integer,
  ADD COLUMN IF NOT EXISTS height_work_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS height_work_type text
    CHECK (height_work_type IS NULL OR height_work_type IN ('1973.1', '1973.2', '1973.3'));