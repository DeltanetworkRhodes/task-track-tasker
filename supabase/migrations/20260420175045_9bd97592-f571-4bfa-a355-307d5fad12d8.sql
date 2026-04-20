-- 1. Enum για τους τύπους κτιρίων
DO $$ BEGIN
  CREATE TYPE building_type_enum AS ENUM (
    'poly',
    'mono',
    'mez',
    'complex',
    'biz'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Νέες στήλες
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS building_type building_type_enum;

ALTER TABLE public.constructions
  ADD COLUMN IF NOT EXISTS building_type building_type_enum;

-- Phase column στο sr_crew_assignments (1, 2, ή 3)
ALTER TABLE public.sr_crew_assignments
  ADD COLUMN IF NOT EXISTS phase INT CHECK (phase IN (1, 2, 3));

CREATE INDEX IF NOT EXISTS idx_sr_crew_assignments_phase
  ON public.sr_crew_assignments(assignment_id, phase);

-- 3. Πίνακας τιμοκαταλόγου
CREATE TABLE IF NOT EXISTS public.building_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  building_type building_type_enum NOT NULL,
  building_label TEXT NOT NULL,
  building_icon TEXT DEFAULT '🏢',
  phase2_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  phase3_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, building_type)
);

-- 4. Πίνακας κερδών τεχνικού
CREATE TABLE IF NOT EXISTS public.technician_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  construction_id UUID REFERENCES public.constructions(id) ON DELETE SET NULL,
  sr_id TEXT NOT NULL,
  building_type building_type_enum,
  building_label TEXT,
  phase INT NOT NULL CHECK (phase IN (2, 3)),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tech_earnings_tech
  ON public.technician_earnings(technician_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_earnings_org
  ON public.technician_earnings(organization_id, completed_at DESC);

-- 5. RLS
ALTER TABLE public.building_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_earnings ENABLE ROW LEVEL SECURITY;

-- building_pricing policies (using existing helpers)
DROP POLICY IF EXISTS "Org members can view pricing" ON public.building_pricing;
CREATE POLICY "Org members can view pricing"
  ON public.building_pricing FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR organization_id = get_user_org_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage pricing" ON public.building_pricing;
CREATE POLICY "Admins can manage pricing"
  ON public.building_pricing FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- technician_earnings policies
DROP POLICY IF EXISTS "Technicians view own earnings" ON public.technician_earnings;
CREATE POLICY "Technicians view own earnings"
  ON public.technician_earnings FOR SELECT
  TO authenticated
  USING (
    technician_id = auth.uid()
    OR is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins manage earnings" ON public.technician_earnings;
CREATE POLICY "Admins manage earnings"
  ON public.technician_earnings FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- updated_at trigger για building_pricing
DROP TRIGGER IF EXISTS trg_building_pricing_updated_at ON public.building_pricing;
CREATE TRIGGER trg_building_pricing_updated_at
  BEFORE UPDATE ON public.building_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed default pricing για κάθε οργανισμό
INSERT INTO public.building_pricing
  (organization_id, building_type, building_label, building_icon, phase2_price, phase3_price, sort_order)
SELECT
  o.id, bt.type::building_type_enum, bt.label, bt.icon, bt.p2, bt.p3, bt.sort
FROM public.organizations o
CROSS JOIN (VALUES
  ('poly', 'Πολυκατοικία', '🏢', 250, 380, 1),
  ('mono', 'Μονοκατοικία', '🏠', 180, 280, 2),
  ('mez', 'Μεζονέτα', '🏡', 210, 320, 3),
  ('complex', 'Συγκρότημα', '🏘️', 350, 480, 4),
  ('biz', 'Επαγγελματικό', '🏭', 220, 350, 5)
) AS bt(type, label, icon, p2, p3, sort)
ON CONFLICT (organization_id, building_type) DO NOTHING;

-- 7. Trigger για auto-charge όταν ολοκληρώνεται Φ2 ή Φ3
CREATE OR REPLACE FUNCTION public.charge_technician_on_phase_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech_id UUID;
  v_price NUMERIC;
  v_building_label TEXT;
BEGIN
  -- Phase 2 just completed
  IF NEW.phase2_status = 'completed' AND (OLD.phase2_status IS NULL OR OLD.phase2_status != 'completed') THEN
    -- Try crew assignment for phase 2
    SELECT technician_id INTO v_tech_id
    FROM public.sr_crew_assignments
    WHERE assignment_id = NEW.assignment_id AND phase = 2
    ORDER BY created_at DESC
    LIMIT 1;

    -- Fallback: responsible technician of the assignment
    IF v_tech_id IS NULL THEN
      SELECT technician_id INTO v_tech_id
      FROM public.assignments WHERE id = NEW.assignment_id;
    END IF;

    SELECT bp.phase2_price, bp.building_label INTO v_price, v_building_label
    FROM public.building_pricing bp
    WHERE bp.organization_id = NEW.organization_id
      AND bp.building_type = NEW.building_type;

    IF v_tech_id IS NOT NULL AND v_price IS NOT NULL AND v_price > 0 THEN
      INSERT INTO public.technician_earnings
        (organization_id, technician_id, construction_id, assignment_id, sr_id,
         building_type, building_label, phase, amount, completed_at)
      VALUES
        (NEW.organization_id, v_tech_id, NEW.id, NEW.assignment_id, NEW.sr_id,
         NEW.building_type, v_building_label, 2, v_price, COALESCE(NEW.phase2_completed_at, now()));
    END IF;
  END IF;

  -- Phase 3 just completed
  IF NEW.phase3_status = 'completed' AND (OLD.phase3_status IS NULL OR OLD.phase3_status != 'completed') THEN
    SELECT technician_id INTO v_tech_id
    FROM public.sr_crew_assignments
    WHERE assignment_id = NEW.assignment_id AND phase = 3
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tech_id IS NULL THEN
      SELECT technician_id INTO v_tech_id
      FROM public.assignments WHERE id = NEW.assignment_id;
    END IF;

    SELECT bp.phase3_price, bp.building_label INTO v_price, v_building_label
    FROM public.building_pricing bp
    WHERE bp.organization_id = NEW.organization_id
      AND bp.building_type = NEW.building_type;

    IF v_tech_id IS NOT NULL AND v_price IS NOT NULL AND v_price > 0 THEN
      INSERT INTO public.technician_earnings
        (organization_id, technician_id, construction_id, assignment_id, sr_id,
         building_type, building_label, phase, amount, completed_at)
      VALUES
        (NEW.organization_id, v_tech_id, NEW.id, NEW.assignment_id, NEW.sr_id,
         NEW.building_type, v_building_label, 3, v_price, COALESCE(NEW.phase3_completed_at, now()));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_on_phase_complete ON public.constructions;
CREATE TRIGGER trg_charge_on_phase_complete
  AFTER UPDATE ON public.constructions
  FOR EACH ROW
  EXECUTE FUNCTION public.charge_technician_on_phase_complete();