
-- Technician inventory: tracks current stock per technician per material
CREATE TABLE public.technician_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(technician_id, material_id)
);

ALTER TABLE public.technician_inventory ENABLE ROW LEVEL SECURITY;

-- Admins can manage all inventory in their org
CREATE POLICY "Admins manage technician_inventory"
  ON public.technician_inventory FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())))
  WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())));

-- Technicians can view their own inventory
CREATE POLICY "Technicians view own inventory"
  ON public.technician_inventory FOR SELECT TO authenticated
  USING (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

-- History of all transfers (charge/deduct)
CREATE TABLE public.technician_inventory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  change_amount numeric NOT NULL,
  reason text NOT NULL DEFAULT 'transfer',
  construction_sr_id text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.technician_inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory_history"
  ON public.technician_inventory_history FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())))
  WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid())));

CREATE POLICY "Technicians view own history"
  ON public.technician_inventory_history FOR SELECT TO authenticated
  USING (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

-- Service role for edge functions
CREATE POLICY "Service role manage inventory"
  ON public.technician_inventory FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manage inventory_history"
  ON public.technician_inventory_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);
