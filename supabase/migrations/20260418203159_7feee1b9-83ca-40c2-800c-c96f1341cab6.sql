-- Drop old narrow policies
DROP POLICY IF EXISTS "Technicians can insert own constructions" ON public.constructions;
DROP POLICY IF EXISTS "Technicians can update own constructions" ON public.constructions;
DROP POLICY IF EXISTS "Technicians can view own constructions" ON public.constructions;

-- Recreate with crew member support
CREATE POLICY "Technicians can view own constructions"
ON public.constructions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = constructions.assignment_id
    AND a.technician_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    WHERE sca.assignment_id = constructions.assignment_id
    AND sca.technician_id = auth.uid()
  )
);

CREATE POLICY "Technicians can insert own constructions"
ON public.constructions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = constructions.assignment_id
    AND a.technician_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    WHERE sca.assignment_id = constructions.assignment_id
    AND sca.technician_id = auth.uid()
  )
);

CREATE POLICY "Technicians can update own constructions"
ON public.constructions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = constructions.assignment_id
    AND a.technician_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    WHERE sca.assignment_id = constructions.assignment_id
    AND sca.technician_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = constructions.assignment_id
    AND a.technician_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sr_crew_assignments sca
    WHERE sca.assignment_id = constructions.assignment_id
    AND sca.technician_id = auth.uid()
  )
);