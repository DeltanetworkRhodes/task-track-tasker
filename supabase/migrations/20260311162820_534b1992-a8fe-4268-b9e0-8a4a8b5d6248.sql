-- Multi-tenant isolation hardening
-- 1) Make uniqueness organization-scoped to avoid cross-tenant collisions
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_google_sheet_row_id_key;
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_sr_id_unique;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_org_google_sheet_row_unique UNIQUE (organization_id, google_sheet_row_id);
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_org_sr_unique UNIQUE (organization_id, sr_id);

ALTER TABLE public.constructions DROP CONSTRAINT IF EXISTS constructions_google_sheet_row_id_key;
ALTER TABLE public.constructions
  ADD CONSTRAINT constructions_org_google_sheet_row_unique UNIQUE (organization_id, google_sheet_row_id);

ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_code_key;
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_code_unique;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_org_code_unique UNIQUE (organization_id, code);

ALTER TABLE public.work_pricing DROP CONSTRAINT IF EXISTS work_pricing_code_key;
ALTER TABLE public.work_pricing
  ADD CONSTRAINT work_pricing_org_code_unique UNIQUE (organization_id, code);

-- 2) Tighten RLS to require same organization (no NULL-org bypass)
ALTER POLICY "Admins can delete assignments" ON public.assignments
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can insert assignments" ON public.assignments
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update assignments" ON public.assignments
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Technicians can update own assignments" ON public.assignments
USING (
  auth.uid() = technician_id
  AND organization_id = get_user_org_id(auth.uid())
);

ALTER POLICY "Users can view relevant assignments" ON public.assignments
USING (
  is_super_admin(auth.uid())
  OR (
    ((auth.uid() = technician_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can delete constructions" ON public.constructions
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can insert constructions" ON public.constructions
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update constructions" ON public.constructions
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can view constructions" ON public.constructions
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can delete materials" ON public.materials
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can insert materials" ON public.materials
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update materials" ON public.materials
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can view materials" ON public.materials
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Technicians can view materials" ON public.materials
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND organization_id = get_user_org_id(auth.uid())
);

ALTER POLICY "Admins can delete profit_per_sr" ON public.profit_per_sr
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can insert profit_per_sr" ON public.profit_per_sr
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update profit_per_sr" ON public.profit_per_sr
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can view profit_per_sr" ON public.profit_per_sr
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can delete surveys" ON public.surveys
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update all surveys" ON public.surveys
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Users can view surveys" ON public.surveys
USING (
  is_super_admin(auth.uid())
  OR (
    ((auth.uid() = technician_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can delete work_pricing" ON public.work_pricing
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can insert work_pricing" ON public.work_pricing
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can update work_pricing" ON public.work_pricing
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);

ALTER POLICY "Admins can view work_pricing" ON public.work_pricing
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND organization_id = get_user_org_id(auth.uid())
  )
);