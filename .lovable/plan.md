

# Σύνδεση με Google Drive API

## Κατάσταση

Δεν υπάρχει έτοιμος Google Drive connector στο Lovable. Θα χρειαστεί σύνδεση μέσω **Google Drive API** με Service Account, ώστε να διαβάζουμε αυτόματα τα Google Sheets (Form Responses) και αρχεία από το Drive σου.

## Τι χρειάζεται από εσένα

1. **Google Cloud Console** — Δημιουργία ενός Service Account:
   - Πήγαινε στο [Google Cloud Console](https://console.cloud.google.com/)
   - Ενεργοποίησε τα APIs: **Google Drive API** και **Google Sheets API**
   - Δημιούργησε ένα **Service Account** και κατέβασε το JSON key
   - Κάνε **Share** τα Google Sheets και τους φακέλους Drive σου με το email του Service Account (π.χ. `xxx@project.iam.gserviceaccount.com`)

2. **Credentials** — Θα σου ζητήσω να τα αποθηκεύσεις ως secrets:
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (το JSON key)
   - IDs των Google Sheets (Form Responses 4, Form Responses 8, ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ κλπ.)

## Τι θα φτιαχτεί

### 1. Edge Function: `google-drive-sync`
- Συνδέεται στο Google Drive/Sheets API μέσω Service Account
- Διαβάζει τα δεδομένα από τα Google Sheets (Form Responses 4 → assignments, Form Responses 8 → constructions/materials)
- Συγχρονίζει (upsert) τα δεδομένα στους πίνακες της βάσης
- Μπορεί να καλείται χειροκίνητα ή με cron

### 2. Edge Function: `google-drive-files`
- Λίστα αρχείων/φακέλων από το Drive
- Download φωτογραφιών και PDFs
- Αποθήκευση στο Cloud Storage (bucket `photos`)

### 3. Ενημέρωση σελίδων
- Οι σελίδες Assignments, Construction, Materials θα χρησιμοποιούν τα πραγματικά δεδομένα από τη βάση (αντί mock data)
- Κουμπί "Συγχρονισμός από Drive" στο dashboard
- Εμφάνιση links προς τους φακέλους Drive ανά SR ID

### 4. Database updates
- Προσθήκη πεδίου `google_sheet_row_id` στους πίνακες assignments/constructions για αντιστοίχιση εγγραφών
- Migration για τα νέα πεδία

## Σειρά υλοποίησης

1. Αποθήκευση Google Service Account key ως secret
2. Δημιουργία edge function για ανάγνωση Sheets
3. Δημιουργία edge function για αρχεία Drive
4. Ενημέρωση UI με sync κουμπί και πραγματικά δεδομένα
5. Αντικατάσταση mock data με live queries

## Σημείωση

Πριν προχωρήσω στην υλοποίηση, θα χρειαστώ:
- Το **Google Service Account JSON key**
- Τα **IDs** (ή URLs) των Google Sheets που χρησιμοποιείς (Form Responses 4, Form Responses 8, ΒΑΣΗ_ΤΙΜΟΛΟΓΗΣΗΣ, ΒΑΣΗ_ΥΛΙΚΩΝ)

