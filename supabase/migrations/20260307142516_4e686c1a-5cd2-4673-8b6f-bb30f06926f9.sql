-- Create SR comments table for admin-technician communication
CREATE TABLE public.sr_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sr_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage sr_comments"
  ON public.sr_comments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view own sr_comments"
  ON public.sr_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.id = sr_comments.assignment_id AND a.technician_id = auth.uid()
  ));

CREATE POLICY "Technicians can insert own sr_comments"
  ON public.sr_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = sr_comments.assignment_id AND a.technician_id = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sr_comments;