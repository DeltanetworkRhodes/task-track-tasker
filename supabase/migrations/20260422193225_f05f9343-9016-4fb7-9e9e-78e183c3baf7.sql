-- ============================================================
-- OTE PRICING SYSTEM — Phase 1: Database Schema
-- ============================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE ote_article_category AS ENUM (
    'AUTOPSIA',
    'SKAMMA_BCP',
    'EXTENSION',
    'BEP',
    'KOI_CABIN_BEP',
    'HORIZONTAL',
    'VERTICAL',
    'CUSTOMER',
    'SPLITTER',
    'AERIAL_SPECIAL',
    'SMART_READINESS',
    'REPAIR_HEIGHT',
    'EXCLUDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ote_article_frequency AS ENUM (
    'ALWAYS',
    'CONDITIONAL',
    'RARE',
    'ON_DAMAGE',
    'ON_APPROVAL',
    'NEVER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.ote_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  category ote_article_category NOT NULL,
  title text NOT NULL,
  official_description text,
  when_to_use text,
  user_annotation text,
  price_eur numeric(10,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'SR',
  frequency ote_article_frequency NOT NULL DEFAULT 'CONDITIONAL',
  is_active boolean NOT NULL DEFAULT true,
  is_excluded boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT ote_articles_code_org_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ote_articles_org ON public.ote_articles(organization_id);
CREATE INDEX IF NOT EXISTS idx_ote_articles_category ON public.ote_articles(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_ote_articles_active ON public.ote_articles(organization_id, is_active) WHERE is_active = true;

-- 3) Trigger για updated_at + updated_by
CREATE OR REPLACE FUNCTION public.update_ote_articles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ote_articles_updated_at ON public.ote_articles;
CREATE TRIGGER ote_articles_updated_at
  BEFORE UPDATE ON public.ote_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ote_articles_updated_at();

-- 4) RLS
ALTER TABLE public.ote_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view ote_articles" ON public.ote_articles;
CREATE POLICY "Org members can view ote_articles"
  ON public.ote_articles FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR organization_id = get_user_org_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage ote_articles" ON public.ote_articles;
CREATE POLICY "Admins manage ote_articles"
  ON public.ote_articles FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role) AND organization_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- 5) SEED — 102 articles για ΚΑΘΕ organization
-- ============================================================
DO $seed$
DECLARE
  v_org_id uuid;
BEGIN
FOR v_org_id IN SELECT id FROM public.organizations LOOP

-- 1. ΑΥΤΟΨΙΑ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1956.1', 'AUTOPSIA', 'Αυτοψία μεσαίου/μεγάλου κτιρίου', 'Κτίριο με πάνω από 4 διαμερίσματα ή πάνω από 2 ορόφους — η πιο κοινή περίπτωση', 55.80, 'ALWAYS', 101),
(v_org_id, '1956.2', 'AUTOPSIA', 'Αυτοψία μικρού κτιρίου', 'Έως 4 διαμερίσματα σε έως 2 επίπεδα — για μονοκατοικίες & μεζονέτες', 34.88, 'CONDITIONAL', 102),
(v_org_id, '1951', 'AUTOPSIA', 'Site survey σε κτίριο άλλου παρόχου', 'Κτίριο με FTTH άλλου παρόχου — απαιτεί έγγραφη εντολή ΟΤΕ', 27.90, 'RARE', 103),
(v_org_id, '1968.2', 'AUTOPSIA', 'Αυτοψία Smart Readiness (χωρίς υπογραφή)', 'Για Smart Readiness κουπόνια — αντί κλασικής αυτοψίας', 41.85, 'RARE', 104)
ON CONFLICT (organization_id, code) DO NOTHING;

