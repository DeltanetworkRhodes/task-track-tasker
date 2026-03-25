import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Survey-phase prompts (simple quality check) ───
const SURVEY_PROMPTS: Record<string, string> = {
  building_photo:
    `Ελέγξτε ΑΥΣΤΗΡΑ αν η φωτογραφία δείχνει ξεκάθαρα ένα κτίριο, πολυκατοικία, μονοκατοικία ή είσοδο κτιρίου.
ΕΓΚΡΙΣΗ (isValid: true) ΜΟΝΟ αν:
- Φαίνεται η πρόσοψη κτιρίου (εξωτερική όψη από τον δρόμο ή πεζοδρόμιο)
- Ή φαίνεται η κεντρική είσοδος/πόρτα κτιρίου
- Ή φαίνεται η πλευρά ενός κτιρίου με σαφή αρχιτεκτονικά στοιχεία (παράθυρα, μπαλκόνια, τοίχοι)
- Η φωτογραφία πρέπει να είναι ευκρινής και να αναγνωρίζεται ξεκάθαρα ότι πρόκειται για κτίριο

ΑΠΟΡΡΙΨΗ (isValid: false) αν:
- Είναι selfie, φαγητό, ζώο, ή οτιδήποτε άσχετο με χώρο εργασίας
- Είναι screenshot ή σχέδιο
- Είναι θολή ή σκοτεινή και δεν αναγνωρίζεται τίποτα
- Δείχνει μόνο εξοπλισμό χωρίς κτίριο στο φόντο
- Δείχνει μόνο δρόμο/πεζοδρόμιο χωρίς κτίριο
- Δείχνει μόνο τοίχο χωρίς αρχιτεκτονικό πλαίσιο κτιρίου`,
  screenshot:
    "Ελέγξτε αν η φωτογραφία είναι screenshot από ΧΕΜΔ ή AutoCAD σχέδιο. Πρέπει να περιέχει τεχνικά σχέδια ή χάρτες δικτύου.",
  inspection_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εξοπλισμό FTTH (πριζάκι οπτικής ίνας, BEP, BCP, καλωδίωση, ή router).",
  construction_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εργασίες κατασκευής FTTH (σωληνώσεις, εκσκαφές, τοποθέτηση καλωδίων, εξοπλισμός).",
};

