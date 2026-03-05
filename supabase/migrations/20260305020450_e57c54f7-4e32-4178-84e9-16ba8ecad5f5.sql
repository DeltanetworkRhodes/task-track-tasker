
CREATE OR REPLACE FUNCTION public.notify_admins_on_survey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  tech_name text;
BEGIN
  -- Get technician name
  SELECT full_name INTO tech_name FROM public.profiles WHERE user_id = NEW.technician_id LIMIT 1;

  -- Notify all admins
  FOR admin_record IN SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, data)
    VALUES (
      admin_record.user_id,
      'Νέα Αυτοψία',
      'Ο ' || COALESCE(tech_name, 'τεχνικός') || ' υπέβαλε αυτοψία για SR ' || NEW.sr_id || ' (' || NEW.area || ')',
      jsonb_build_object('survey_id', NEW.id, 'sr_id', NEW.sr_id, 'area', NEW.area, 'technician_id', NEW.technician_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_survey_submitted
  AFTER INSERT ON public.surveys
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_survey();
