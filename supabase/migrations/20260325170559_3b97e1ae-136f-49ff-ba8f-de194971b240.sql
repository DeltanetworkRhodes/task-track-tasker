-- ============================================================
-- STRICT MULTI-TENANCY MIGRATION
-- Fixes permissive RLS policies that allow cross-org data leakage
-- ============================================================

-- 1. Drop permissive admin policies that lack org isolation
DROP POLICY IF EXISTS "Admins can manage construction_materials" ON public.construction_materials;
DROP POLICY IF EXISTS "Admins can manage construction_works" ON public.construction_works;
DROP POLICY IF EXISTS "Admins can manage email settings" ON public.email_settings;
DROP POLICY IF EXISTS "Admins can view email_settings" ON public.email_settings;
DROP POLICY IF EXISTS "Admins can manage inspection_reports" ON public.inspection_reports;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can delete appointments" ON public.appointments;
DROP POLICY IF EXISTS "Technicians can view own inspection_reports" ON public.inspection_reports;
DROP POLICY IF EXISTS "Technicians can update own inspection_reports" ON public.inspection_reports;
DROP POLICY IF EXISTS "Technicians can insert own inspection_reports" ON public.inspection_reports;

-- 2. Create strict org-scoped admin policies

CREATE POLICY "Admins manage own org construction_materials"
  ON public.construction_materials FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Admins manage own org construction_works"
  ON public.construction_works FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Admins manage own org email_settings"
  ON public.email_settings FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Admins manage own org inspection_reports"
  ON public.inspection_reports FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Admins view same org roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
        AND p.organization_id = get_user_org_id(auth.uid())
      )
    )
  );

CREATE POLICY "Org scoped view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Org scoped insert appointments"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Org scoped update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Org scoped delete appointments"
  ON public.appointments FOR DELETE
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

CREATE POLICY "Technicians view own org inspection_reports"
  ON public.inspection_reports FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Technicians update own org inspection_reports"
  ON public.inspection_reports FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "Technicians insert own org inspection_reports"
  ON public.inspection_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid())
  );