-- 2. ΣΚΑΜΑ & BCP
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1915.1.1', 'SKAMMA_BCP', 'Κλάδος διανομής έως 2m — διαμορφωμένη', 'Πολύ μικρή σκάψη σε πεζοδρόμιο με πλακάκια/άσφαλτο', 65.22, 'CONDITIONAL', 201),
(v_org_id, '1915.1.2', 'SKAMMA_BCP', 'Κλάδος διανομής έως 2m — αδιαμόρφωτη', 'Πολύ μικρή σκάψη σε χώμα', 47.64, 'CONDITIONAL', 202),
(v_org_id, '1915.2.1', 'SKAMMA_BCP', 'Κλάδος διανομής 2-15m — διαμορφωμένη', 'Μεσαία σκάψη σε πεζοδρόμιο', 91.58, 'CONDITIONAL', 203),
(v_org_id, '1915.2.2', 'SKAMMA_BCP', 'Κλάδος διανομής 2-15m — αδιαμόρφωτη', 'Μεσαία σκάψη σε χώμα', 65.92, 'CONDITIONAL', 204),
(v_org_id, '1915.4.1', 'SKAMMA_BCP', 'Κλάδος διανομής 15-30m — διαμορφωμένη', 'Μεγάλη σκάψη σε πεζοδρόμιο', 117.18, 'CONDITIONAL', 205),
(v_org_id, '1915.4.2', 'SKAMMA_BCP', 'Κλάδος διανομής 15-30m — αδιαμόρφωτη', 'Μεγάλη σκάψη σε χώμα', 80.57, 'CONDITIONAL', 206),
(v_org_id, '1991.1.1', 'SKAMMA_BCP', 'BCP σε Δημόσιο Χώρο έως 3m', 'BCP διακλαδωτής σε στύλο/τοίχο σε δρόμο/πεζοδρόμιο', 83.70, 'CONDITIONAL', 207),
(v_org_id, '1991.1.2', 'SKAMMA_BCP', 'BCP σε Δημόσιο Χώρο 3-10m', NULL, 139.50, 'CONDITIONAL', 208),
(v_org_id, '1991.1.3', 'SKAMMA_BCP', 'BCP σε Δημόσιο Χώρο 10-15m', NULL, 181.35, 'CONDITIONAL', 209),
(v_org_id, '1991.2.1', 'SKAMMA_BCP', 'BCP σε Ιδιωτικό Χώρο έως 5m', 'BCP μέσα στην ιδιοκτησία πελάτη (αυλή, πρασιά)', 104.63, 'CONDITIONAL', 210),
(v_org_id, '1991.2.2', 'SKAMMA_BCP', 'BCP σε Ιδιωτικό Χώρο έως 15m', NULL, 174.38, 'CONDITIONAL', 211),
(v_org_id, '1991.2.3', 'SKAMMA_BCP', 'BCP σε Ιδιωτικό Χώρο έως 30m', NULL, 244.13, 'CONDITIONAL', 212),
(v_org_id, '1997', 'SKAMMA_BCP', 'Τοποθέτηση κουτιού BCP', 'Όταν τοποθετείς οπτικό σύνδεσμο ή BCP κουτί σε στύλο', 13.95, 'CONDITIONAL', 213)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'BCP ΔΙΑΚΛΑΔΩΤΗΣ ΣΚΑΜΑ' WHERE organization_id = v_org_id AND code = '1991.1.1';
UPDATE public.ote_articles SET user_annotation = 'ΙΔΙΩΤΙΚΟ ΧΩΡΟ ΤΟΠΟΘΕΤΗΣΗΣ' WHERE organization_id = v_org_id AND code = '1991.2.1';

-- 3. ΕΠΕΚΤΑΣΗ ΣΩΛΗΝΩΣΗΣ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1963.1', 'EXTENSION', 'Εσκαλίτ (υφιστάμενη σωλήνωση) έως 5m', 'Υπάρχει ήδη σωλήνα εισαγωγής ΟΤΕ — βάζεις σωληνίσκο μέσα. ΠΟΛΥ ΣΥΧΝΟ', 104.63, 'CONDITIONAL', 301),
(v_org_id, '1963.2', 'EXTENSION', 'Εσκαλίτ έως 15m', NULL, 174.38, 'CONDITIONAL', 302),
(v_org_id, '1965.1', 'EXTENSION', 'Νέα σωλήνωση έως 5m', 'Δεν υπάρχει σωλήνωση εισαγωγής — νέα κατασκευή', 104.63, 'CONDITIONAL', 303),
(v_org_id, '1965.2', 'EXTENSION', 'Νέα σωλήνωση έως 15m', NULL, 174.38, 'CONDITIONAL', 304),
(v_org_id, '1965.3', 'EXTENSION', 'Νέα σωλήνωση έως 30m', NULL, 244.13, 'CONDITIONAL', 305),
(v_org_id, '1965.4', 'EXTENSION', 'Νέα σωλήνωση έως 60m', NULL, 313.88, 'CONDITIONAL', 306),
(v_org_id, '1965.5', 'EXTENSION', 'Νέα σωλήνωση έως 5m με ΚΥΑ 2023', '2 σωληνίσκοι σύμφωνα με νέα ΚΥΑ', 111.60, 'CONDITIONAL', 307),
(v_org_id, '1965.6', 'EXTENSION', 'Νέα σωλήνωση έως 15m με ΚΥΑ 2023', '2 σωληνίσκοι, μεσαία διαδρομή — συχνό', 188.33, 'CONDITIONAL', 308),
(v_org_id, '1965.7', 'EXTENSION', 'Νέα σωλήνωση έως 30m με ΚΥΑ 2023', NULL, 265.05, 'CONDITIONAL', 309),
(v_org_id, '1965.8', 'EXTENSION', 'Νέα σωλήνωση έως 60m με ΚΥΑ 2023', NULL, 341.78, 'CONDITIONAL', 310)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'ΤΡΕΧΩΝ ΜΕΤΡΟ' WHERE organization_id = v_org_id AND code = '1965.5';

