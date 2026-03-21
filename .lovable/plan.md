

# Revised Plan: Database Expansion + Smart Import

## New Columns to Add (10 only)

| Column | Type | Source |
|--------|------|--------|
| `work_type` | text | IFS-FSM (Τύπος εργασίας) |
| `request_category` | text | IFS-FSM (Κατηγορία Αιτήματος) |
| `floor` | text | Both (Όροφος) |
| `municipality` | text | Both (Δήμος) |
| `customer_mobile` | text | CRM Raw (Κινητό Πελάτη) |
| `customer_landline` | text | CRM Raw (Σταθερό Πελάτη) |
| `customer_email` | text | CRM Raw (E-mail Πελάτη) |
| `manager_name` | text | CRM Raw (Ονοματεπώνυμο Διαχειριστή) |
| `manager_mobile` | text | CRM Raw (Κινητό Διαχειριστή) |
| `manager_email` | text | CRM Raw (E-mail Διαχειριστή) |

Note: `phone`, `customer_name`, `cab`, `building_id_hemd`, `address` already exist.

## Steps

### 1. Database Migration
Add the 10 new nullable text columns to `assignments`.

### 2. Update AssignmentsImport.tsx
- **Import tab (IFS-FSM)**: Map `work_type`, `request_category`, `floor`, `municipality` from the formatted Excel alongside existing fields (SR ID, area, address, coordinates).
- **Enrichment tab (CRM Raw)**: Map `customer_mobile`, `customer_landline`, `customer_email`, `manager_name`, `manager_mobile`, `manager_email` plus existing fields (`phone`, `customer_name`, `cab`, `building_id_hemd`).
- Add a grouped checkbox UI so users can toggle which field categories to import:
  - **Βασικά** (always on): SR ID, Περιοχή
  - **Διεύθυνση**: Οδός, Αριθμός, Όροφος, Δήμος
  - **Πελάτης**: Όνομα, Κινητό, Σταθερό, Email
  - **Διαχειριστής**: Όνομα, Κινητό, Email
  - **Τεχνικά**: Τύπος Εργασίας, Κατηγορία, CAB, Building ID

### 3. Update AssignmentTable / Detail Views
Show the new fields (manager info, customer contacts) in the assignment detail panel where relevant.

### Files to Modify
1. New migration — `ALTER TABLE assignments ADD COLUMN ...` (10 columns)
2. `src/components/AssignmentsImport.tsx` — expanded mapping + checkbox UI
3. `src/components/AssignmentTable.tsx` — display new fields in detail view

