-- default_phase στον τεχνικό
-- NULL = admin (βλέπει όλα)
-- 1,2,3 = φάση τεχνικού
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_phase int DEFAULT NULL;

-- phase στις κατηγορίες εργασίας
ALTER TABLE public.sr_work_categories
  ADD COLUMN IF NOT EXISTS phase int DEFAULT 1;

-- phase status στις κατασκευές
ALTER TABLE public.constructions
  ADD COLUMN IF NOT EXISTS phase1_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phase2_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phase3_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phase1_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase3_completed_at timestamptz;

-- Seed: 3 φάσεις (μία φορά ανά organization)
INSERT INTO public.sr_work_categories
  (organization_id, name, phase, work_prefixes, photo_categories, sort_order, requires_works, can_close_sr, active)
SELECT 
  o.id,
  v.name,
  v.phase,
  v.work_prefixes,
  v.photo_categories,
  v.sort_order,
  v.requires_works,
  v.can_close_sr,
  true
FROM public.organizations o
CROSS JOIN (VALUES
  ('🚜 Φάση 1 — Χωματουργικά', 1,
   ARRAY['1991','1965','1993','1963'],
   ARRAY['ΣΚΑΜΑ','ΟΔΕΥΣΗ','BCP'],
   1, true, false),
  ('🔧 Φάση 2 — Οδεύσεις', 2,
   ARRAY['1970','1984','1985','1986'],
   ARRAY['BEP','BMO','FB'],
   2, true, false),
  ('🔬 Φάση 3 — Κόλληση', 3,
   ARRAY['1955','1980'],
   ARRAY['ΚΑΜΠΙΝΑ','Γ_ΦΑΣΗ'],
   3, true, true)
) AS v(name, phase, work_prefixes, photo_categories, sort_order, requires_works, can_close_sr)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sr_work_categories sc
  WHERE sc.organization_id = o.id
    AND sc.phase = v.phase
);