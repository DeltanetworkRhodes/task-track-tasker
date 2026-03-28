

## Plan: Sync Existing Pre-Committed Assignments to Surveys

### Problem Found
- The trigger `trg_auto_create_survey_on_pre_committed` only fires on `UPDATE`, not `INSERT`
- There are already ~8+ assignments in `pre_committed` status **without** matching survey records (they were set before the trigger existed, or were bulk-imported)
- These assignments are invisible in the Surveys tab

### Solution (Single Pass, No Duplicates)

**1. Database Migration**
- **Backfill**: Insert survey records for all existing `pre_committed` assignments that don't already have a matching survey (using `NOT EXISTS` to avoid duplicates)
- **Extend trigger**: Drop and recreate the trigger to fire on both `INSERT OR UPDATE` so bulk imports also create survey records automatically

```sql
-- Backfill existing pre_committed assignments
INSERT INTO public.surveys (sr_id, area, technician_id, organization_id, status, comments)
SELECT a.sr_id, a.area, a.technician_id, a.organization_id, 'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ', ''
FROM public.assignments a
WHERE a.status = 'pre_committed'
  AND a.technician_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.surveys s WHERE s.sr_id = a.sr_id
  );

-- Recreate trigger to also fire on INSERT
DROP TRIGGER IF EXISTS trg_auto_create_survey_on_pre_committed ON public.assignments;
CREATE TRIGGER trg_auto_create_survey_on_pre_committed
AFTER INSERT OR UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_survey_on_pre_committed();
```

- The trigger function already handles the `OLD.status IS DISTINCT FROM 'pre_committed'` check, which works correctly for INSERT (where OLD is NULL)

**2. Remove Frontend Fallback Code**
- Remove the duplicate survey-creation logic from `AssignmentTable.tsx` (lines 510-532) since the trigger now handles all cases reliably
- Remove similar fallback from `TechnicianAssignments.tsx` if present
- This eliminates the "double pass" the user mentioned

### Result
- All existing pre_committed assignments will immediately appear in Surveys
- Future status changes (manual, bulk import, or any path) will auto-create survey records via the DB trigger
- No duplicate survey records possible (NOT EXISTS check in trigger)
- No redundant client-side survey creation code

