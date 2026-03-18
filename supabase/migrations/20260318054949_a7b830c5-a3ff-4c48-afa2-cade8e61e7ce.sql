-- Allow technicians to update their own construction records (same assignment ownership rule as other construction tables)
CREATE POLICY "Technicians can update own constructions"
ON public.constructions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = constructions.assignment_id
      AND a.technician_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = constructions.assignment_id
      AND a.technician_id = auth.uid()
  )
);