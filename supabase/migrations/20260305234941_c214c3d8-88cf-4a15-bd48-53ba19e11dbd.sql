
CREATE OR REPLACE FUNCTION public.notify_admins_on_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  tech_name text;
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') AND NEW.technician_id IS NOT NULL THEN
    SELECT full_name INTO tech_name FROM public.profiles WHERE user_id = NEW.technician_id LIMIT 1;

    FOR admin_record IN SELECT user_id FROM public.user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, data)
      VALUES (
        admin_record.user_id,
        'Ακύρωση Ανάθεσης',
        'Ο ' || COALESCE(tech_name, 'τεχνικός') || ' ακύρωσε το SR ' || NEW.sr_id || ' (' || NEW.area || ')',
        jsonb_build_object('assignment_id', NEW.id, 'sr_id', NEW.sr_id, 'area', NEW.area, 'technician_id', NEW.technician_id)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_assignment_cancelled
  AFTER UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_cancellation();
