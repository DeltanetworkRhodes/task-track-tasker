CREATE POLICY "Crew-assigned technicians can view gis_data"
ON public.gis_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    WHERE sca.assignment_id = gis_data.assignment_id
    AND sca.technician_id = auth.uid()
  )
);