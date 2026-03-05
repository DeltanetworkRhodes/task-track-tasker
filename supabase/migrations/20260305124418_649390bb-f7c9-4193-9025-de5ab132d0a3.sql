
-- Add missing DELETE policies for admin management

-- materials: admin delete
CREATE POLICY "Admins can delete materials" ON public.materials
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- constructions: admin delete
CREATE POLICY "Admins can delete constructions" ON public.constructions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- assignments: admin delete
CREATE POLICY "Admins can delete assignments" ON public.assignments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- work_pricing: admin delete
CREATE POLICY "Admins can delete work_pricing" ON public.work_pricing
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- notifications: users delete own
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- survey_files: technicians manage own, admins manage all
CREATE POLICY "Technicians can delete own survey files" ON public.survey_files
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM surveys WHERE surveys.id = survey_files.survey_id AND surveys.technician_id = auth.uid()));

CREATE POLICY "Admins can delete survey files" ON public.survey_files
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- surveys: admin delete
CREATE POLICY "Admins can delete surveys" ON public.surveys
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- profit_per_sr: admin delete
CREATE POLICY "Admins can delete profit_per_sr" ON public.profit_per_sr
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
