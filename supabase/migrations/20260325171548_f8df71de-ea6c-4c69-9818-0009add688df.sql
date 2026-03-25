
-- =====================================================
-- STRICT MULTI-TENANCY: Fix admin RLS policies missing org scope
-- =====================================================

-- 1. gis_data: Admin policy lacks org scoping
DROP POLICY IF EXISTS "Admins can manage gis_data" ON public.gis_data;
CREATE POLICY "Admins can manage gis_data" ON public.gis_data
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- Also scope technician GIS insert
DROP POLICY IF EXISTS "Technicians can insert gis_data" ON public.gis_data;
CREATE POLICY "Technicians can insert gis_data" ON public.gis_data
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = gis_data.assignment_id AND a.technician_id = auth.uid()
    )
  );

-- Also scope technician GIS select
DROP POLICY IF EXISTS "Technicians can view own gis_data" ON public.gis_data;
CREATE POLICY "Technicians can view own gis_data" ON public.gis_data
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = gis_data.assignment_id AND a.technician_id = auth.uid()
    )
  );

-- 2. assignment_history: Admin policy lacks org scoping
DROP POLICY IF EXISTS "Admins can manage assignment_history" ON public.assignment_history;
CREATE POLICY "Admins can manage assignment_history" ON public.assignment_history
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- 3. sr_comments: Admin policy lacks org scoping
DROP POLICY IF EXISTS "Admins can manage sr_comments" ON public.sr_comments;
CREATE POLICY "Admins can manage sr_comments" ON public.sr_comments
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- 4. pre_work_checklists: Admin policy lacks org scoping
DROP POLICY IF EXISTS "Admins can manage pre_work_checklists" ON public.pre_work_checklists;
CREATE POLICY "Admins can manage pre_work_checklists" ON public.pre_work_checklists
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- Fix technician policies on pre_work_checklists to also check org
DROP POLICY IF EXISTS "Technicians can insert own pre_work_checklists" ON public.pre_work_checklists;
CREATE POLICY "Technicians can insert own pre_work_checklists" ON public.pre_work_checklists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Technicians can update own pre_work_checklists" ON public.pre_work_checklists;
CREATE POLICY "Technicians can update own pre_work_checklists" ON public.pre_work_checklists
  FOR UPDATE TO authenticated
  USING (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Technicians can view own pre_work_checklists" ON public.pre_work_checklists;
CREATE POLICY "Technicians can view own pre_work_checklists" ON public.pre_work_checklists
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()))
    OR is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- 5. profiles: Admin UPDATE policy lacks org scoping (cross-org admin could edit other org's profiles)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update org profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- 6. profiles SELECT: scope admin view to own org
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- 7. material_stock_history: INSERT policy too broad (public role, no org check)
DROP POLICY IF EXISTS "Admins can insert stock history" ON public.material_stock_history;
CREATE POLICY "Admins can insert stock history" ON public.material_stock_history
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );

-- Fix SELECT too
DROP POLICY IF EXISTS "Admins can view stock history" ON public.material_stock_history;
CREATE POLICY "Admins can view stock history" ON public.material_stock_history
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND organization_id = get_user_org_id(auth.uid())
    )
  );