-- 4. BEP
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1970.1', 'BEP', 'BEP έως 10m', 'Το BEP τοποθετείται κοντά (≤10m) στο σημείο επέκτασης', 34.88, 'CONDITIONAL', 401),
(v_org_id, '1970.2', 'BEP', 'BEP έως 25m', 'BEP πιο μακριά — 10-25 μέτρα', 69.75, 'CONDITIONAL', 402),
(v_org_id, '1970.3', 'BEP', 'BEP έως 40m (δώμα)', 'Συνήθως όταν μπαίνει στο δώμα μεγάλου κτιρίου', 122.06, 'CONDITIONAL', 403),
(v_org_id, '1970.4', 'BEP', 'BEP μικρό κτίριο - ΚΥΑ 2023', 'Μονοκατοικία/δίπατο έως 4 διαμερίσματα', 20.93, 'CONDITIONAL', 404),
(v_org_id, '1970.5', 'BEP', 'BEP μεσαίο/μεγάλο - ΚΥΑ 2023', 'Η κανονική περίπτωση για πολυκατοικίες. ΚΚΚ ευθυγραμμισμένο', 34.88, 'ALWAYS', 405)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'BM0' WHERE organization_id = v_org_id AND code = '1970.4';

-- 5. ΚΟΙ ΚΑΜΠΙΝΑ → BEP
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1980.1', 'KOI_CABIN_BEP', 'ΚΟΙ Καμπίνα→BEP ελεύθερη υποδομή', 'Η κανονική περίπτωση — εμφύσηση καλωδίου σε ελεύθερη σωλήνωση', 125.55, 'ALWAYS', 501),
(v_org_id, '1980.2', 'KOI_CABIN_BEP', 'ΚΟΙ Καμπίνα→BEP κατειλημμένη υποδομή', 'Συνήθως σε βλάβη — υπάρχει ήδη καλώδιο', 139.50, 'ON_DAMAGE', 502)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'ΕΜΦΥΣΗΣΗ' WHERE organization_id = v_org_id AND code = '1980.1';
UPDATE public.ote_articles SET user_annotation = 'ΒΛΑΒΗ' WHERE organization_id = v_org_id AND code = '1980.2';

-- 6. ΟΡΙΖΟΝΤΙΑ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1984.i', 'HORIZONTAL', 'Οριζόντια έως 5m (ίδιο επίπεδο)', 'FB στον ίδιο όροφο με το BEP, απόσταση ≤5m', 55.80, 'CONDITIONAL', 601),
(v_org_id, '1984.ii', 'HORIZONTAL', 'Οριζόντια >5m (ίδιο επίπεδο)', 'Ίδιο επίπεδο αλλά απόσταση >5m', 69.75, 'CONDITIONAL', 602)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'FLOOR BOX 0' WHERE organization_id = v_org_id AND code = '1984.i';

