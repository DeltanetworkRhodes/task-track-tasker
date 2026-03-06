
-- Stock history log table
CREATE TABLE public.material_stock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id),
  old_stock numeric NOT NULL DEFAULT 0,
  new_stock numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_material_stock_history_material ON public.material_stock_history(material_id);
CREATE INDEX idx_material_stock_history_created ON public.material_stock_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.material_stock_history ENABLE ROW LEVEL SECURITY;

-- Admins can view history for their org
CREATE POLICY "Admins can view stock history"
  ON public.material_stock_history FOR SELECT
  USING (
    is_super_admin(auth.uid()) OR 
    (has_role(auth.uid(), 'admin'::app_role) AND 
     (organization_id IS NULL OR organization_id = get_user_org_id(auth.uid())))
  );

-- Admins can insert (for manual adjustments)
CREATE POLICY "Admins can insert stock history"
  ON public.material_stock_history FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid()) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger function to auto-log stock changes
CREATE OR REPLACE FUNCTION public.log_material_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.stock IS DISTINCT FROM NEW.stock THEN
    INSERT INTO public.material_stock_history (
      material_id, organization_id, old_stock, new_stock, change_amount, changed_by
    ) VALUES (
      NEW.id, NEW.organization_id, OLD.stock, NEW.stock, NEW.stock - OLD.stock, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_material_stock_change_trigger
  AFTER UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.log_material_stock_change();
