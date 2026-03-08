
CREATE TABLE public.pre_work_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL,
  organization_id UUID,
  access_confirmed BOOLEAN NOT NULL DEFAULT false,
  access_confirmed_at TIMESTAMP WITH TIME ZONE,
  photo_path TEXT,
  photo_uploaded_at TIMESTAMP WITH TIME ZONE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assignment_id)
);

ALTER TABLE public.pre_work_checklists ENABLE ROW LEVEL SECURITY;

-- Technicians can insert their own checklists
CREATE POLICY "Technicians can insert own pre_work_checklists"
  ON public.pre_work_checklists FOR INSERT
  WITH CHECK (auth.uid() = technician_id);

-- Technicians can update their own checklists
CREATE POLICY "Technicians can update own pre_work_checklists"
  ON public.pre_work_checklists FOR UPDATE
  USING (auth.uid() = technician_id);

-- Technicians can view their own checklists
CREATE POLICY "Technicians can view own pre_work_checklists"
  ON public.pre_work_checklists FOR SELECT
  USING (auth.uid() = technician_id OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all checklists
CREATE POLICY "Admins can manage pre_work_checklists"
  ON public.pre_work_checklists FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
