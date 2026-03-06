
-- Create gis_data table to store parsed GIS Excel data
CREATE TABLE public.gis_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  sr_id text NOT NULL,
  
  -- Page 1: Main building data
  building_id text,
  area_type text,
  floors integer DEFAULT 0,
  customer_floor text,
  bep_floor text,
  admin_signature boolean DEFAULT false,
  bep_only boolean DEFAULT false,
  bep_template text,
  bep_type text,
  bmo_type text,
  deh_nanotronix boolean DEFAULT false,
  nanotronix boolean DEFAULT false,
  smart_readiness boolean DEFAULT false,
  associated_bcp text,
  nearby_bcp text,
  new_bcp text,
  conduit text,
  distance_from_cabinet numeric DEFAULT 0,
  latitude numeric,
  longitude numeric,
  notes text,
  warning text,
  failure text,
  
  -- Page 2: Floor details (stored as JSONB array)
  floor_details jsonb DEFAULT '[]'::jsonb,
  
  -- Page 3: Optical paths (stored as JSONB array)
  optical_paths jsonb DEFAULT '[]'::jsonb,
  
  -- Page 4: Works (stored as JSONB array)
  gis_works jsonb DEFAULT '[]'::jsonb,
  
  -- Raw data for reference
  raw_data jsonb DEFAULT '{}'::jsonb,
  
  -- File reference
  file_path text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gis_data ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage gis_data" ON public.gis_data
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can insert gis_data" ON public.gis_data
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = gis_data.assignment_id AND a.technician_id = auth.uid()
  ));

CREATE POLICY "Technicians can view own gis_data" ON public.gis_data
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = gis_data.assignment_id AND a.technician_id = auth.uid()
  ));

-- Create storage bucket for GIS files
INSERT INTO storage.buckets (id, name, public) VALUES ('gis-files', 'gis-files', false);

-- Storage RLS policies
CREATE POLICY "Technicians can upload gis files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gis-files');

CREATE POLICY "Authenticated users can read gis files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'gis-files');

-- Updated at trigger
CREATE TRIGGER update_gis_data_updated_at
  BEFORE UPDATE ON public.gis_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
