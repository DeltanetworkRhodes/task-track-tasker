-- 1. Fix notify_admins_on_cancellation to scope to same org
CREATE OR REPLACE FUNCTION public.notify_admins_on_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  tech_name text;
  assignment_org_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') AND NEW.technician_id IS NOT NULL THEN
    assignment_org_id := NEW.organization_id;
    SELECT full_name INTO tech_name FROM public.profiles WHERE user_id = NEW.technician_id LIMIT 1;

    FOR admin_record IN 
      SELECT ur.user_id FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.role = 'admin'
      AND (assignment_org_id IS NULL OR p.organization_id = assignment_org_id)
    LOOP
      INSERT INTO public.notifications (user_id, title, message, data, organization_id)
      VALUES (
        admin_record.user_id,
        'Ακύρωση Ανάθεσης',
        'Ο ' || COALESCE(tech_name, 'τεχνικός') || ' ακύρωσε το SR ' || NEW.sr_id || ' (' || NEW.area || ')',
        jsonb_build_object('assignment_id', NEW.id, 'sr_id', NEW.sr_id, 'area', NEW.area, 'technician_id', NEW.technician_id),
        assignment_org_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Fix notify_admins_on_survey to scope to same org
CREATE OR REPLACE FUNCTION public.notify_admins_on_survey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  tech_name text;
  survey_org_id uuid;
BEGIN
  survey_org_id := NEW.organization_id;
  SELECT full_name INTO tech_name FROM public.profiles WHERE user_id = NEW.technician_id LIMIT 1;

  FOR admin_record IN 
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin'
    AND (survey_org_id IS NULL OR p.organization_id = survey_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, data, organization_id)
    VALUES (
      admin_record.user_id,
      'Νέα Αυτοψία',
      'Ο ' || COALESCE(tech_name, 'τεχνικός') || ' υπέβαλε αυτοψία για SR ' || NEW.sr_id || ' (' || NEW.area || ')',
      jsonb_build_object('survey_id', NEW.id, 'sr_id', NEW.sr_id, 'area', NEW.area, 'technician_id', NEW.technician_id),
      survey_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- 3. Fix notify_technician_on_assignment to include org_id
CREATE OR REPLACE FUNCTION public.notify_technician_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.technician_id IS NOT NULL AND (OLD.technician_id IS NULL OR OLD.technician_id != NEW.technician_id)) THEN
    INSERT INTO public.notifications (user_id, title, message, data, organization_id)
    VALUES (
      NEW.technician_id,
      'Νέα Ανάθεση',
      'Σου ανατέθηκε το SR ' || NEW.sr_id || ' στην περιοχή ' || NEW.area,
      jsonb_build_object('assignment_id', NEW.id, 'sr_id', NEW.sr_id, 'area', NEW.area),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Fix log_assignment_status_change to include org_id
CREATE OR REPLACE FUNCTION public.log_assignment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.assignment_history (assignment_id, old_status, new_status, changed_by, organization_id)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Fix log_material_stock_change - already includes org_id, OK

-- 6. Add unique constraint to org_settings for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_settings_org_key_unique'
  ) THEN
    ALTER TABLE public.org_settings ADD CONSTRAINT org_settings_org_key_unique UNIQUE (organization_id, setting_key);
  END IF;
END $$;

-- 7. Add org_settings INSERT policy for admins (currently missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert own org settings' AND tablename = 'org_settings'
  ) THEN
    CREATE POLICY "Admins can insert own org settings"
    ON public.org_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (
      (organization_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)
    );
  END IF;
END $$;