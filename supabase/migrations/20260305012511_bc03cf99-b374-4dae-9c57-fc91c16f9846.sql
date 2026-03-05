
-- Allow admins to update any survey status
CREATE POLICY "Admins can update all surveys"
ON public.surveys FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
