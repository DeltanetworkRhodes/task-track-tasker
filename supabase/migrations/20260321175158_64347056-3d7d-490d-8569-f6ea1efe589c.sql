
-- Add unique constraint on (code, organization_id) for materials
-- First drop existing unique constraint on code alone if it exists
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS materials_code_org_unique ON public.materials (code, organization_id);

-- Add unique constraint on (code, organization_id) for work_pricing  
ALTER TABLE public.work_pricing DROP CONSTRAINT IF EXISTS work_pricing_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS work_pricing_code_org_unique ON public.work_pricing (code, organization_id);
