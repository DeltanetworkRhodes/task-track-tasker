-- Add missing columns to ote_articles
ALTER TABLE public.ote_articles
  ADD COLUMN IF NOT EXISTS short_label text,
  ADD COLUMN IF NOT EXISTS full_title text,
  ADD COLUMN IF NOT EXISTS is_default_suggestion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_quantity boolean NOT NULL DEFAULT false;

-- Backfill: copy title to full_title and short_label
UPDATE public.ote_articles
SET 
  full_title = COALESCE(full_title, title),
  short_label = COALESCE(short_label, title)
WHERE full_title IS NULL OR short_label IS NULL;

-- Mark "ALWAYS" frequency articles as default suggestions
UPDATE public.ote_articles
SET is_default_suggestion = true
WHERE frequency = 'ALWAYS';

-- Mark floor/fiber/meter-based articles as requiring quantity
UPDATE public.ote_articles
SET requires_quantity = true
WHERE unit IN ('FLOOR', 'FIBER', 'METER');

-- Friendlier Greek short labels
-- ΑΥΤΟΨΙΑ
UPDATE public.ote_articles SET short_label = 'Μεσαίο/Μεγάλο κτίριο' WHERE code = '1956.1';
UPDATE public.ote_articles SET short_label = 'Μικρό κτίριο' WHERE code = '1956.2';
UPDATE public.ote_articles SET short_label = 'Σε κτίριο άλλου παρόχου' WHERE code = '1951';
UPDATE public.ote_articles SET short_label = 'Smart Readiness' WHERE code = '1968.2';

-- BCP ΣΚΑΨΙΜΟ
UPDATE public.ote_articles SET short_label = 'Έως 2m · διαμορφωμένη' WHERE code = '1915.1.1';
UPDATE public.ote_articles SET short_label = 'Έως 2m · αδιαμόρφωτη' WHERE code = '1915.1.2';
UPDATE public.ote_articles SET short_label = '2-15m · διαμορφωμένη' WHERE code = '1915.2.1';
UPDATE public.ote_articles SET short_label = '2-15m · αδιαμόρφωτη' WHERE code = '1915.2.2';
UPDATE public.ote_articles SET short_label = '15-30m · διαμορφωμένη' WHERE code = '1915.4.1';
UPDATE public.ote_articles SET short_label = '15-30m · αδιαμόρφωτη' WHERE code = '1915.4.2';
UPDATE public.ote_articles SET short_label = 'BCP σε Δ.Χ. έως 3m' WHERE code = '1991.1.1';
UPDATE public.ote_articles SET short_label = 'BCP σε Δ.Χ. 3-10m' WHERE code = '1991.1.2';
UPDATE public.ote_articles SET short_label = 'BCP σε Δ.Χ. 10-15m' WHERE code = '1991.1.3';
UPDATE public.ote_articles SET short_label = 'BCP σε Ι.Χ. έως 5m' WHERE code = '1991.2.1';
UPDATE public.ote_articles SET short_label = 'BCP σε Ι.Χ. έως 15m' WHERE code = '1991.2.2';
UPDATE public.ote_articles SET short_label = 'BCP σε Ι.Χ. έως 30m' WHERE code = '1991.2.3';

-- BCP→BEP
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 5m' WHERE code = '1993.1.1';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 15m' WHERE code = '1993.1.2';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 30m' WHERE code = '1993.1.3';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 60m' WHERE code = '1993.1.4';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 5m · ΚΥΑ' WHERE code = '1993.1.5';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 15m · ΚΥΑ' WHERE code = '1993.1.6';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 30m · ΚΥΑ' WHERE code = '1993.1.7';
UPDATE public.ote_articles SET short_label = 'Υπόγεια έως 60m · ΚΥΑ' WHERE code = '1993.1.8';
UPDATE public.ote_articles SET short_label = 'Εναέρια 16-50m' WHERE code = '1993.2';
UPDATE public.ote_articles SET short_label = 'Εναέρια έως 16m' WHERE code = '1993.3';
UPDATE public.ote_articles SET short_label = '+ ADSS αυτοστήρικτο' WHERE code = '1994Α';

