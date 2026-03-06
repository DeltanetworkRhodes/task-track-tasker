
-- Update has_role to also return true for super_admin when checking admin
-- (super_admin inherits admin privileges)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (role = _role OR role = 'super_admin')
  )
$$;

-- Drop and recreate key policies to add org filtering
-- ASSIGNMENTS: update SELECT policy
DROP POLICY IF EXISTS "Users can view relevant assignments" ON public.assignments;
CREATE POLICY "Users can view relevant assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      (auth.uid() = technician_id OR has_role(auth.uid(), 'admin'))
      AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admins can insert assignments" ON public.assignments;
CREATE POLICY "Admins can insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update assignments" ON public.assignments;
CREATE POLICY "Admins can update assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete assignments" ON public.assignments;
CREATE POLICY "Admins can delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- MATERIALS: update policies
DROP POLICY IF EXISTS "Admins can view materials" ON public.materials;
CREATE POLICY "Admins can view materials"
  ON public.materials FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Technicians can view materials" ON public.materials;
CREATE POLICY "Technicians can view materials"
  ON public.materials FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'technician') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can insert materials" ON public.materials;
CREATE POLICY "Admins can insert materials"
  ON public.materials FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update materials" ON public.materials;
CREATE POLICY "Admins can update materials"
  ON public.materials FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete materials" ON public.materials;
CREATE POLICY "Admins can delete materials"
  ON public.materials FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- CONSTRUCTIONS
DROP POLICY IF EXISTS "Admins can view constructions" ON public.constructions;
CREATE POLICY "Admins can view constructions"
  ON public.constructions FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can insert constructions" ON public.constructions;
CREATE POLICY "Admins can insert constructions"
  ON public.constructions FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update constructions" ON public.constructions;
CREATE POLICY "Admins can update constructions"
  ON public.constructions FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete constructions" ON public.constructions;
CREATE POLICY "Admins can delete constructions"
  ON public.constructions FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- SURVEYS
DROP POLICY IF EXISTS "Users can view surveys" ON public.surveys;
CREATE POLICY "Users can view surveys"
  ON public.surveys FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      (auth.uid() = technician_id OR has_role(auth.uid(), 'admin'))
      AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admins can update all surveys" ON public.surveys;
CREATE POLICY "Admins can update all surveys"
  ON public.surveys FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete surveys" ON public.surveys;
CREATE POLICY "Admins can delete surveys"
  ON public.surveys FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- PROFILES: update view policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin')
    OR is_super_admin(auth.uid())
  );

-- USER_ROLES: add super_admin policy
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

-- WORK_PRICING
DROP POLICY IF EXISTS "Admins can view work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can view work_pricing"
  ON public.work_pricing FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Technicians can view work_pricing" ON public.work_pricing;
CREATE POLICY "Technicians can view work_pricing"
  ON public.work_pricing FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'technician') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can insert work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can insert work_pricing"
  ON public.work_pricing FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can update work_pricing"
  ON public.work_pricing FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can delete work_pricing"
  ON public.work_pricing FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_super_admin(auth.uid()));

-- PROFIT_PER_SR
DROP POLICY IF EXISTS "Admins can view profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can view profit_per_sr"
  ON public.profit_per_sr FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can insert profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can insert profit_per_sr"
  ON public.profit_per_sr FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can update profit_per_sr"
  ON public.profit_per_sr FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can delete profit_per_sr"
  ON public.profit_per_sr FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );
