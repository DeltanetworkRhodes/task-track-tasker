CREATE TABLE public.profit_per_sr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_id text NOT NULL UNIQUE,
  revenue numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_per_sr ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view profit_per_sr"
  ON public.profit_per_sr FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert profit_per_sr"
  ON public.profit_per_sr FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update profit_per_sr"
  ON public.profit_per_sr FOR UPDATE TO authenticated USING (true);