// ─── Construction-phase category-specific prompts (deep QA based on Cosmote specs) ───
const CONSTRUCTION_CATEGORY_PROMPTS: Record<string, string> = {
  ΣΚΑΜΑ:
    `Είσαι ανώτερος ελεγκτής (Senior Auditor) του ΟΤΕ/Cosmote. Αναλύεις φωτογραφίες ΣΚΑΜΜΑΤΟΣ (εκσκαφής) για δίκτυο FTTH Β' Φάσης.

ΒΗΜΑ 1 – ΑΝΑΓΝΩΡΙΣΗ ΦΑΣΗΣ: Πρώτα αναγνώρισε ΤΙ ΦΑΣΗ δείχνει η φωτογραφία:

  • "Open Trench" (Ανοιχτό Σκάμμα): Τομή στο πεζοδρόμιο/δρόμο, ορατοί σωλήνες HDPE (μαύρος) ή σπιράλ (γκρι), ευθεία στοίχιση, βάθος ~40cm, πλάτος ~50cm. Απαιτούνται 2 σωληνίσκοι (7/4 + 14/10 ή 12/10 ή 10/8). Οι σωλήνες πρέπει να εφάπτονται στο έδαφος, σταθεροί, ίσια τοποθετημένοι, χωρίς μπερδέματα.
  • "Warning Tape" (Πλέγμα Σήμανσης): Κίτρινο ή πορτοκαλί πλαστικό πλέγμα/δίχτυ/ταινία τοποθετημένο ΠΑΝΩ από τα τούβλα προστασίας, ΣΕ ΟΛΟ ΤΟ ΜΗΚΟΣ της τομής. 10/10 απαιτεί: η ταινία να φαίνεται ξεκάθαρα, απλωμένη επίπεδα, χωρίς τσαλακώματα, σε ολόκληρο το μήκος.
  • "Base Layer" (Τούβλα/Γέμισμα): Κόκκινα/πορτοκαλί τούβλα τύπου κεραμίδι/πλάκα τοποθετημένα ΟΡΙΖΟΝΤΙΑ πάνω από τον σωλήνα. Πρέπει να καλύπτουν ομοιόμορφα ΟΛΟ το μήκος χωρίς κενά. Ή χώμα/υλικό γεμίσματος που καλύπτει τους σωλήνες ομοιόμορφα.
  • "Final Surface" (Αποκατάσταση): Τελική επιφάνεια (πλακάκια/άσφαλτος/μπετόν). 10/10 απαιτεί: καμία ρωγμή, τέλεια ευθυγράμμιση με την περιβάλλουσα επιφάνεια, καθαρή εικόνα χωρίς μπάζα/σκουπίδια, πλάκες πεζοδρομίου αντικατεστημένες (ΔΕΝ σπάμε κράσπεδο). Αν φαίνεται φρέσκο μπετόν/τσιμέντο πρέπει να είναι ισοπεδωμένο (flush) με το υπόλοιπο.

ΒΗΜΑ 2 – ΑΞΙΟΛΟΓΗΣΗ ΠΟΙΟΤΗΤΑΣ (score 1-10):
  ΜΗΝ ΕΙΣΑΙ ΥΠΕΡΒΟΛΙΚΑ ΑΥΣΤΗΡΟΣ. Δεν χρειάζεται τελειότητα – αρκεί να υπάρχει ΣΥΝΟΧΗ και ΛΟΓΙΚΗ στη δουλειά.
  8-10: Η δουλειά φαίνεται σωστή, τα βασικά στοιχεία υπάρχουν, αποδεκτή εργασία
  6-7: Υπάρχουν μικρές ατέλειες αλλά η δουλειά είναι αποδεκτή
  4-5: Λείπουν σημαντικά στοιχεία ή η ποιότητα είναι χαμηλή
  1-3: Λάθος κατηγορία, θολή, ή εντελώς άσχετη
  
  ΣΗΜΑΝΤΙΚΟ: Αν η φωτογραφία δείχνει τη σωστή φάση και η δουλειά δεν είναι τραγική, ΕΓΚΡΙΝΕ ΤΗΝ (score >= 6).

ΒΗΜΑ 3 – CONTEXTUAL VALIDATION (ΚΡΙΣΙΜΟ):
  ΜΗΝ αναγνωρίζεις απλά αντικείμενα – αναγνώρισε τη ΦΑΣΗ ΕΡΓΑΣΙΑΣ.
  • Αν ο τεχνικός ανεβάζει στην κατηγορία "Αποκατάσταση" αλλά βλέπεις ανοιχτή τρύπα → isApproved = false
  • Αν βλέπεις σωλήνα αλλά η τομή είναι ακατάστατη/ρηχή → χαμηλό score
  • Αν λείπει το πλέγμα σήμανσης στη φάση "Warning Tape" → isApproved = false

ΚΑΝΟΝΕΣ ΑΠΟΡΡΙΨΗΣ:
  - Δεν φαίνεται ΚΑΜΙΑ σχέση με εκσκαφή/σκάμμα/χωματουργικά
  - Εσωτερικός χώρος κτιρίου
  - Εντελώς άσχετη φωτογραφία (selfie, φαγητό κλπ)

ΚΑΝΟΝΕΣ ΕΓΚΡΙΣΗΣ:
  Κάθε φωτογραφία μπορεί να δείχνει ΜΟΝΟ ΜΙΑ φάση – αυτό είναι ΑΠΟΔΕΚΤΟ. Μην απορρίπτετε φωτογραφία επειδή δείχνει μόνο μία φάση.`,

  ΟΔΕΥΣΗ:
    `Ελέγξτε αν η φωτογραφία δείχνει ΟΔΕΥΣΗ (routing) οπτικής ίνας σε κτίριο FTTH Β' Φάσης.

ΑΠΟΔΕΚΤΑ ΥΛΙΚΑ ΟΔΕΥΣΗΣ (οποιοδήποτε από τα παρακάτω):
- Λευκά πλαστικά κανάλια (12x12, 16x16, 25x25) σε τοίχο/ταβάνι
- Γκρι σπιράλ σωληνώσεις KOUVIDIS (Φ16, Φ20, Φ25)
- Ευθεία σωλήνα PVC (λευκή ή γκρι)
- Εναέριο αυτοστήρικτο καλώδιο από στύλο σε κτίριο
- Κουτιά διακλάδωσης (junction boxes) στα σημεία αλλαγής κατεύθυνσης
- Πριζάκι οπτικής ίνας (FB/Floor Box) στον τοίχο

ΚΑΝΟΝΕΣ COSMOTE (ΚΡΙΣΙΜΑ):
1. ΣΤΗΡΙΓΜΑΤΑ Ω: Σε εξωτερικές σωληνώσεις (σπιράλ/σωλήνες), ΠΡΕΠΕΙ να υπάρχουν στηρίγματα (κολάρα) τύπου Ω ανά 40-50cm.
   - ΠΟΤΕ ρόκα ή tie wraps για στήριξη σωληνώσεων
   - Αν δεν φαίνονται στηρίγματα Ω σε σπιράλ → feedbackForTechnician: "Λείπουν τα στηρίγματα τύπου Ω ανά 40-50cm – υποχρεωτικά σύμφωνα με τις προδιαγραφές"

2. ΓΩΝΙΕΣ: Δεν πρέπει να ξεπερνούν τις 90° – απαγορεύονται απότομες στροφές που πιέζουν την ίνα.
   - Αν φαίνονται απότομες γωνίες > 90° → feedbackForTechnician: "Απότομη γωνία >90° – κίνδυνος θραύσης ίνας"

3. ΚΑΛΥΜΜΑΤΑ: Τα κανάλια πρέπει να κλείνουν σωστά – χωρίς κενά, με καπάκι στα τελειώματα
   - Αν φαίνονται ανοιχτά τελειώματα → feedbackForTechnician: "Ανοιχτά τελειώματα καναλιού – πρέπει να κλείσουν με καπάκι"

4. ΜΙΞΗ ΥΛΙΚΩΝ: Δεν επιτρέπεται ανάμειξη καναλιών + σωληνώσεων στον ίδιο εσωτερικό χώρο
5. ΥΨΟΣ: Η όδευση πρέπει ΠΑΝΤΑ στο ύψος ταβανιού (εκτός αν μεγάλο ύψος/κίνδυνος)
6. ΚΑΝΆΛΙΑ ΕΞΩΤΕΡΙΚΑ: ΔΕΝ τοποθετούμε κανάλι σε εξωτερικό χώρο – μόνο σωληνώσεις
7. ΜΟΥΦΕΣ: Για διασύνδεση σωληνώσεων χρησιμοποιούμε ΜΟΝΟ μούφες, ΠΟΤΕ μονωτική ταινία

ΚΡΙΤΗΡΙΑ ΠΟΙΟΤΗΤΑΣ (σαν να το βλέπει ανθρώπινο μάτι):
- Τα κανάλια πρέπει να είναι ΙΣΙΑ και ΟΜΟΙΟΜΟΡΦΑ – σε ευθεία γραμμή
- Τα σπιράλ πρέπει να είναι ΟΜΟΡΦΑ ΠΕΡΑΣΜΕΝΑ – ομαλά, χωρίς κυματισμούς
- Η δουλειά πρέπει να φαίνεται ΕΠΑΓΓΕΛΜΑΤΙΚΗ
- Στραβά κανάλια, ζιγκ-ζαγκ, κρεμάσματα → ΧΑΜΗΛΟ SCORE

ΕΓΚΡΙΣΗ (score >= 7) αν φαίνεται τουλάχιστον ΕΝΑ στοιχείο όδευσης τακτοποιημένο.
ΑΠΟΡΡΙΨΗ (score < 7) αν δεν φαίνεται καμία σωλήνωση/κανάλι ή κακή εγκατάσταση.`,

  BCP:
    `Ελέγξτε αν η φωτογραφία δείχνει BCP (Building Connection Point) δικτύου FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- Κουτί BCP τοποθετημένο σε τοίχο ή στύλο ΟΤΕ (ύψος 2.5-3.5m)
- Εσωτερικό BCP ανοιχτό: κασέτα με splicing, pigtails, κύκλοι ίνας
- Παροχική ίνα (μαύρη) εισερχόμενη από τη μία πλευρά
- Ίνα τροφοδοσίας ΒΕΡ (λευκή/άσπρη) εξερχόμενη από την άλλη πλευρά
- Ετικέτες (labelling) στα καλώδια και πόρτα BCP
- Θερμοσυστελλόμενα (heat shrinks) μέσα στην κασέτα

ΚΑΝΟΝΕΣ COSMOTE BCP:
1. ΙΝΕΣ: Αριστερά ολόκληρος κύκλος + είσοδος κασέτας από πάνω. Δεξιά μισός κύκλος + είσοδος από κάτω.
2. PIGTAILS: Αντίθετη πορεία από τις ίνες.
3. ΣΩΛΗΝΙΣΚΟΣ: Κόβεται στη μέση της κασέτας, 2-3 κύκλοι γυμνής ίνας, 1 κύκλος pigtails.
4. LABELLING: Καμπίνα + χωρητικότητα (4FO/12FO) + όρια στα καλώδια. Στην πόρτα: διεύθυνση στις θέσεις A1-B1, C1-D1.
5. Ετικέτα SR ID πρέπει να αναγράφεται (OCR check – αν φαίνεται label, προσπαθήστε να διαβάσετε αν αναφέρει SR ή διεύθυνση).

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται κανένα BCP/κουτί σύνδεσης, ή η φωτογραφία δεν σχετίζεται με τηλεπικοινωνιακό εξοπλισμό.`,

  BEP:
    `Ελέγξτε αν η φωτογραφία δείχνει BEP (Building Entry Point / Κεντρικός Κατανεμητής Παρόχου) δικτύου FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- Κουτί ΒΕΡ (Small/Medium/Large/Extra Large) τοποθετημένο σε κοινόχρηστο χώρο (ύψος 2.5-3.5m)
- BEP ανοιχτό: κασέτα με splicing, pigtails, κύκλοι ίνας, splitter
- Παροχική ίνα οδευμένη στην πλάτη του κουτιού με 3-4 αριστερόστροφους κύκλους
- Patch cords που συνδέουν ΒΕΡ με ΒΜΟ
- Ετικέτες (labelling) στα καλώδια και πόρτα BEP

ΚΑΝΟΝΕΣ COSMOTE BEP (από specs):
1. SR ID LABEL: Πρέπει να αναγράφεται ετικέτα με SR ή διεύθυνση – OCR check αν φαίνεται label.
   - Αν δεν φαίνεται label → feedbackForTechnician: "Δεν αναγνωρίστηκε ετικέτα SR/διεύθυνσης στο BEP – ελέγξτε το labelling"
2. PIGTAILS: Πρέπει να είναι ΜΕΣΑ στους δακτυλίους διαχείρισης (management rings) – ΟΧΙ κρεμασμένες ίνες.
   - Αν φαίνονται κρεμασμένες/ελεύθερες ίνες εκτός κασέτας → feedbackForTechnician: "Pigtails εκτός δακτυλίων διαχείρισης – πρέπει να μπουν μέσα στην κασέτα"
3. ΜΕΓΕΘΗ: Small ≤2 αναμονές, Medium 3-8, Large 9-24, Extra Large 25-32.
4. ΙΝΕΣ: Εισέρχονται από κάτω πλευρά κασέτας, γυμνή ίνα σε μεγάλους κύκλους, pigtails αντίθετη πορεία 1 κύκλος.
5. LABELLING ΠΟΡΤΑΣ: Καμπίνα, σωληνίσκος, όρια.

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται κανένα BEP ή κουτί κατανεμητή, ή είναι άσχετη.`,

  BMO:
    `Ελέγξτε αν η φωτογραφία δείχνει BMO (Building Main Outlet / Κεντρικός Κατανεμητής Κτηρίου) δικτύου FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- Κουτί BMO (Small/Medium/Large) τοποθετημένο δίπλα στο BEP σε κοινόχρηστο χώρο (ύψος 2.5-3.5m)
- BMO ανοιχτό: αναμονές, patch cords, routing diagram
- Fiber Routing Diagram εντός BMO
- Patch cords που συνδέονται με τις εξόδους του splitter στο BEP

ΚΑΝΟΝΕΣ COSMOTE BMO:
1. ΑΡΙΘΜΗΣΗ ΠΟΡΤΩΝ: Πρέπει να φαίνονται labels αρίθμησης (01, 02, 03 κλπ) στις πόρτες/θέσεις.
   - Αν φαίνεται BMO χωρίς αρίθμηση → feedbackForTechnician: "Λείπει η αρίθμηση πορτών (01, 02 κλπ) στο BMO – υποχρεωτική σύμφωνα με τις προδιαγραφές"
2. ΜΕΓΕΘΗ: Small ≤16 αναμονές (≤8 διαμ.), Medium 17-48 (≤24 διαμ.), Large 49-80 (≤40 διαμ.).
3. ΤΟΠΟΘΕΤΗΣΗ: Πρέπει να είναι ΔΙΠΛΑ στο BEP.
4. ΚΑΘΑΡΗ ΕΓΚΑΤΑΣΤΑΣΗ: Τα patch cords πρέπει να είναι τακτοποιημένα, όχι μπερδεμένα.
   - Αν φαίνονται ακατάστατα patch cords → feedbackForTechnician: "Ακατάστατα patch cords στο BMO – πρέπει να τακτοποιηθούν"

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται κανένα BMO/κουτί κατανεμητή κτηρίου, ή είναι άσχετη.`,

  FB:
    `Ελέγξτε αν η φωτογραφία δείχνει Floor Box (κατανεμητής ορόφου) δικτύου FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- Floor Box τοποθετημένο σε κοινόχρηστο χώρο ορόφου (ύψος 2.5-3.5m)
- Floor Box ανοιχτό: splicing, pigtails, κασέτα
- Σύνδεση ίνας εντός Floor Box
- Κάλυμμα/πόρτα Floor Box
- Ετικέτα Floor Box με αρίθμηση (FB01, FB02 κλπ)

ΚΑΝΟΝΕΣ COSMOTE FB:
1. ΑΡΙΘΜΗΣΗ: Πρέπει να φαίνεται label αρίθμησης (FB01, FB02 κλπ).
   - Αν δεν φαίνεται label → feedbackForTechnician: "Λείπει η ετικέτα αρίθμησης (FB01, FB02 κλπ) στο Floor Box"
2. BEP ONLY: Σε κτήρια ≤2 ορόφων ΚΑΙ ≤4 διαμερισμάτων, ΔΕΝ τοποθετούνται FB (εκτός Smart Readiness).
3. ΥΨΟΣ: Ελάχιστο 2.5m, μέγιστο 3.5m.

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται κανένα Floor Box, ή είναι άσχετη.`,

  ΚΑΜΠΙΝΑ:
    `Ελέγξτε αν η φωτογραφία δείχνει ΚΑΜΠΙΝΑ (Cabinet) τηλεπικοινωνιών FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- Εξωτερική όψη τηλεπικοινωνιακής καμπίνας (cabinet) στο δρόμο
- Εσωτερικό καμπίνας: sub racks (A, B, C, D, E), trays, κασέτες
- Κόλληση (splicing) μέσα σε κασέτα καμπίνας
- Splitter εξόδους κουμπωμένες σε αντίστοιχα όρια

ΚΑΝΟΝΕΣ COSMOTE ΚΑΜΠΙΝΑ (από specs):
1. SUB RACKS: Νέα καμπίνα 5 sub racks (A-E), παλαιά 4 (A-D).
2. ΚΑΣΕΤΕΣ: 4 κασέτες/sub rack × 12 όρια = 48 όρια (νέα). 8 κασέτες × 12 = 96 (παλαιά).
3. ΟΔΕΥΣΗ: Μέσω μικρότερου σωληνίσκου στο πάνω μέρος (νέα καμπίνα).
4. ΑΠΟΓΥΜΝΩΣΗ: 7-10cm μέσα στον σωληνίσκο, 2 κύκλοι γυμνής ίνας, 1 κύκλος pigtails.
5. SPLITTER ΤΥΛΙΓΜΑ: Αντίστροφα ρολογιού, Ø 15-20cm.
6. VELCRO ΜΟΝΟ: Αποκλειστικά velcro ταινίες – ΑΠΑΓΟΡΕΥΕΤΑΙ μονωτική ταινία ή tie wraps.
   - Αν φαίνονται tie wraps ή μονωτική ταινία αντί velcro → feedbackForTechnician: "Χρήση tie wraps/μονωτικής ταινίας αντί velcro – απαγορεύεται σύμφωνα με τις προδιαγραφές"
7. LABELLING: Διεύθυνση στην πόρτα sub rack, στον σωληνίσκο, πάνω από θερμοσυστελλόμενα.
8. PARKING: Ίνες κάτω από κασέτες.

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται καμπίνα ή τηλεπικοινωνιακός εξοπλισμός, ή είναι άσχετη.`,

  Γ_ΦΑΣΗ:
    `Ελέγξτε αν η φωτογραφία δείχνει Γ' Φάση (οριζόντια καλωδίωση / σύνδεση πελάτη) δικτύου FTTH.

ΠΡΕΠΕΙ να φαίνεται ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα εξής:
- ΟΤΟ (Optical Telecommunications Outlet) / πρίζα οπτικής ίνας σε τοίχο
- ΟΤΟ HUAWEI με αυτοκόλλητη προτερματισμένη ίνα
- Παραδοσιακό ΟΤΟ με Pigtail (προτερματισμένο καλώδιο)
- ONT/Router εγκατεστημένο στο χώρο πελάτη
- Καλωδίωση από Floor Box μέχρι διαμέρισμα πελάτη
- Κανάλι/σωλήνα όδευσης μέσα στο διαμέρισμα πελάτη

ΚΑΝΟΝΕΣ COSMOTE Γ' ΦΑΣΗ:
1. ΜΟΝΟ σε Retail αιτήματα (SR 2-3***). Σε Wholesale (6ψήφιο SR) ΔΕΝ μπαίνουμε σε διαμέρισμα.
2. 2 τρόποι: Παραδοσιακό ΟΤΟ με Pigtail ή ΟΤΟ HUAWEI με αυτοκόλλητη ίνα.

ΑΠΟΡΡΙΨΗ αν: δεν φαίνεται κανένας εξοπλισμός πελάτη (router/ONT/πρίζα/ΟΤΟ), ή είναι άσχετη.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageBase64, photoType, phase, category } = await req.json();
    console.log(`analyze-photo called: phase=${phase}, category=${category}, photoType=${photoType}, imageSize=${imageBase64?.length || 0}`);

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ isValid: false, isApproved: false, message: "Δεν βρέθηκε εικόνα." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isConstruction = phase === "construction";

    // ─── Build system prompt ───
    let systemPrompt: string;
    let toolDef: any;

    if (isConstruction) {
      const catPrompt =
        CONSTRUCTION_CATEGORY_PROMPTS[category] ||
        "Ελέγξτε αν η φωτογραφία δείχνει εργασίες κατασκευής FTTH. ΑΠΟΡΡΙΨΗ αν δεν σχετίζεται με τηλεπικοινωνιακό έργο.";

      systemPrompt = `Είσαι Ελεγκτής Ποιότητας Έργων Οπτικών Ινών (FTTH) του ΟΤΕ για την Β' Φάση (Κατασκευή).
Η δουλειά σου είναι να ΕΛΕΓΧΕΙΣ αν η φωτογραφία αντιστοιχεί στη ΣΩΣΤΗ ΚΑΤΗΓΟΡΙΑ εργασίας ΚΑΙ αν πληροί τις ΤΕΧΝΙΚΕΣ ΠΡΟΔΙΑΓΡΑΦΕΣ COSMOTE.

ΚΑΝΟΝΕΣ ΕΛΕΓΧΟΥ:

1. ΑΝΤΙΣΤΟΙΧΙΑ ΚΑΤΗΓΟΡΙΑΣ (ΚΡΙΣΙΜΟ): Η φωτογραφία ΠΡΕΠΕΙ να δείχνει αυτό που ζητάει η κατηγορία.
   - Αν η κατηγορία είναι "ΣΚΑΜΑ" και η φωτο δείχνει εσωτερικό χώρο → ΑΠΟΡΡΙΨΗ
   - Αν η κατηγορία είναι "BEP" και η φωτο δείχνει σκάμα → ΑΠΟΡΡΙΨΗ
   - Αν η κατηγορία είναι "ΚΑΜΠΙΝΑ" και η φωτο δείχνει floor box → ΑΠΟΡΡΙΨΗ

2. ΤΕΧΝΙΚΕΣ ΠΡΟΔΙΑΓΡΑΦΕΣ: Ελέγξτε αν η εργασία πληροί τα κριτήρια Cosmote που περιγράφονται στις ειδικές οδηγίες κατηγορίας.
   - Αν λείπει κάτι ΚΡΙΣΙΜΟ (ταινία σήμανσης, στηρίγματα Ω, labelling, velcro) → ΧΑΜΗΛΟ SCORE + αναλυτικό feedback στα Ελληνικά

3. ΠΟΙΟΤΗΤΑ: Η φωτογραφία πρέπει να είναι αρκετά ευκρινής ώστε να αναγνωρίζεται τι δείχνει.
   - Εντελώς θολή/σκοτεινή → ΑΠΟΡΡΙΨΗ (score ≤ 3)

4. ΑΣΧΕΤΕΣ ΦΩΤΟΓΡΑΦΙΕΣ: selfies, φαγητά, ζώα, τοπία → ΑΠΟΡΡΙΨΗ (score = 1)

ΒΑΘΜΟΛΟΓΗΣΗ:
- 9-10: Σωστή κατηγορία + πληρεί ΟΛΕΣ τις προδιαγραφές + καλή ποιότητα
- 7-8: Σωστή κατηγορία, μικρές ατέλειες, αποδεκτό
- 4-6: Σωστή κατηγορία αλλά ΛΕΙΠΟΥΝ ΚΡΙΣΙΜΕΣ ΠΡΟΔΙΑΓΡΑΦΕΣ (ταινία σήμανσης, στηρίγματα κλπ)
- 1-3: Λάθος κατηγορία, θολή, ή εντελώς άσχετη

isApproved = true ΜΟΝΟ αν score >= 7 ΚΑΙ η φωτογραφία αντιστοιχεί στη σωστή κατηγορία ΚΑΙ δεν λείπουν ΚΡΙΣΙΜΕΣ ΠΡΟΔΙΑΓΡΑΦΕΣ.

ΣΗΜΑΝΤΙΚΟ ΓΙΑ ΤΟ FEEDBACK: Όταν απορρίπτεται μια φωτογραφία, το feedbackForTechnician ΠΡΕΠΕΙ να εξηγεί ΑΚΡΙΒΩΣ ποια προδιαγραφή λείπει (π.χ. "Λείπει το κίτρινο πλέγμα σήμανσης", "Λείπουν τα στηρίγματα Ω", "Χρήση tie wraps αντί velcro").

Ειδικές οδηγίες για κατηγορία "${category}": ${catPrompt}`;

      toolDef = {
        type: "function",
        function: {
          name: "construction_photo_analysis",
          description: "Return the OTE Phase B quality analysis result based on Cosmote technical specifications.",
          parameters: {
            type: "object",
            properties: {
              isApproved: {
                type: "boolean",
                description: "true ONLY if photo matches the correct category AND has quality score >= 7 AND meets Cosmote specs",
              },
              qualityScore: {
                type: "number",
                description: "Quality score from 1 to 10. Score < 7 means rejected.",
              },
              stageIdentified: {
                type: "string",
                description: "For ΣΚΑΜΑ: one of 'Open Trench', 'Warning Tape', 'Base Layer', 'Final Surface'. For other categories: the main element identified (e.g. 'BCP Installation', 'Routing Channel'). Empty string if unrecognizable.",
              },
              detectedElements: {
                type: "array",
                items: { type: "string" },
                description: "List of specific elements detected in the photo (e.g. 'HDPE pipe', 'yellow warning tape', 'red bricks', 'concrete fill', 'Ω clips', 'velcro'). Helps auditors understand what the AI saw.",
              },
              issuesFound: {
                type: "array",
                items: { type: "string" },
                description: "List of specific spec violations found (empty if approved). Each issue should reference the exact Cosmote spec that is violated.",
              },
              feedbackForTechnician: {
                type: "string",
                description: "Detailed feedback in Greek for the technician explaining why approved or rejected, referencing specific Cosmote specs. E.g. 'Η αποκατάσταση είναι τέλεια, 10/10' or 'Λείπει το κίτρινο πλέγμα σήμανσης'.",
              },
            },
            required: ["isApproved", "qualityScore", "stageIdentified", "detectedElements", "issuesFound", "feedbackForTechnician"],
            additionalProperties: false,
          },
        },
      };
    } else {
      // Survey-phase: permissive site-survey check
      systemPrompt = `Είστε βοηθός ελέγχου φωτογραφιών για Telecom Site Survey (Προμελέτη Χώρου FTTH).
Ο τεχνικός φωτογραφίζει τον χώρο ΠΡΙΝ την κατασκευή για να τεκμηριώσει την υπάρχουσα κατάσταση και να σχεδιάσει τη διαδρομή της οπτικής ίνας.

ΕΓΚΡΙΝΕΤΕ (isValid: true) φωτογραφίες που δείχνουν ΟΤΙΔΗΠΟΤΕ σχετικό με τον χώρο εργασίας:
- Δρόμους, πεζοδρόμια, φρεάτια, ασφάλτινες επιφάνειες
- Προσόψεις κτιρίων, μάντρες, εξωτερικές εισόδους πολυκατοικιών
- Κλιμακοστάσια, διαδρόμους ορόφων, ασανσέρ, λεβητοστάσια, υπόγεια, μετρητές ρεύματος
- Εσωτερικό διαμερισμάτων: χολ, σαλόνια, τοίχους, πρίζες ρεύματος/τηλεφώνου
- Screenshots χαρτών, σχέδια ΧΕΜΔ/AutoCAD
- Οποιονδήποτε τηλεπικοινωνιακό εξοπλισμό (BEP, BCP, BMO, καμπίνα, router, ONT)
- Οποιαδήποτε φωτογραφία εξωτερικού ή εσωτερικού χώρου

ΑΠΟΡΡΙΨΤΕ (isValid: false) ΜΟΝΟ φωτογραφίες που είναι:
- Εντελώς άσχετες (selfies, φαγητά, ζώα, τοπία διακοπών)
- Τόσο σκοτεινές που δεν διακρίνεται τίποτα
- Τόσο θολές που δεν αναγνωρίζεται κανένα αντικείμενο

ΣΗΜΑΝΤΙΚΟ: Να είστε ΠΟΛΥ ΕΛΑΣΤΙΚΟΙ. Σε περίπτωση αμφιβολίας, ΕΓΚΡΙΝΕΤΕ τη φωτογραφία.`;

      toolDef = {
        type: "function",
        function: {
          name: "photo_analysis_result",
          description: "Return the analysis result for the photo quality check.",
          parameters: {
            type: "object",
            properties: {
              isValid: {
                type: "boolean",
                description: "true if the photo passes quality checks",
              },
              message: {
                type: "string",
                description: "Short feedback message in Greek",
              },
            },
            required: ["isValid", "message"],
            additionalProperties: false,
          },
        },
      };
    }

    const toolName = toolDef.function.name;

    console.log(`Calling AI gateway for ${isConstruction ? 'construction' : 'survey'} analysis, category: ${category}`);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: isConstruction
                    ? `Αναλύστε αυτή τη φωτογραφία κατασκευής FTTH. Κατηγορία: "${category}". ΕΛΕΓΞΤΕ αν η φωτογραφία ΠΡΑΓΜΑΤΙΚΑ δείχνει ${category} ΚΑΙ αν πληροί τις τεχνικές προδιαγραφές Cosmote. Αν λείπει κάτι κρίσιμο (ταινία σήμανσης, στηρίγματα Ω, labelling, velcro), αναφέρετέ το ρητά στο feedback.`
                    : "Αναλύστε αυτή τη φωτογραφία.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                },
              ],
            },
          ],
          tools: [toolDef],
          tool_choice: { type: "function", function: { name: toolName } },
        }),
      }
    );

    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error:", response.status, txt);
      const fallback = isConstruction
        ? { isApproved: true, qualityScore: 10, issuesFound: [], feedbackForTechnician: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.", skipped: true }
        : { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.", skipped: true };
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    console.log("AI gateway response received, choices:", data.choices?.length);

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log(`Analysis result: isApproved=${result.isApproved}, score=${result.qualityScore}, isValid=${result.isValid}`);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.warn("No tool call in response, returning fallback");
    const fallback = isConstruction
      ? { isApproved: true, qualityScore: 10, issuesFound: [], feedbackForTechnician: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true }
      : { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true };
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-photo error:", e);
    return new Response(
      JSON.stringify({
        isValid: true,
        isApproved: true,
        qualityScore: 10,
        issuesFound: [],
        feedbackForTechnician: "Σφάλμα ανάλυσης. Η φωτογραφία γίνεται δεκτή.",
        message: "Σφάλμα ανάλυσης. Η φωτογραφία γίνεται δεκτή.",
        skipped: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
