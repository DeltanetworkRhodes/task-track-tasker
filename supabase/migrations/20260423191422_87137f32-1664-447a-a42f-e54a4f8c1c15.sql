-- Create enum for OTDR measurement point types
DO $$ BEGIN
  CREATE TYPE otdr_point_type AS ENUM (
    'CABIN',
    'LIVE',
    'BEP',
    'BCP',
    'BMO',
    'FLOOR_BOX'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create otdr_measurements table
CREATE TABLE IF NOT EXISTS public.otdr_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  construction_id uuid REFERENCES public.constructions(id) ON DELETE CASCADE,
  
  point_type otdr_point_type NOT NULL,
  
  floor_number int,
  fb_index int,
  
  label text NOT NULL,
  
  sor_file_url text NOT NULL,
  sor_file_name text NOT NULL,
  sor_file_size_bytes bigint,
  
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  
  CONSTRAINT unique_measurement_point 
    UNIQUE (assignment_id, point_type, floor_number, fb_index)
);

CREATE INDEX IF NOT EXISTS idx_otdr_assignment ON public.otdr_measurements(assignment_id);
CREATE INDEX IF NOT EXISTS idx_otdr_type ON public.otdr_measurements(assignment_id, point_type);
CREATE INDEX IF NOT EXISTS idx_otdr_org ON public.otdr_measurements(organization_id);

ALTER TABLE public.otdr_measurements ENABLE ROW LEVEL SECURITY;

-- SELECT: super admin or same org members
CREATE POLICY "otdr_select" ON public.otdr_measurements 
  FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_org_id(auth.uid())
  );

-- INSERT: assigned technician, crew member, or admin in same org
CREATE POLICY "otdr_insert" ON public.otdr_measurements 
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND (
          a.technician_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.sr_crew_assignments sca
            WHERE sca.assignment_id = a.id AND sca.technician_id = auth.uid()
          )
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- UPDATE: own uploads or admin
CREATE POLICY "otdr_update_own" ON public.otdr_measurements 
  FOR UPDATE
  USING (
    uploaded_by = auth.uid() 
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND organization_id = public.get_user_org_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- DELETE: own uploads or admin
CREATE POLICY "otdr_delete" ON public.otdr_measurements 
  FOR DELETE
  USING (
    uploaded_by = auth.uid() 
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND organization_id = public.get_user_org_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('otdr-sor-files', 'otdr-sor-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "otdr_storage_select" ON storage.objects;
CREATE POLICY "otdr_storage_select" ON storage.objects 
  FOR SELECT
  USING (bucket_id = 'otdr-sor-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "otdr_storage_insert" ON storage.objects;
CREATE POLICY "otdr_storage_insert" ON storage.objects 
  FOR INSERT
  WITH CHECK (bucket_id = 'otdr-sor-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "otdr_storage_update" ON storage.objects;
CREATE POLICY "otdr_storage_update" ON storage.objects 
  FOR UPDATE
  USING (bucket_id = 'otdr-sor-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "otdr_storage_delete" ON storage.objects;
CREATE POLICY "otdr_storage_delete" ON storage.objects 
  FOR DELETE
  USING (bucket_id = 'otdr-sor-files' AND auth.role() = 'authenticated');