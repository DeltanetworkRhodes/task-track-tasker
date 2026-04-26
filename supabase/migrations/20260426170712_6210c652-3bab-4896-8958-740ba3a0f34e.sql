-- Tables
CREATE TABLE IF NOT EXISTS public.vodafone_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('CBU','EBU','SoHo')),
  zone text NOT NULL CHECK (zone IN ('ISLANDS','REST_OF_GREECE','ALL')),
  description_el text NOT NULL,
  category text NOT NULL CHECK (category IN ('installation','support','auxiliary','addon','combo')),
  unit_price_eur numeric(10,2) NOT NULL,
  is_combo boolean NOT NULL DEFAULT false,
  combo_includes text[],
  active boolean NOT NULL DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code, customer_type)
);
CREATE INDEX IF NOT EXISTS idx_vodafone_articles_org ON public.vodafone_articles(organization_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_vodafone_articles_type ON public.vodafone_articles(customer_type);

CREATE TABLE IF NOT EXISTS public.subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  short_name text,
  phone text,
  email text,
  vat_number text,
  primary_region text NOT NULL,
  secondary_regions text[],
  total_tickets_completed int NOT NULL DEFAULT 0,
  total_paid_eur numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subcontractors_org ON public.subcontractors(organization_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_subcontractors_region ON public.subcontractors(primary_region);

CREATE TABLE IF NOT EXISTS public.subcontractor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  client_code text NOT NULL DEFAULT 'VODAFONE',
  service_code text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('CBU','EBU','SoHo','ALL')),
  unit_price_eur numeric(10,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcontractor_id, client_code, service_code, customer_type)
);
CREATE INDEX IF NOT EXISTS idx_subcontractor_pricing_lookup 
  ON public.subcontractor_pricing(subcontractor_id, client_code, service_code, customer_type)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.vodafone_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('CBU','EBU','SoHo')),
  zone text NOT NULL CHECK (zone IN ('ISLANDS','REST_OF_GREECE')),
  customer_name text,
  customer_phone text,
  customer_address text,
  region text NOT NULL,
  subcontractor_id uuid REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled','failed')),
  is_same_day boolean NOT NULL DEFAULT false,
  total_vodafone_eur numeric(10,2) NOT NULL DEFAULT 0,
  total_subcontractor_eur numeric(10,2) NOT NULL DEFAULT 0,
  margin_eur numeric(10,2) GENERATED ALWAYS AS (total_vodafone_eur - total_subcontractor_eur) STORED,
  customer_signature_url text,
  photos_count int DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vodafone_tickets_org ON public.vodafone_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_vodafone_tickets_status ON public.vodafone_tickets(status);
CREATE INDEX IF NOT EXISTS idx_vodafone_tickets_subcontractor ON public.vodafone_tickets(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_vodafone_tickets_region ON public.vodafone_tickets(region);
CREATE INDEX IF NOT EXISTS idx_vodafone_tickets_completed ON public.vodafone_tickets(completed_at) WHERE status = 'completed';

CREATE TABLE IF NOT EXISTS public.vodafone_ticket_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.vodafone_tickets(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.vodafone_articles(id),
  service_code text NOT NULL,
  description text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price_vodafone numeric(10,2) NOT NULL,
  total_vodafone numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price_vodafone) STORED,
  unit_price_subcontractor numeric(10,2) NOT NULL DEFAULT 0,
  total_subcontractor numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price_subcontractor) STORED,
  is_part_of_combo boolean DEFAULT false,
  combo_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_services_ticket ON public.vodafone_ticket_services(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_services_code ON public.vodafone_ticket_services(service_code);

CREATE TABLE IF NOT EXISTS public.subcontractor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE RESTRICT,
  period_year int NOT NULL,
  period_month int NOT NULL,
  tickets_count int NOT NULL DEFAULT 0,
  amount_eur numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partial')),
  payment_date date,
  payment_method text,
  statement_pdf_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcontractor_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON public.subcontractor_payments(status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_period ON public.subcontractor_payments(period_year, period_month);

-- Trigger functions
CREATE OR REPLACE FUNCTION public.recalculate_vodafone_ticket_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket_id uuid;
  v_total_voda numeric;
  v_total_sub numeric;
BEGIN
  v_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);
  SELECT COALESCE(SUM(total_vodafone),0), COALESCE(SUM(total_subcontractor),0)
    INTO v_total_voda, v_total_sub
    FROM public.vodafone_ticket_services WHERE ticket_id = v_ticket_id;
  UPDATE public.vodafone_tickets
    SET total_vodafone_eur = v_total_voda, total_subcontractor_eur = v_total_sub, updated_at = now()
    WHERE id = v_ticket_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_voda_ticket ON public.vodafone_ticket_services;
CREATE TRIGGER trg_recalc_voda_ticket
  AFTER INSERT OR UPDATE OR DELETE ON public.vodafone_ticket_services
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_vodafone_ticket_totals();

CREATE OR REPLACE FUNCTION public.set_subcontractor_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id uuid;
  v_cust_type text;
  v_sub_price numeric;
BEGIN
  SELECT t.subcontractor_id, t.customer_type INTO v_sub_id, v_cust_type
    FROM public.vodafone_tickets t WHERE t.id = NEW.ticket_id;
  IF v_sub_id IS NOT NULL THEN
    SELECT unit_price_eur INTO v_sub_price
      FROM public.subcontractor_pricing
      WHERE subcontractor_id = v_sub_id
        AND service_code = NEW.service_code
        AND (customer_type = v_cust_type OR customer_type = 'ALL')
        AND active = true
      ORDER BY CASE WHEN customer_type = v_cust_type THEN 0 ELSE 1 END
      LIMIT 1;
    IF v_sub_price IS NOT NULL THEN
      NEW.unit_price_subcontractor := v_sub_price;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sub_price ON public.vodafone_ticket_services;
CREATE TRIGGER trg_set_sub_price
  BEFORE INSERT OR UPDATE OF service_code ON public.vodafone_ticket_services
  FOR EACH ROW EXECUTE FUNCTION public.set_subcontractor_price();

CREATE TRIGGER update_vodafone_articles_updated_at BEFORE UPDATE ON public.vodafone_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subcontractors_updated_at BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subcontractor_pricing_updated_at BEFORE UPDATE ON public.subcontractor_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vodafone_tickets_updated_at BEFORE UPDATE ON public.vodafone_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subcontractor_payments_updated_at BEFORE UPDATE ON public.subcontractor_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.vodafone_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY voda_articles_select ON public.vodafone_articles FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR organization_id = get_user_org_id(auth.uid()));
CREATE POLICY voda_articles_admin_all ON public.vodafone_articles FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY subs_select ON public.subcontractors FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY subs_admin_all ON public.subcontractors FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));

ALTER TABLE public.subcontractor_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_pricing_select ON public.subcontractor_pricing FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subcontractors s WHERE s.id = subcontractor_pricing.subcontractor_id AND (is_super_admin(auth.uid()) OR (s.organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))));
CREATE POLICY sub_pricing_admin_all ON public.subcontractor_pricing FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subcontractors s WHERE s.id = subcontractor_pricing.subcontractor_id AND (is_super_admin(auth.uid()) OR (s.organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.subcontractors s WHERE s.id = subcontractor_pricing.subcontractor_id AND (is_super_admin(auth.uid()) OR (s.organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))));

ALTER TABLE public.vodafone_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY voda_tickets_select ON public.vodafone_tickets FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY voda_tickets_admin_all ON public.vodafone_tickets FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));

ALTER TABLE public.vodafone_ticket_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY voda_ticket_services_select ON public.vodafone_ticket_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vodafone_tickets t WHERE t.id = vodafone_ticket_services.ticket_id AND (is_super_admin(auth.uid()) OR t.organization_id = get_user_org_id(auth.uid()))));
CREATE POLICY voda_ticket_services_admin_all ON public.vodafone_ticket_services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vodafone_tickets t WHERE t.id = vodafone_ticket_services.ticket_id AND (is_super_admin(auth.uid()) OR (t.organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vodafone_tickets t WHERE t.id = vodafone_ticket_services.ticket_id AND (is_super_admin(auth.uid()) OR (t.organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))));

ALTER TABLE public.subcontractor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_payments_select ON public.subcontractor_payments FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY sub_payments_admin_all ON public.subcontractor_payments FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_super_admin(auth.uid()) OR (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)));