-- 7. ΚΑΤΑΚΟΡΥΦΗ & ΚΟΛΗΣΗ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, unit, sort_order) VALUES
(v_org_id, '1985.1', 'VERTICAL', 'Κατακόρυφη υποδομή / όροφο - μόνο μικροϋλικά', 'Η απλούστερη περίπτωση - tacker, σφικτήρες', 38.36, 'CONDITIONAL', 'FLOOR', 701),
(v_org_id, '1985.2', 'VERTICAL', 'Κατακόρυφη υποδομή / όροφο - με υλικά', 'Κανονική περίπτωση - κανάλι/σωλήνα ανά όροφο. × N ορόφους', 45.34, 'ALWAYS', 'FLOOR', 702),
(v_org_id, '1985.3', 'VERTICAL', 'Κατακόρυφη σε φρεάτιο ανελκυστήρα έως 5 ορόφους', 'Ενιαία τιμή για shaft ασανσέρ έως 5 ορόφους', 160.43, 'RARE', 'SR', 703),
(v_org_id, '1985.4', 'VERTICAL', 'Κατακόρυφη σε φρεάτιο - επιπλέον όροφος', 'Μαζί με 1985.3 για >5 ορόφους', 27.90, 'RARE', 'FLOOR', 704),
(v_org_id, '1986.1', 'VERTICAL', 'Κόληση ΚΟΙ - 3 πρώτοι όροφοι (παλιά ΚΥΑ)', 'Παλιά έκδοση - συνήθως χρήση 1986.3', 45.34, 'RARE', 'FLOOR', 705),
(v_org_id, '1986.2', 'VERTICAL', 'Κόληση ΚΟΙ - 4ος και πάνω (παλιά ΚΥΑ)', NULL, 24.41, 'RARE', 'FLOOR', 706),
(v_org_id, '1986.3', 'VERTICAL', 'Κόληση ΚΟΙ - 3 πρώτοι όροφοι ΚΥΑ 2023', 'Κανονική περίπτωση. × N ορόφους (έως 3)', 57.20, 'ALWAYS', 'FLOOR', 707),
(v_org_id, '1986.4', 'VERTICAL', 'Κόληση ΚΟΙ - 4ος και πάνω ΚΥΑ 2023', 'Για ορόφους >3 (π.χ. 6όροφο = 3×1986.3 + 3×1986.4)', 36.27, 'CONDITIONAL', 'FLOOR', 708)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'FLOOR BOX 1-2-3' WHERE organization_id = v_org_id AND code = '1985.2';
UPDATE public.ote_articles SET user_annotation = 'ΚΟΛΗΣΗ ΚΑΙ ΡΙΞΙΜΟ ΙΝΑΣ' WHERE organization_id = v_org_id AND code = '1986.3';
UPDATE public.ote_articles SET user_annotation = '4 ΟΡΟΦΟΥΣ ΚΑΙ ΠΑΝΩ' WHERE organization_id = v_org_id AND code = '1986.4';

-- 8. ΣΥΝΔΕΣΗ ΠΕΛΑΤΗ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1988.1', 'CUSTOMER', 'Σύνδεση πελάτη από BEP - νέα κατακόρυφη', 'Χρειάζεται νέα κατακόρυφη από BEP στο διαμέρισμα', 125.55, 'CONDITIONAL', 801),
(v_org_id, '1988.2', 'CUSTOMER', 'Σύνδεση πελάτη από BEP - υφιστάμενη κατακόρυφη', 'Η κατακόρυφη υπάρχει ήδη', 76.73, 'CONDITIONAL', 802),
(v_org_id, '1955.1', 'CUSTOMER', 'Νέος πελάτης κατά κατασκευή - χωρίς ενεργοποίηση', 'Περνάς μόνο ίνα, χωρίς ONT/Router', 24.41, 'CONDITIONAL', 803),
(v_org_id, '1955.2', 'CUSTOMER', 'Νέος πελάτης κατά κατασκευή - με ενεργοποίηση', 'Ίνα + ONT/Router + ενεργοποίηση', 45.34, 'CONDITIONAL', 804),
(v_org_id, '1955.3', 'CUSTOMER', 'Νέος πελάτης μετά κατασκευή - χωρίς ενεργοποίηση', 'Δεύτερη επίσκεψη χωρίς ενεργοποίηση', 52.31, 'CONDITIONAL', 805),
(v_org_id, '1955.4', 'CUSTOMER', 'Νέος πελάτης μετά κατασκευή - με ενεργοποίηση', 'Δεύτερη επίσκεψη με ενεργοποίηση', 73.24, 'CONDITIONAL', 806),
(v_org_id, '1955.5', 'CUSTOMER', 'Αποκατάσταση σύνδεσης (repair)', 'Επιδιόρθωση οριζόντιας καλωδίωσης', 34.88, 'ON_DAMAGE', 807),
(v_org_id, '1955.6', 'CUSTOMER', 'Επιπρόσθετη για μεγάλες οδεύσεις', 'Για οδεύσεις >40m ή >10m πλαστικού σωλήνα', 31.39, 'CONDITIONAL', 808),
(v_org_id, '1989', 'CUSTOMER', 'Σύνδεση ενεργού εξοπλισμού (ONT+Router)', 'Μόνο εγκατάσταση/ενεργοποίηση χωρίς καλωδίωση', 20.93, 'CONDITIONAL', 809)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'ΜΟΝΟ ΙΝΑ' WHERE organization_id = v_org_id AND code = '1955.1';
UPDATE public.ote_articles SET user_annotation = 'ΜΕ ΕΝΕΡΓΟΠΟΙΗΣΗ' WHERE organization_id = v_org_id AND code = '1955.2';

