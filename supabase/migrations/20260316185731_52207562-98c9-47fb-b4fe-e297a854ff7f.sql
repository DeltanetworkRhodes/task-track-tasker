
-- Work categories table
CREATE TABLE IF NOT EXISTS sr_work_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  photo_categories text[] DEFAULT '{}',
  requires_works boolean DEFAULT false,
  requires_measurements boolean DEFAULT false,
  can_close_sr boolean DEFAULT false,
  active boolean DEFAULT true
);

-- Crew assignments per category per SR
CREATE TABLE IF NOT EXISTS sr_crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES sr_work_categories(id) ON DELETE CASCADE,
  technician_id uuid,
  status text DEFAULT 'pending',
  notes text,
  measurements jsonb,
  saved_at timestamptz,
  saved_by uuid,
  UNIQUE(assignment_id, category_id)
);

-- Validation trigger for crew assignment status
CREATE OR REPLACE FUNCTION public.validate_crew_assignment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('pending', 'in_progress', 'saved') THEN
    RAISE EXCEPTION 'Invalid crew assignment status: %. Must be pending, in_progress, or saved', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_crew_status
  BEFORE INSERT OR UPDATE ON sr_crew_assignments
  FOR EACH ROW EXECUTE FUNCTION validate_crew_assignment_status();

-- Photos per crew assignment
CREATE TABLE IF NOT EXISTS sr_crew_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_assignment_id uuid NOT NULL REFERENCES sr_crew_assignments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  photo_category text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE sr_work_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sr_crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sr_crew_photos ENABLE ROW LEVEL SECURITY;

-- Categories: org isolation
CREATE POLICY "org_iso_categories" ON sr_work_categories
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Crew assignments: org isolation + technicians can view/update own
CREATE POLICY "admin_manage_crew" ON sr_crew_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid())));

CREATE POLICY "tech_view_own_crew" ON sr_crew_assignments
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid() AND organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "tech_update_own_crew" ON sr_crew_assignments
  FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() AND organization_id = get_user_org_id(auth.uid()));

-- Crew photos: org isolation
CREATE POLICY "admin_manage_crew_photos" ON sr_crew_photos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = get_user_org_id(auth.uid()) OR is_super_admin(auth.uid())));

CREATE POLICY "tech_manage_own_crew_photos" ON sr_crew_photos
  FOR ALL TO authenticated
  USING (uploaded_by = auth.uid() AND organization_id = get_user_org_id(auth.uid()))
  WITH CHECK (uploaded_by = auth.uid() AND organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "tech_view_crew_photos" ON sr_crew_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sr_crew_assignments sca
    WHERE sca.id = sr_crew_photos.crew_assignment_id
    AND sca.technician_id = auth.uid()
  ));
