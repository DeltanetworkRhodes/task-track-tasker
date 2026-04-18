-- Διαγραφή παλιών κατηγοριών εργασίας — κρατάμε μόνο τις 3 νέες "Φάση 1/2/3"
-- Πρώτα διαγράφουμε εξαρτώμενες εγγραφές (φωτογραφίες, αναθέσεις) που αναφέρονται σε παλιές κατηγορίες

DELETE FROM public.sr_crew_photos
WHERE crew_assignment_id IN (
  SELECT ca.id FROM public.sr_crew_assignments ca
  JOIN public.sr_work_categories c ON c.id = ca.category_id
  WHERE c.name NOT LIKE '%Φάση 1%'
    AND c.name NOT LIKE '%Φάση 2%'
    AND c.name NOT LIKE '%Φάση 3%'
);

DELETE FROM public.sr_crew_assignments
WHERE category_id IN (
  SELECT id FROM public.sr_work_categories
  WHERE name NOT LIKE '%Φάση 1%'
    AND name NOT LIKE '%Φάση 2%'
    AND name NOT LIKE '%Φάση 3%'
);

DELETE FROM public.sr_work_categories
WHERE name NOT LIKE '%Φάση 1%'
  AND name NOT LIKE '%Φάση 2%'
  AND name NOT LIKE '%Φάση 3%';