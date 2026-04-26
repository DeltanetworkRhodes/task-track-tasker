CREATE OR REPLACE FUNCTION public.compute_subcontractor_monthly_summary(
  p_year int,
  p_month int
)
RETURNS TABLE (
  subcontractor_id uuid,
  full_name text,
  short_name text,
  primary_region text,
  tickets_count bigint,
  total_amount numeric,
  has_existing_payment boolean,
  payment_status text,
  payment_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id as subcontractor_id,
    s.full_name,
    s.short_name,
    s.primary_region,
    COUNT(DISTINCT t.id) as tickets_count,
    COALESCE(SUM(t.total_subcontractor_eur), 0) as total_amount,
    sp.id IS NOT NULL as has_existing_payment,
    COALESCE(sp.status, 'not_created') as payment_status,
    sp.id as payment_id
  FROM public.subcontractors s
  LEFT JOIN public.vodafone_tickets t ON t.subcontractor_id = s.id
    AND t.status = 'completed'
    AND EXTRACT(YEAR FROM t.completed_at) = p_year
    AND EXTRACT(MONTH FROM t.completed_at) = p_month
  LEFT JOIN public.subcontractor_payments sp ON sp.subcontractor_id = s.id
    AND sp.period_year = p_year
    AND sp.period_month = p_month
  WHERE s.organization_id = public.get_user_org_id(auth.uid())
    AND s.active = true
  GROUP BY s.id, s.full_name, s.short_name, s.primary_region, sp.id, sp.status
  ORDER BY total_amount DESC;
$$;