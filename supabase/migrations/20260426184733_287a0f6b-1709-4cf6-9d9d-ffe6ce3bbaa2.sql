CREATE TABLE IF NOT EXISTS public.backup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  filename text NOT NULL,
  total_rows int,
  tables_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_log_admin_all" ON public.backup_log
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));