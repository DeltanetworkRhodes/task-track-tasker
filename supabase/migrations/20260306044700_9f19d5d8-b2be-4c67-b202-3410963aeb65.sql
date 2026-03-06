
-- Assignment history / timeline table
CREATE TABLE public.assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_assignment_history_assignment ON public.assignment_history(assignment_id);
CREATE INDEX idx_assignment_history_created ON public.assignment_history(created_at DESC);

-- RLS
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignment_history" ON public.assignment_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view own assignment history" ON public.assignment_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = assignment_history.assignment_id
    AND a.technician_id = auth.uid()
  ));

CREATE POLICY "Technicians can insert own assignment history" ON public.assignment_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = assignment_history.assignment_id
    AND a.technician_id = auth.uid()
  ));

-- Trigger to auto-log status changes
CREATE OR REPLACE FUNCTION public.log_assignment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.assignment_history (assignment_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_assignment_status
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_assignment_status_change();
