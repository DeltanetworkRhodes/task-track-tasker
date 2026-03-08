
-- Buildings registry table for ΧΕΜΔ address lookup
CREATE TABLE public.buildings_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  street text,
  number text,
  city text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  building_id text,
  nearby_bcp text,
  branch text,
  cabinet text,
  area text,
  notes text,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast address search
CREATE INDEX idx_buildings_registry_address ON public.buildings_registry USING gin (to_tsvector('simple', address));
CREATE INDEX idx_buildings_registry_building_id ON public.buildings_registry (building_id);
CREATE INDEX idx_buildings_registry_org ON public.buildings_registry (organization_id);

-- Enable RLS
ALTER TABLE public.buildings_registry ENABLE ROW LEVEL SECURITY;

-- Admins can manage buildings registry
CREATE POLICY "Admins can manage buildings_registry"
ON public.buildings_registry
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  (has_role(auth.uid(), 'admin'::app_role) AND
   (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
)
WITH CHECK (
  is_super_admin(auth.uid()) OR
  (has_role(auth.uid(), 'admin'::app_role) AND
   (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
);

-- Technicians can read buildings registry
CREATE POLICY "Technicians can view buildings_registry"
ON public.buildings_registry
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'technician'::app_role) AND
  (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid()))
);

-- Full-text search function for address autocomplete
CREATE OR REPLACE FUNCTION public.search_buildings(search_term text, org_id uuid DEFAULT NULL)
RETURNS SETOF public.buildings_registry
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.buildings_registry
  WHERE
    (org_id IS NULL OR organization_id = org_id)
    AND (
      address ILIKE '%' || search_term || '%'
      OR building_id ILIKE '%' || search_term || '%'
      OR street ILIKE '%' || search_term || '%'
    )
  ORDER BY address
  LIMIT 10;
$$;
