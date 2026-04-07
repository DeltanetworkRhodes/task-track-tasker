CREATE POLICY "Technicians can view crew-assigned assignments"
  ON public.assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sr_crew_assignments sca
      WHERE sca.assignment_id = assignments.id
      AND sca.technician_id = auth.uid()
    )
  );