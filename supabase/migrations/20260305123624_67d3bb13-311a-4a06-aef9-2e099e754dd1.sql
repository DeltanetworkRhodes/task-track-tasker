
-- 1. PROFILES: restrict SELECT to own profile + admins
DROP POLICY "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. ASSIGNMENTS: technicians see only their own, admins see all
DROP POLICY "Authenticated users can view assignments" ON public.assignments;
CREATE POLICY "Users can view relevant assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = technician_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. APPOINTMENTS: admin only
DROP POLICY "Authenticated users can view appointments" ON public.appointments;
CREATE POLICY "Admins can view appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. CONSTRUCTIONS: admin only
DROP POLICY "Authenticated users can view constructions" ON public.constructions;
CREATE POLICY "Admins can view constructions" ON public.constructions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. PROFIT_PER_SR: admin only
DROP POLICY "Authenticated users can view profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can view profit_per_sr" ON public.profit_per_sr
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. MATERIALS: admin only (technicians don't need direct access)
DROP POLICY "Authenticated users can view materials" ON public.materials;
CREATE POLICY "Admins can view materials" ON public.materials
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. WORK_PRICING: admin only
DROP POLICY "Authenticated users can view work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can view work_pricing" ON public.work_pricing
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 8. EMAIL_SETTINGS: explicit SELECT for admins only
CREATE POLICY "Admins can view email_settings" ON public.email_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
