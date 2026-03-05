
-- Table for construction work items
CREATE TABLE public.construction_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  construction_id uuid NOT NULL REFERENCES public.constructions(id) ON DELETE CASCADE,
  work_pricing_id uuid NOT NULL REFERENCES public.work_pricing(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table for construction materials used
CREATE TABLE public.construction_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  construction_id uuid NOT NULL REFERENCES public.constructions(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id),
  quantity numeric NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'DELTANETWORK',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.construction_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_materials ENABLE ROW LEVEL SECURITY;

-- RLS: Admins full access
CREATE POLICY "Admins can manage construction_works" ON public.construction_works FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage construction_materials" ON public.construction_materials FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Technicians can insert (via their own constructions)
CREATE POLICY "Technicians can insert construction_works" ON public.construction_works FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_works.construction_id AND a.technician_id = auth.uid()
  ));

CREATE POLICY "Technicians can insert construction_materials" ON public.construction_materials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_materials.construction_id AND a.technician_id = auth.uid()
  ));

-- RLS: Technicians can view own construction items
CREATE POLICY "Technicians can view own construction_works" ON public.construction_works FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_works.construction_id AND a.technician_id = auth.uid()
  ));

CREATE POLICY "Technicians can view own construction_materials" ON public.construction_materials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM constructions c
    JOIN assignments a ON a.id = c.assignment_id
    WHERE c.id = construction_materials.construction_id AND a.technician_id = auth.uid()
  ));

-- Allow technicians to INSERT constructions (currently only admins can)
CREATE POLICY "Technicians can insert own constructions" ON public.constructions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM assignments a WHERE a.id = constructions.assignment_id AND a.technician_id = auth.uid()
  ));

-- Allow technicians to view own constructions
CREATE POLICY "Technicians can view own constructions" ON public.constructions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignments a WHERE a.id = constructions.assignment_id AND a.technician_id = auth.uid()
  ));

-- Allow technicians to view work_pricing (needed for the form)
CREATE POLICY "Technicians can view work_pricing" ON public.work_pricing FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));

-- Allow technicians to view materials (needed for the form)  
CREATE POLICY "Technicians can view materials" ON public.materials FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