-- 9. SPLITTER
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1977.1', 'SPLITTER', 'Εγκατάσταση splitter FTTH', 'Προσθήκη splitter στο δίκτυο', 13.95, 'CONDITIONAL', 901),
(v_org_id, '1977.2', 'SPLITTER', 'Τροποποίηση διασυνδέσεων splitter', 'Αλλαγή patch cables', 6.98, 'RARE', 902),
(v_org_id, '1977.3', 'SPLITTER', 'Splitter σε BCP/BEP (ξεχωριστή εντολή)', 'Μετά από την αρχική εγκατάσταση', 27.90, 'RARE', 903),
(v_org_id, '1977.4', 'SPLITTER', 'Ομαδοποιημένη splitter σε BCP/BEP', 'Πολλαπλά splitter στην ίδια καμπίνα', 20.93, 'RARE', 904)
ON CONFLICT (organization_id, code) DO NOTHING;

-- 10. ΕΝΑΕΡΙΑ & ΕΙΔΙΚΑ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1993.1.1', 'AERIAL_SPECIAL', 'Υπόγεια/επίγεια BCP→BEP έως 5m', 'Όταν υπάρχει BCP πριν το BEP', 83.70, 'CONDITIONAL', 1001),
(v_org_id, '1993.1.2', 'AERIAL_SPECIAL', 'Υπόγεια/επίγεια BCP→BEP έως 15m', NULL, 139.50, 'CONDITIONAL', 1002),
(v_org_id, '1993.1.3', 'AERIAL_SPECIAL', 'Υπόγεια/επίγεια BCP→BEP έως 30m', NULL, 188.33, 'CONDITIONAL', 1003),
(v_org_id, '1993.1.4', 'AERIAL_SPECIAL', 'Υπόγεια/επίγεια BCP→BEP έως 60m', NULL, 237.15, 'CONDITIONAL', 1004),
(v_org_id, '1993.1.5', 'AERIAL_SPECIAL', 'BCP→BEP έως 5m με νέα ΚΥΑ', NULL, 90.68, 'CONDITIONAL', 1005),
(v_org_id, '1993.1.6', 'AERIAL_SPECIAL', 'BCP→BEP έως 15m με νέα ΚΥΑ', NULL, 153.45, 'CONDITIONAL', 1006),
(v_org_id, '1993.1.7', 'AERIAL_SPECIAL', 'BCP→BEP έως 30m με νέα ΚΥΑ', NULL, 209.25, 'CONDITIONAL', 1007),
(v_org_id, '1993.1.8', 'AERIAL_SPECIAL', 'BCP→BEP έως 60m με νέα ΚΥΑ', NULL, 265.05, 'CONDITIONAL', 1008),
(v_org_id, '1993.2', 'AERIAL_SPECIAL', 'Εναέρια καλωδίωση 16-50m', 'Από στύλο ΟΤΕ προς κτίριο εναέρια', 104.63, 'CONDITIONAL', 1009),
(v_org_id, '1993.3', 'AERIAL_SPECIAL', 'Εναέρια καλωδίωση έως 16m', NULL, 69.75, 'CONDITIONAL', 1010),
(v_org_id, '1994Α', 'AERIAL_SPECIAL', 'ADSS αυτοστήρικτο εναέριο καλώδιο', 'Μαζί με 1993.2/1993.3 για το εναέριο τμήμα', 31.39, 'CONDITIONAL', 1011),
(v_org_id, '1996', 'AERIAL_SPECIAL', 'Αυτοστήρικτα εναέρια καλώδια ανά span', 'Ανά διάστημα μεταξύ 2 στύλων', 0.00, 'RARE', 1012),
(v_org_id, '1966', 'AERIAL_SPECIAL', 'Εμπορικό Κέντρο - επιπρόσθετο ανά FB', 'Κτίρια με >20 καταστήματα, ανά FB', 76.73, 'RARE', 1013),
(v_org_id, '1959.1', 'AERIAL_SPECIAL', 'Τερματικός εξοπλισμός G.hn - εντός κτιρίου', 'Υβριδική λύση G.hn αντί pure FTTH', 55.80, 'RARE', 1014),
(v_org_id, '1959.2', 'AERIAL_SPECIAL', 'Τερματικός εξοπλισμός G.hn - εκτός κτιρίου', NULL, 69.75, 'RARE', 1015)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'BEP ΜΟΝΟ ΓΙΑ BCP' WHERE organization_id = v_org_id AND code = '1993.1.1';
UPDATE public.ote_articles SET user_annotation = 'ΕΝΑΕΡΙΑ' WHERE organization_id = v_org_id AND code = '1993.2';

