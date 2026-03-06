
-- RLS policies for organizations table
CREATE POLICY "Super admins can do everything on organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view own organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = get_user_org_id(auth.uid()));

-- RLS policies for org_settings table
CREATE POLICY "Super admins can manage all org_settings"
  ON public.org_settings FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can view own org settings"
  ON public.org_settings FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update own org settings"
  ON public.org_settings FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
