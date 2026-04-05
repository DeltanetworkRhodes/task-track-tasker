
CREATE TABLE public.work_time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL,
  organization_id UUID,
  check_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_out TIMESTAMP WITH TIME ZONE,
  duration_minutes NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.work_time_entries ENABLE ROW LEVEL SECURITY;

-- Technicians can view their own entries
CREATE POLICY "Technicians can view own time entries"
ON public.work_time_entries FOR SELECT
TO authenticated
USING (auth.uid() = technician_id);

-- Technicians can insert their own entries
CREATE POLICY "Technicians can insert own time entries"
ON public.work_time_entries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = technician_id AND organization_id = get_user_org_id(auth.uid()));

-- Technicians can update their own entries (for check-out)
CREATE POLICY "Technicians can update own time entries"
ON public.work_time_entries FOR UPDATE
TO authenticated
USING (auth.uid() = technician_id);

-- Admins can view org entries
CREATE POLICY "Admins can view org time entries"
ON public.work_time_entries FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
);

-- Admins can manage org entries
CREATE POLICY "Admins can manage org time entries"
ON public.work_time_entries FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
)
WITH CHECK (
  is_super_admin(auth.uid()) OR
  (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
);

-- Index for fast lookups
CREATE INDEX idx_work_time_entries_assignment ON public.work_time_entries(assignment_id);
CREATE INDEX idx_work_time_entries_technician ON public.work_time_entries(technician_id);
