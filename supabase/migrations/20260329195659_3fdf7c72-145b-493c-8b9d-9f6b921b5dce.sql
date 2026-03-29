
-- Auto-sync material_cost from constructions to profit_per_sr expenses
CREATE OR REPLACE FUNCTION public.sync_construction_cost_to_profit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR 
     (OLD.material_cost IS DISTINCT FROM NEW.material_cost) OR 
     (OLD.revenue IS DISTINCT FROM NEW.revenue) THEN
    
    INSERT INTO public.profit_per_sr (sr_id, organization_id, revenue, expenses, profit)
    VALUES (
      NEW.sr_id,
      NEW.organization_id,
      NEW.revenue,
      NEW.material_cost,
      NEW.revenue - NEW.material_cost
    )
    ON CONFLICT (sr_id, organization_id) 
    DO UPDATE SET
      revenue = EXCLUDED.revenue,
      expenses = EXCLUDED.expenses,
      profit = EXCLUDED.revenue - EXCLUDED.expenses,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profit_per_sr_sr_id_organization_id_key'
  ) THEN
    ALTER TABLE public.profit_per_sr 
    ADD CONSTRAINT profit_per_sr_sr_id_organization_id_key 
    UNIQUE (sr_id, organization_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cost_to_profit ON public.constructions;
CREATE TRIGGER trg_sync_cost_to_profit
  AFTER INSERT OR UPDATE OF material_cost, revenue
  ON public.constructions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_construction_cost_to_profit();
