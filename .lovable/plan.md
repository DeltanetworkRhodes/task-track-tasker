

## Plan: Εμφάνιση αρχείων Google Drive στο modal Αυτοψιών + Αφαίρεση στήλης Drive

### Πρόβλημα
- Τα SR που δημιουργήθηκαν αυτόματα (trigger) δεν έχουν εγγραφές στον πίνακα `survey_files` — τα αρχεία τους υπάρχουν μόνο στο Google Drive
- Το modal δείχνει "Δεν βρέθηκαν αρχεία" παρόλο που ο φάκελος Drive υπάρχει
- Η στήλη "Drive" στον πίνακα πρέπει να αφαιρεθεί

### Αλλαγές στο `src/pages/Surveys.tsx`

**1. Αφαίρεση στήλης Drive από τον πίνακα**
- Αφαίρεση του `<th>Drive</th>` header (γραμμή 720)
- Αφαίρεση του `<td>` με το FolderOpen icon (γραμμές 754-762)
- Ανακατανομή των widths στις υπόλοιπες στήλες

**2. Fetch αρχείων από Google Drive όταν δεν υπάρχουν survey_files**
- Προσθήκη νέου `useQuery` που καλεί το edge function `google-drive-files` με action `sr_folder` όταν:
  - Υπάρχει `selectedSurvey`
  - Δεν υπάρχουν `surveyFiles` (ή είναι κενά)
  - Υπάρχει `drive_folder_url` στο αντίστοιχο assignment
- Αυτό θα επιστρέψει τη λίστα αρχείων και υποφακέλων από το Drive

**3. Εμφάνιση αρχείων Drive στο modal**
- Στο section αρχείων (γραμμές 1000-1026), αν δεν υπάρχουν `survey_files` αλλά υπάρχουν Drive files, εμφάνιση αυτών ομαδοποιημένα ανά υποφάκελο (π.χ. ΣΚΑΜΑ, BEP, ΟΔΕΥΣΗ)
- Thumbnails για εικόνες, icons για PDFs
- Links που ανοίγουν απευθείας στο Google Drive

### Technical Details

```text
Modal opens → selectedSurvey set
  ├─ Fetch survey_files (existing logic)
  ├─ If survey_files empty AND assignment has drive_folder_url:
  │   └─ Call google-drive-files edge function (action: 'sr_folder', sr_id)
  │       └─ Returns subfolders + files with thumbnails/webViewLinks
  └─ Render whichever source has files
```

- Το edge function `google-drive-files` ήδη υποστηρίζει action `sr_folder` που επιστρέφει φακέλους και αρχεία
- Τα Google Drive thumbnails είναι διαθέσιμα μέσω `thumbnailLink` στο API response
- Fallback: αν αποτύχει το Drive fetch, εμφάνιση μόνο του link "Φάκελος SR"

