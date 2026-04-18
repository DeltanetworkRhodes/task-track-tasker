-- Allow technicians to update their own inventory rows (consume materials on SR)
CREATE POLICY "Technicians update own inventory"
ON public.technician_inventory
FOR UPDATE
TO authenticated
USING (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()))
WITH CHECK (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

-- Allow technicians to insert their own history rows
CREATE POLICY "Technicians insert own history"
ON public.technician_inventory_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));