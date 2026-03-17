-- Allow technicians to delete their own construction_works
CREATE POLICY "Technicians can delete own construction_works"
ON public.construction_works
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_works.construction_id
    AND a.technician_id = auth.uid()
  )
);

-- Allow technicians to delete their own construction_materials
CREATE POLICY "Technicians can delete own construction_materials"
ON public.construction_materials
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_materials.construction_id
    AND a.technician_id = auth.uid()
  )
);

-- Allow technicians to update their own construction_works (for quantity changes)
CREATE POLICY "Technicians can update own construction_works"
ON public.construction_works
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_works.construction_id
    AND a.technician_id = auth.uid()
  )
);

-- Allow technicians to update their own construction_materials
CREATE POLICY "Technicians can update own construction_materials"
ON public.construction_materials
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_materials.construction_id
    AND a.technician_id = auth.uid()
  )
);