

## Plan: Κατέβασμα αρχείων από Google Drive για ZIP στην επανεπεξεργασία

### Πρόβλημα
Όταν κάνεις "Επανεπεξεργασία" σε survey που δημιουργήθηκε από trigger (χωρίς τοπικά αρχεία στο `survey_files`), η function δεν φτιάχνει ZIP γιατί το `downloadedFiles` είναι κενό. Αντί να κατεβάζει τα αρχεία από το Google Drive folder, στέλνει απλά link στο Drive.

### Λύση
Όταν δεν υπάρχουν τοπικά αρχεία (`hasLocalFiles === false`) αλλά υπάρχει Drive folder, η function θα:
1. Βρίσκει τον φάκελο SR στο Google Drive
2. Κατεβάζει όλα τα αρχεία (φωτογραφίες, PDFs) από τους υποφακέλους
3. Τα συμπιέζει σε ZIP
4. Ανεβάζει το ZIP στο Supabase Storage
5. Στέλνει email με signed download URL

### Αλλαγές

**Αρχείο: `supabase/functions/process-survey-completion/index.ts`**

1. Νέα helper function `downloadDriveFiles()`:
   - Δέχεται `accessToken` και `sr_id`
   - Ψάχνει τον SR folder στο Shared Drive (`name contains '{sr_id}'`)
   - Λίστα υποφακέλων (ΕΓΓΡΑΦΑ, ΠΡΟΜΕΛΕΤΗ κλπ)
   - Λίστα αρχείων σε κάθε υποφάκελο
   - Κατεβάζει κάθε αρχείο μέσω `https://www.googleapis.com/drive/v3/files/{id}?alt=media`
   - Επιστρέφει array `{ name, data, folderName }`

2. Στο main flow (μετά το block `else` στη γραμμή ~470), αν `!hasLocalFiles && accessToken && hasDriveFolder`:
   - Καλεί `downloadDriveFiles()`
   - Γεμίζει το `downloadedFiles` array με τα Drive αρχεία
   - Η υπόλοιπη λογική (ZIP build, upload, email) τρέχει κανονικά

3. Ίδια αλλαγή στο `resend-survey-email/index.ts`:
   - Αντί να δείχνει μόνο link στο Drive, κατεβάζει τα αρχεία, φτιάχνει ZIP, ανεβάζει στο Storage, στέλνει signed URL

### Technical Details

```text
Flow (trigger-created survey reprocessing):
  hasLocalFiles = false
  hasDriveFolder = true
  accessToken = valid
  │
  ├─ Search Drive: name contains '{sr_id}' (shared drive)
  ├─ List subfolders (ΕΓΓΡΑΦΑ, ΠΡΟΜΕΛΕΤΗ, etc.)
  ├─ List files in each subfolder
  ├─ Download each file via Drive API (alt=media)
  │   └─ Serial downloads (2 at a time) to manage memory
  ├─ Build ZIP with fflate (same as local files path)
  ├─ Upload ZIP to Supabase Storage
  ├─ Create signed URL (7 days)
  └─ Send email with ZIP download link
```

- Τα αρχεία κατεβαίνουν σειριακά (2 τη φορά) για αποφυγή memory limits
- Χρησιμοποιείται η ίδια δομή ZIP folders (SR name / subfolder / filename)
- Η function ήδη έχει τον `getAccessToken` και Drive search helpers

