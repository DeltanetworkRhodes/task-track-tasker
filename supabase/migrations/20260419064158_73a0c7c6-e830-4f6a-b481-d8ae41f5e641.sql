CREATE POLICY "Technicians can view their own appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.sr_id = appointments.sr_id
      AND a.technician_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    JOIN public.assignments a ON a.id = sca.assignment_id
    WHERE a.sr_id = appointments.sr_id
      AND sca.technician_id = auth.uid()
  )
);