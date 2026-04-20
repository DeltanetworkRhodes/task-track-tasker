-- Enums
CREATE TYPE label_type_enum AS ENUM ('flag', 'flat');

CREATE TYPE label_location_enum AS ENUM (
  'kampina',
  'bep',
  'bmo',
  'fb'
);

-- Print jobs table
CREATE TABLE IF NOT EXISTS public.label_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sr_id TEXT NOT NULL,
  construction_id UUID REFERENCES public.constructions(id) ON DELETE SET NULL,
  technician_id UUID,

  location label_location_enum NOT NULL,
  label_type label_type_enum NOT NULL,
  section_code TEXT NOT NULL,
  section_title TEXT NOT NULL,

  content TEXT NOT NULL,
  content_lines JSONB,

  tape_width_mm INT NOT NULL DEFAULT 12,
  quantity INT NOT NULL DEFAULT 1,
  print_order INT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','printed','failed','verified')),
  printed_at TIMESTAMPTZ,
  reprint_count INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_jobs_sr ON public.label_print_jobs(sr_id, print_order);
CREATE INDEX idx_print_jobs_org ON public.label_print_jobs(organization_id, created_at DESC);

-- RLS
ALTER TABLE public.label_print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view print jobs"
  ON public.label_print_jobs FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR organization_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Techs create print jobs"
  ON public.label_print_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id(auth.uid())
    AND (technician_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Techs update own print jobs"
  ON public.label_print_jobs FOR UPDATE
  TO authenticated
  USING (
    technician_id = auth.uid()
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Admins delete print jobs"
  ON public.label_print_jobs FOR DELETE
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- Helper for ordering
CREATE OR REPLACE FUNCTION public.location_print_order(loc label_location_enum)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE loc
    WHEN 'kampina' THEN 1
    WHEN 'bep' THEN 2
    WHEN 'bmo' THEN 3
    WHEN 'fb' THEN 4
  END;
END;
$$;