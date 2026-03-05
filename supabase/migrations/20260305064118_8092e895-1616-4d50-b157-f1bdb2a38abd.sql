
-- assignments: restrict INSERT/UPDATE to admins
DROP POLICY "Authenticated users can insert assignments" ON public.assignments;
CREATE POLICY "Admins can insert assignments" ON public.assignments
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Authenticated users can update assignments" ON public.assignments;
CREATE POLICY "Admins can update assignments" ON public.assignments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- constructions: restrict INSERT/UPDATE to admins
DROP POLICY "Authenticated users can insert constructions" ON public.constructions;
CREATE POLICY "Admins can insert constructions" ON public.constructions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Authenticated users can update constructions" ON public.constructions;
CREATE POLICY "Admins can update constructions" ON public.constructions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- work_pricing: restrict INSERT/UPDATE to admins
DROP POLICY "Authenticated users can insert work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can insert work_pricing" ON public.work_pricing
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Authenticated users can update work_pricing" ON public.work_pricing;
CREATE POLICY "Admins can update work_pricing" ON public.work_pricing
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- profit_per_sr: restrict INSERT/UPDATE to admins
DROP POLICY "Authenticated users can insert profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can insert profit_per_sr" ON public.profit_per_sr
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Authenticated users can update profit_per_sr" ON public.profit_per_sr;
CREATE POLICY "Admins can update profit_per_sr" ON public.profit_per_sr
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
