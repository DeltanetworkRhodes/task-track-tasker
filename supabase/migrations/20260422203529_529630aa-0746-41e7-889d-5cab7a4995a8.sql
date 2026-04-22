-- Επιτρέπουμε στους τεχνικούς να κάνουν insert/update στο work_pricing του οργανισμού τους
-- ώστε να μπορεί να γίνει auto-sync των OTE articles σε work_pricing κατά το save κατασκευής

CREATE POLICY "Technicians can insert org work_pricing"
ON public.work_pricing
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'technician'::app_role)
  AND organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Technicians can update org work_pricing"
ON public.work_pricing
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND organization_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'technician'::app_role)
  AND organization_id = get_user_org_id(auth.uid())
);