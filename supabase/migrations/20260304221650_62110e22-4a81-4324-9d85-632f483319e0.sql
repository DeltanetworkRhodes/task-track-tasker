ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS google_sheet_row_id integer;
ALTER TABLE public.constructions ADD COLUMN IF NOT EXISTS google_sheet_row_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_sheet_row ON public.assignments(google_sheet_row_id) WHERE google_sheet_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_constructions_sheet_row ON public.constructions(google_sheet_row_id) WHERE google_sheet_row_id IS NOT NULL;