-- 11. SMART READINESS
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, sort_order) VALUES
(v_org_id, '1968.1', 'SMART_READINESS', 'Smart Readiness - με υπογραφή', 'Απαιτεί εκκαθάριση κουπονιού CTS', 62.78, 'RARE', 1101),
(v_org_id, '1969Β', 'SMART_READINESS', 'Smart Points - μετρητές ρεύματος', NULL, 29.99, 'RARE', 1102),
(v_org_id, '1969Γ', 'SMART_READINESS', 'Smart Points - μετρητές φυσικού αερίου', NULL, 29.99, 'RARE', 1103),
(v_org_id, '1969Δ', 'SMART_READINESS', 'Smart Points - λεβητοστάσιο θέρμανσης', NULL, 29.99, 'RARE', 1104),
(v_org_id, '1969Ε', 'SMART_READINESS', 'Smart Points - μηχανοστάσιο ανελκυστήρα', NULL, 29.99, 'RARE', 1105)
ON CONFLICT (organization_id, code) DO NOTHING;

UPDATE public.ote_articles SET user_annotation = 'ΑΥΤΟΨΙΑ SMART READINESS' WHERE organization_id = v_org_id AND code = '1968.2';

-- 12. ΒΛΑΒΕΣ & ΕΡΓΑΣΙΕΣ ΣΕ ΥΨΟΣ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, unit, sort_order) VALUES
(v_org_id, '1971.1', 'REPAIR_HEIGHT', 'Αντικατάσταση BEP/BCP/FB έως 12 συνδέσεις', 'Σε βλάβη', 31.39, 'ON_DAMAGE', 'SR', 1201),
(v_org_id, '1971.2', 'REPAIR_HEIGHT', 'Αντικατάσταση BEP/BCP/FB έως 32 συνδέσεις', 'Σε βλάβη', 45.34, 'ON_DAMAGE', 'SR', 1202),
(v_org_id, '1973.1', 'REPAIR_HEIGHT', 'Εργασίες σε ύψος (εναερίτης)', 'ΜΟΝΟ με έγκριση ΟΤΕ εκ των προτέρων', 132.53, 'ON_APPROVAL', 'SR', 1203),
(v_org_id, '1973.2', 'REPAIR_HEIGHT', 'Εργασίες σε ύψος με καλαθοφόρο', 'ΜΟΝΟ με έγκριση ΟΤΕ', 195.30, 'ON_APPROVAL', 'SR', 1204),
(v_org_id, '1973.3', 'REPAIR_HEIGHT', 'Εργασίες σε ύψος με ικρίωμα', 'ΜΟΝΟ με έγκριση ΟΤΕ', 265.05, 'ON_APPROVAL', 'SR', 1205),
(v_org_id, '1995.1', 'REPAIR_HEIGHT', 'Άρση βλάβης πολυσωληνίου έως 4 σωληνίσκους', 'Μόνο σε βλάβη', 55.80, 'ON_DAMAGE', 'SR', 1206),
(v_org_id, '1995.2', 'REPAIR_HEIGHT', 'Άρση βλάβης πολυσωληνίου άνω 4 σωληνίσκων', 'Μόνο σε βλάβη', 76.73, 'ON_DAMAGE', 'SR', 1207),
(v_org_id, '1998.1', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 60 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 279.00, 'ON_DAMAGE', 'FIBER', 1208),
(v_org_id, '1998.2', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 48 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 223.20, 'ON_DAMAGE', 'FIBER', 1209),
(v_org_id, '1998.3', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 36 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 167.40, 'ON_DAMAGE', 'FIBER', 1210),
(v_org_id, '1998.4', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 24 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 111.60, 'ON_DAMAGE', 'FIBER', 1211),
(v_org_id, '1998.5', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 12 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 62.78, 'ON_DAMAGE', 'FIBER', 1212),
(v_org_id, '1998.6', 'REPAIR_HEIGHT', 'Συγκόλληση BCP έως 8 ίνες', 'ΜΟΝΟ σε βλάβη BCP', 41.85, 'ON_DAMAGE', 'FIBER', 1213),
(v_org_id, '1999.1', 'REPAIR_HEIGHT', 'Αποξήλωση οπτικού καλωδίου έως 15m', NULL, 3.49, 'RARE', 'METER', 1214),
(v_org_id, '1999.2', 'REPAIR_HEIGHT', 'Αποξήλωση οπτικού καλωδίου >15m', NULL, 6.98, 'RARE', 'METER', 1215),
(v_org_id, '1999.3', 'REPAIR_HEIGHT', 'Αποξήλωση εναέριου ΚΟΙ ανά span', NULL, 6.98, 'RARE', 'SR', 1216)
ON CONFLICT (organization_id, code) DO NOTHING;

