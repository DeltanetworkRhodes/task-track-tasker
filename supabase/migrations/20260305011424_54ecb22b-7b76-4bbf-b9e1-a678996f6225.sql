
-- Create surveys table
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_id text NOT NULL,
  area text NOT NULL,
  technician_id uuid NOT NULL,
  comments text DEFAULT '',
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

-- Technicians can insert their own surveys
CREATE POLICY "Technicians can insert own surveys"
ON public.surveys FOR INSERT TO authenticated
WITH CHECK (auth.uid() = technician_id);

-- Technicians can view own surveys, admins can view all
CREATE POLICY "Users can view surveys"
ON public.surveys FOR SELECT TO authenticated
USING (
  auth.uid() = technician_id OR public.has_role(auth.uid(), 'admin')
);

-- Technicians can update own surveys
CREATE POLICY "Technicians can update own surveys"
ON public.surveys FOR UPDATE TO authenticated
USING (auth.uid() = technician_id);

-- Create survey_files table to track uploaded files
CREATE TABLE public.survey_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  file_type text NOT NULL, -- 'building_photo', 'screenshot', 'inspection_form'
  file_path text NOT NULL,
  file_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert survey files"
ON public.survey_files FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.surveys WHERE id = survey_id AND technician_id = auth.uid()
));

CREATE POLICY "Users can view survey files"
ON public.survey_files FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.surveys WHERE id = survey_id AND (technician_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));

-- Create storage bucket for survey uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('surveys', 'surveys', true);

-- Storage RLS: authenticated users can upload to surveys bucket
CREATE POLICY "Authenticated users can upload survey files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'surveys');

CREATE POLICY "Anyone can view survey files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'surveys');

-- Add updated_at trigger
CREATE TRIGGER update_surveys_updated_at
  BEFORE UPDATE ON public.surveys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
