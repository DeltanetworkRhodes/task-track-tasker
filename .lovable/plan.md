

## Βήμα 1: Tap SR → Modal με Αυτοψία

Αυτό είναι το πρώτο βήμα της ροής. Ο τεχνικός πατάει πάνω σε ένα SR από τη λίστα αναθέσεων και ανοίγει ένα modal/dialog με τις διαθέσιμες ενέργειες και τη φόρμα αυτοψίας.

### Τι αλλάζει

1. **TechnicianAssignments.tsx** - Κάθε κάρτα SR γίνεται clickable. Ανοίγει ένα Dialog με:
   - Στοιχεία SR (πελάτης, διεύθυνση, περιοχή, CAB, σχόλια)
   - Κατάσταση (status badge)
   - Κουμπί "Έναρξη Αυτοψίας" (αν status = pending ή inspection)
   - Αν status = "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ": εμφάνιση ελλείψεων εγγράφων με upload
   - Αν status = pre_committed: κουμπί "Φόρμα Κατασκευής" (disabled - θα γίνει στο βήμα 2)

2. **SurveyForm.tsx** - Τροποποίηση ώστε να δέχεται pre-filled SR ID και area από το modal (αντί να τα πληκτρολογεί ο τεχνικός). Props: `prefillSrId`, `prefillArea`, `onComplete` callback.

3. **TechnicianDashboard.tsx** - Αφαίρεση του ξεχωριστού tab "Αυτοψία", αφού η αυτοψία γίνεται πλέον μέσα από το SR modal. Τα tabs γίνονται 2: Αναθέσεις + Χάρτης.

### Ροή χρήστη

```text
Λίστα Αναθέσεων
  ├─ Tap SR card
  └─ [Dialog ανοίγει]
       ├─ Στοιχεία SR (read-only)
       ├─ Status: pending/inspection
       │    └─ Κουμπί "Έναρξη Αυτοψίας" → εμφανίζει SurveyForm (pre-filled)
       ├─ Status: ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ
       │    └─ Λίστα ελλείψεων + upload (IncompleteSurveys logic)
       ├─ Status: pre_committed
       │    └─ "Φόρμα Κατασκευής" (βήμα 2)
       └─ Status: completed
            └─ "Ολοκληρωμένο" badge
```

### Τεχνικές λεπτομέρειες

- Το Dialog θα είναι full-screen στο mobile (Sheet/Drawer pattern) για καλύτερη εμπειρία
- Το SurveyForm θα αλλάξει assignment status αυτόματα σε "inspection" όταν ξεκινήσει η αυτοψία, και μετά σε "pre_committed" ή "pending" (ελλιπής) ανάλογα με τα αρχεία
- Query για surveys linked στο συγκεκριμένο SR μέσα στο modal, ώστε να ξέρουμε αν υπάρχει ήδη αυτοψία
- Δεν χρειάζονται database changes σε αυτό το βήμα

### Δεν περιλαμβάνεται (βήματα 2-3)
- Φόρμα κατασκευής με εργασίες/υλικά
- Αφαίρεση υλικών από αποθήκη
- Αυτόματη δημιουργία φακέλου Drive κατασκευής