-- ❌ ΕΞΑΙΡΟΥΜΕΝΑ
INSERT INTO public.ote_articles (organization_id, code, category, title, when_to_use, price_eur, frequency, is_excluded, is_active, sort_order) VALUES
(v_org_id, '1967.1', 'EXCLUDED', 'Last Drop Mobilization Ηπειρωτικές', 'ΕΞΑΙΡΕΙΤΑΙ - δεν χρεώνεται', 15.35, 'NEVER', true, false, 9001),
(v_org_id, '1967.2', 'EXCLUDED', 'Last Drop Mobilization Νησιωτικές ζώνη Α', 'ΕΞΑΙΡΕΙΤΑΙ', 18.83, 'NEVER', true, false, 9002),
(v_org_id, '1967.3', 'EXCLUDED', 'Last Drop Mobilization Νησιωτικές ζώνη Β', 'ΕΞΑΙΡΕΙΤΑΙ', 22.32, 'NEVER', true, false, 9003),
(v_org_id, '1953Γ.1', 'EXCLUDED', 'Mobilization Νησιωτικές έως 3 χώρους', 'ΕΞΑΙΡΕΙΤΑΙ', 125.55, 'NEVER', true, false, 9004),
(v_org_id, '1953Γ.2', 'EXCLUDED', 'Mobilization Νησιωτικές άνω 3 χώρων', 'ΕΞΑΙΡΕΙΤΑΙ', 139.50, 'NEVER', true, false, 9005),
(v_org_id, '1953Γ.3', 'EXCLUDED', 'Mobilization Ηπειρωτικές έως 3 χώρους', 'ΕΞΑΙΡΕΙΤΑΙ', 97.65, 'NEVER', true, false, 9006),
(v_org_id, '1953Γ.4', 'EXCLUDED', 'Mobilization Ηπειρωτικές άνω 3 χώρων', 'ΕΞΑΙΡΕΙΤΑΙ', 111.60, 'NEVER', true, false, 9007),
(v_org_id, '1964.1', 'EXCLUDED', 'Α Φάση - επιπρόσθετο για >4 κτίρια', 'Όχι Γ Φάση', 52.31, 'NEVER', true, false, 9008),
(v_org_id, '1964.2', 'EXCLUDED', 'Α Φάση - μετάβαση συνεργείου', 'Όχι Γ Φάση', 1046.25, 'NEVER', true, false, 9009),
(v_org_id, '1978', 'EXCLUDED', 'Πρόσθετη αποζημίωση μετάβασης UFBB', 'Εξαιρείται', 0.00, 'NEVER', true, false, 9010)
ON CONFLICT (organization_id, code) DO NOTHING;

END LOOP;
END $seed$;