-- BEP – Εσκαλίτ
UPDATE public.ote_articles SET short_label = 'Εσκαλίτ έως 5m' WHERE code = '1963.1';
UPDATE public.ote_articles SET short_label = 'Εσκαλίτ έως 15m' WHERE code = '1963.2';

-- BEP – Σκάψιμο
UPDATE public.ote_articles SET short_label = 'Νέα σωλήνωση έως 5m' WHERE code = '1965.1';
UPDATE public.ote_articles SET short_label = 'Νέα σωλήνωση έως 15m' WHERE code = '1965.2';
UPDATE public.ote_articles SET short_label = 'Νέα σωλήνωση έως 30m' WHERE code = '1965.3';
UPDATE public.ote_articles SET short_label = 'Νέα σωλήνωση έως 60m' WHERE code = '1965.4';
UPDATE public.ote_articles SET short_label = 'Νέα έως 5m · ΚΥΑ' WHERE code = '1965.5';
UPDATE public.ote_articles SET short_label = 'Νέα έως 15m · ΚΥΑ' WHERE code = '1965.6';
UPDATE public.ote_articles SET short_label = 'Νέα έως 30m · ΚΥΑ' WHERE code = '1965.7';
UPDATE public.ote_articles SET short_label = 'Νέα έως 60m · ΚΥΑ' WHERE code = '1965.8';

-- BEP Τοποθέτηση
UPDATE public.ote_articles SET short_label = 'BEP έως 10m' WHERE code = '1970.1';
UPDATE public.ote_articles SET short_label = 'BEP έως 25m' WHERE code = '1970.2';
UPDATE public.ote_articles SET short_label = 'BEP έως 40m (δώμα)' WHERE code = '1970.3';
UPDATE public.ote_articles SET short_label = 'BEP μικρό · ΚΥΑ' WHERE code = '1970.4';
UPDATE public.ote_articles SET short_label = 'BEP μεσαίο/μεγάλο · ΚΥΑ' WHERE code = '1970.5';

-- FB Ίδιο επίπεδο
UPDATE public.ote_articles SET short_label = 'Οριζόντια έως 5m' WHERE code = '1984.i';
UPDATE public.ote_articles SET short_label = 'Οριζόντια >5m' WHERE code = '1984.ii';

-- Κατακόρυφη υποδομή
UPDATE public.ote_articles SET short_label = 'Κατακόρυφη · μικροϋλικά' WHERE code = '1985.1';
UPDATE public.ote_articles SET short_label = 'Κατακόρυφη · με υλικά' WHERE code = '1985.2';
UPDATE public.ote_articles SET short_label = 'Φρεάτιο ανελκυστήρα έως 5όροφο' WHERE code = '1985.3';
UPDATE public.ote_articles SET short_label = 'Φρεάτιο · επιπλέον όροφος' WHERE code = '1985.4';

-- Κόληση ίνας
UPDATE public.ote_articles SET short_label = 'Κόληση 3 πρώτοι (παλιά)' WHERE code = '1986.1';
UPDATE public.ote_articles SET short_label = 'Κόληση 4ος+ (παλιά)' WHERE code = '1986.2';
UPDATE public.ote_articles SET short_label = 'Κόληση 3 πρώτοι · ΚΥΑ' WHERE code = '1986.3';
UPDATE public.ote_articles SET short_label = 'Κόληση 4ος+ · ΚΥΑ' WHERE code = '1986.4';

-- ΚΟΙ Καμπίνα→BEP
UPDATE public.ote_articles SET short_label = 'Εμφύσηση ελεύθερη' WHERE code = '1980.1';
UPDATE public.ote_articles SET short_label = 'Κατειλημμένη (βλάβη)' WHERE code = '1980.2';

