
-- Create appointments table for calendar events parsed from survey comments
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE,
  sr_id text NOT NULL,
  customer_name text,
  area text,
  appointment_at timestamp with time zone NOT NULL,
  description text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view appointments"
ON public.appointments FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert appointments"
ON public.appointments FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update appointments"
ON public.appointments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete appointments"
ON public.appointments FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create email_settings table for configurable recipients
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email settings"
ON public.email_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default email recipients
INSERT INTO public.email_settings (setting_key, setting_value) VALUES
  ('report_to_emails', 'info@deltanetwork.gr'),
  ('report_cc_emails', 'athiniotis@deltanetwork.gr');

-- Add email_sent flag to surveys so we don't send duplicates
ALTER TABLE public.surveys ADD COLUMN email_sent boolean DEFAULT false;
