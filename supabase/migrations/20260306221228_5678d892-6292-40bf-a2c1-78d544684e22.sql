
CREATE OR REPLACE FUNCTION public.protect_material_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.source IS DISTINCT FROM NEW.source THEN
    RAISE EXCEPTION 'Cannot change material source from % to %', OLD.source, NEW.source;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_material_source_trigger
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_material_source();
