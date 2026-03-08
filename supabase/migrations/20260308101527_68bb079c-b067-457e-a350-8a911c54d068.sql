-- Drop existing INSERT and UPDATE policies on user_roles
DROP POLICY "Admins can insert roles" ON public.user_roles;
DROP POLICY "Admins can update roles" ON public.user_roles;

-- Recreate INSERT policy: admins can only assign roles to users in their own org
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    AND role <> 'super_admin'::app_role
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles AS admin_p
        JOIN public.profiles AS target_p ON target_p.user_id = user_roles.user_id
        WHERE admin_p.user_id = auth.uid()
          AND admin_p.organization_id IS NOT NULL
          AND admin_p.organization_id = target_p.organization_id
      )
    )
  );

-- Recreate UPDATE policy: admins can only update roles of users in their own org
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles AS admin_p
        JOIN public.profiles AS target_p ON target_p.user_id = user_roles.user_id
        WHERE admin_p.user_id = auth.uid()
          AND admin_p.organization_id IS NOT NULL
          AND admin_p.organization_id = target_p.organization_id
      )
    )
  )
  WITH CHECK (role <> 'super_admin'::app_role);