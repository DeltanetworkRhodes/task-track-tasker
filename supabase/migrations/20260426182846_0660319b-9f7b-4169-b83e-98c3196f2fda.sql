-- Per-organization client access control
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enabled_clients text[] NOT NULL DEFAULT ARRAY['ote'];

COMMENT ON COLUMN public.organizations.enabled_clients IS 
  'Array of enabled client modules: ote, vodafone, nova, deh, master';

-- Helper function: check if client is enabled for user's org
CREATE OR REPLACE FUNCTION public.is_client_enabled(client_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    public.is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = public.get_user_org_id(auth.uid())
        AND client_code = ANY(o.enabled_clients)
    );
$$;

-- Backfill: Enable all clients for DeltaNetwork organization
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = 'info@deltanetwork.gr'
  LIMIT 1;
  
  IF v_org_id IS NOT NULL THEN
    UPDATE public.organizations
    SET enabled_clients = ARRAY['ote','vodafone','nova','deh','master']
    WHERE id = v_org_id;
  END IF;
END $$;