-- Πελάτης
UPDATE public.ote_articles SET short_label = 'Από BEP · νέα κατακόρυφη' WHERE code = '1988.1';
UPDATE public.ote_articles SET short_label = 'Από BEP · υφιστάμενη' WHERE code = '1988.2';
UPDATE public.ote_articles SET short_label = 'Κατά κατασκευή · χωρίς ενεργοποίηση' WHERE code = '1955.1';
UPDATE public.ote_articles SET short_label = 'Κατά κατασκευή · με ενεργοποίηση' WHERE code = '1955.2';
UPDATE public.ote_articles SET short_label = 'Μετά κατασκευή · χωρίς ενεργοποίηση' WHERE code = '1955.3';
UPDATE public.ote_articles SET short_label = 'Μετά κατασκευή · με ενεργοποίηση' WHERE code = '1955.4';
UPDATE public.ote_articles SET short_label = 'Αποκατάσταση (βλάβη)' WHERE code = '1955.5';
UPDATE public.ote_articles SET short_label = 'Μεγάλες οδεύσεις' WHERE code = '1955.6';
UPDATE public.ote_articles SET short_label = 'Μόνο ONT+Router' WHERE code = '1989';

-- Splitter
UPDATE public.ote_articles SET short_label = 'Εγκατάσταση splitter' WHERE code = '1977.1';
UPDATE public.ote_articles SET short_label = 'Τροποποίηση splitter' WHERE code = '1977.2';
UPDATE public.ote_articles SET short_label = 'Splitter ξεχωριστά' WHERE code = '1977.3';
UPDATE public.ote_articles SET short_label = 'Ομαδοποιημένη splitter' WHERE code = '1977.4';

-- Διασύνδεση Φρεατίου
UPDATE public.ote_articles SET short_label = 'Τοποθέτηση BCP κουτί' WHERE code = '1997';

-- Default suggestions for key articles
UPDATE public.ote_articles SET is_default_suggestion = true WHERE code IN (
  '1956.1', '1970.5', '1980.1', '1984.i', '1985.2', '1986.3', '1963.1', '1968.2'
);

-- User annotations
UPDATE public.ote_articles SET user_annotation = 'ΕΜΦΥΣΗΣΗ' WHERE code = '1980.1';
UPDATE public.ote_articles SET user_annotation = 'ΒΛΑΒΗ' WHERE code = '1980.2';
UPDATE public.ote_articles SET user_annotation = 'FLOOR BOX 0' WHERE code = '1984.i';
UPDATE public.ote_articles SET user_annotation = 'FLOOR BOX 1-2-3' WHERE code = '1985.2';
UPDATE public.ote_articles SET user_annotation = 'ΚΟΛΗΣΗ ΚΑΙ ΡΙΞΙΜΟ ΙΝΑΣ' WHERE code = '1986.3';
UPDATE public.ote_articles SET user_annotation = '4 ΟΡΟΦΟΥΣ ΚΑΙ ΠΑΝΩ' WHERE code = '1986.4';
UPDATE public.ote_articles SET user_annotation = 'BCP ΔΙΑΚΛΑΔΩΤΗΣ ΣΚΑΜΑ' WHERE code = '1991.1.1';
UPDATE public.ote_articles SET user_annotation = 'ΙΔΙΩΤΙΚΟ ΧΩΡΟ' WHERE code = '1991.2.1';
UPDATE public.ote_articles SET user_annotation = 'ΜΟΝΟ ΙΝΑ' WHERE code = '1955.1';
UPDATE public.ote_articles SET user_annotation = 'ΜΕ ΕΝΕΡΓΟΠΟΙΗΣΗ' WHERE code = '1955.2';
UPDATE public.ote_articles SET user_annotation = 'ΕΝΑΕΡΙΑ' WHERE code = '1993.2';
UPDATE public.ote_articles SET user_annotation = 'ΒΜ0' WHERE code = '1970.4';
UPDATE public.ote_articles SET user_annotation = 'ΤΡΕΧΩΝ ΜΕΤΡΟ' WHERE code = '1965.5';
UPDATE public.ote_articles SET user_annotation = 'ΑΥΤΟΨΙΑ SMART READINESS' WHERE code = '1968.2';