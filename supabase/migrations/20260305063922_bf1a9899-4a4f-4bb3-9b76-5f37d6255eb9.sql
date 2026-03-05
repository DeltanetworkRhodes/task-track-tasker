
-- Restrict materials INSERT to admins only
DROP POLICY "Authenticated users can manage materials" ON public.materials;
CREATE POLICY "Admins can insert materials" ON public.materials
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Restrict materials UPDATE to admins only
DROP POLICY "Authenticated users can update materials" ON public.materials;
CREATE POLICY "Admins can update materials" ON public.materials
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
