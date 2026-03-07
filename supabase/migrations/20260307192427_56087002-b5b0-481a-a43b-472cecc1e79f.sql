
-- Table for electronic inspection reports (Δελτίο Αυτοψίας)
CREATE TABLE public.inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  technician_id uuid NOT NULL,
  sr_id text NOT NULL,
  
  -- Page 1: Customer info
  customer_name text,
  customer_father_name text,
  customer_mobile text,
  customer_phone text,
  customer_email text,
  customer_street text,
  customer_number text,
  customer_postal_code text,
  customer_floor text,
  customer_apartment_code text,
  customer_county text,
  customer_municipality text,
  customer_notes text,
  
  -- Page 1: Manager info
  manager_name text,
  manager_mobile text,
  manager_email text,
  
  -- Page 1: Technical service info
  service_address text,
  service_phone text,
  service_email text,
  technician_name text,
  
  -- Page 2: Technical description - routing to BEP
  routing_escalit boolean DEFAULT false,
  routing_external_pipe boolean DEFAULT false,
  routing_aerial boolean DEFAULT false,
  routing_other text,
  excavation_to_pipe boolean,
  excavation_to_rg boolean,
  pipe_placement boolean DEFAULT false,
  wall_mount boolean DEFAULT false,
  fence_building_mount boolean DEFAULT false,
  excavation_to_building boolean DEFAULT false,
  
  -- Page 2: BEP position
  bep_position text, -- e.g. 'internal', 'external', 'fence', 'building', 'pillar', 'pole', 'basement', 'rooftop', 'ground', 'piloti'
  
  -- Page 2: Vertical routing
  vertical_routing text, -- e.g. 'shaft', 'staircase', 'lightwell', 'elevator', 'lantern', 'other'
  
  -- Page 2: Sketches & notes
  sketch_notes text,
  optical_socket_position text,
  
  -- Page 2: Signatures (stored as base64 data URLs)
  engineer_signature text,
  customer_signature text,
  manager_signature text,
  
  -- Page 3: Responsible declaration
  declaration_type text, -- 'approve' or 'reject'
  declarant_name text,
  declarant_id_number text,
  declarant_city text,
  declarant_street text,
  declarant_number text,
  declarant_postal_code text,
  declaration_date date,
  declaration_signature text,
  cost_option text, -- 'ote_covers' or 'not_ote'
  
  -- Page 4: Building details
  building_id text,
  building_address text,
  customer_floor_select text,
  total_apartments integer,
  total_shops integer,
  total_spaces integer,
  total_floors integer,
  cabinet text,
  pipe_code text,
  
  -- Page 4: BCP details
  bcp_brand text, -- 'raycap' or 'ztt'
  bcp_size text, -- 'small' or 'medium'
  bcp_floorbox boolean DEFAULT false,
  bcp_drop_6 boolean DEFAULT false,
  bcp_drop_12 boolean DEFAULT false,
  
  -- Page 4: BEP details
  bep_brand text,
  bep_size text,
  bep_capacity text,
  
  -- Page 4: BMO details
  bmo_brand text,
  bmo_size text,
  bmo_capacity text,
  
  -- PDF generation
  pdf_generated boolean DEFAULT false,
  pdf_drive_url text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage inspection_reports" ON public.inspection_reports
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can insert own inspection_reports" ON public.inspection_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Technicians can update own inspection_reports" ON public.inspection_reports
  FOR UPDATE TO authenticated
  USING (auth.uid() = technician_id);

CREATE POLICY "Technicians can view own inspection_reports" ON public.inspection_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = technician_id OR has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_inspection_reports_updated_at
  BEFORE UPDATE ON public.inspection_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
