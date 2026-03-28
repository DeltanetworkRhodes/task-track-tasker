

## Plan: Auto-create Survey Record on Pre-Committed Status

### Problem
When an assignment moves to `pre_committed` status, it only updates the `assignments` table. The Surveys page (`/surveys`) reads from the `surveys` table, so these assignments never appear there.

### Solution
Automatically create a `surveys` record whenever an assignment transitions to `pre_committed` status. This ensures the SR appears in the Surveys tab immediately.

### Changes

**1. Database: Create a trigger function**
- Create a PostgreSQL trigger on the `assignments` table that fires on UPDATE
- When `status` changes TO `pre_committed`, automatically INSERT a row into the `surveys` table with:
  - `sr_id`, `area`, `technician_id`, `organization_id` copied from the assignment
  - `status` = `'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ'`
  - `assignment_id` linking back to the source assignment
- Use `ON CONFLICT (sr_id)` to avoid duplicates if a survey already exists for that SR

**2. Update `src/components/TechnicianAssignments.tsx`**
- In the `handleStatusChange` function, after successfully updating assignment status to `pre_committed`, also upsert a survey record via the Supabase client as a fallback (in case the trigger hasn't fired yet or for immediate UI feedback)

**3. Update `src/components/IncompleteSurveys.tsx`**
- Same pattern: when this component sets an assignment to `pre_committed`, also ensure a survey record is created with status `'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ'`

### Technical Details
- The `surveys` table already has columns: `sr_id`, `area`, `technician_id`, `organization_id`, `status`, `comments`, `created_at`
- The trigger approach ensures no assignment can reach `pre_committed` without a matching survey record, regardless of how the status change happens (UI, bulk import, direct DB update)
- Survey status will be `'ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ'` which already has styling configured in the Surveys page

