
-- Prevent anyone from inserting super_admin role via RLS
-- Drop existing insert policy and recreate with restriction
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    AND role != 'super_admin'
  );

-- Prevent updating any role TO super_admin
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (role != 'super_admin');

-- Prevent deleting the super_admin role
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    AND role != 'super_admin'
  );

-- Add a trigger to block super_admin creation/modification at DB level too
CREATE OR REPLACE FUNCTION public.prevent_super_admin_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'super_admin' THEN
    -- Only allow if this is the existing super admin row being kept as-is
    IF TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND OLD.user_id = NEW.user_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot assign super_admin role';
  END IF;
  -- Prevent changing an existing super_admin to something else
  IF TG_OP = 'UPDATE' AND OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot modify super_admin role';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot delete super_admin role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_super_admin_trigger ON public.user_roles;
CREATE TRIGGER prevent_super_admin_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_super_admin_role_change();
