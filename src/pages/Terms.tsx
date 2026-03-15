const Terms = () => (
  <div className="min-h-screen bg-[hsl(215,22%,11%)] text-white px-4 py-12">
    <div className="mx-auto max-w-3xl space-y-8">
      <a href="/" className="inline-flex items-center gap-2 text-sm text-[hsl(185,70%,50%)] hover:underline mb-4">← Αρχική</a>
      
      <h1 className="text-3xl font-extrabold tracking-tight">Όροι Χρήσης & Πνευματικά Δικαιώματα</h1>
      <p className="text-sm text-[hsl(210,14%,55%)]">Τελευταία ενημέρωση: {new Date().toLocaleDateString('el-GR')}</p>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">1. Πνευματική Ιδιοκτησία</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Η εφαρμογή <strong>DeltaNetwork FTTx Operations</strong>, συμπεριλαμβανομένου του πηγαίου κώδικα, του σχεδιασμού,
          των γραφικών, των λογοτύπων, των κειμένων και κάθε άλλου στοιχείου, αποτελεί αποκλειστική πνευματική ιδιοκτησία
          της <strong>DeltaNetwork</strong> και προστατεύεται από τη νομοθεσία περί πνευματικής ιδιοκτησίας της Ελλάδας,
          της Ευρωπαϊκής Ένωσης και τις διεθνείς συμβάσεις.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">2. Απαγόρευση Αντιγραφής & Μεταπώλησης</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Απαγορεύεται ρητά και αυστηρά η αντιγραφή, αναπαραγωγή, τροποποίηση, μεταπώληση, αναδιανομή ή χρήση
          οποιουδήποτε μέρους αυτής της εφαρμογής χωρίς προηγούμενη γραπτή συγκατάθεση της DeltaNetwork.
          Κάθε παράβαση θα επιφέρει νομικές κυρώσεις σύμφωνα με την ισχύουσα νομοθεσία.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">3. Άδεια Χρήσης</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Η πρόσβαση στην εφαρμογή παρέχεται αποκλειστικά ως υπηρεσία (SaaS) στους εγκεκριμένους χρήστες/εταιρίες
          βάσει συνδρομής. Η άδεια χρήσης είναι μη μεταβιβάσιμη, μη αποκλειστική και ανακλητή.
          Δεν μεταβιβάζεται κανένα δικαίωμα ιδιοκτησίας στον χρήστη.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">4. Απαγορεύσεις</h2>
        <ul className="text-sm text-[hsl(210,14%,70%)] leading-relaxed list-disc list-inside space-y-1">
          <li>Reverse engineering, αποσυμπίληση ή αποσυναρμολόγηση του λογισμικού</li>
          <li>Αφαίρεση ή τροποποίηση σημάνσεων πνευματικής ιδιοκτησίας</li>
          <li>Χρήση για κατασκευή ανταγωνιστικού προϊόντος</li>
          <li>Κοινοποίηση κωδικών πρόσβασης σε τρίτους</li>
          <li>Αυτοματοποιημένη εξαγωγή δεδομένων (scraping)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">5. Προστασία Δεδομένων</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Τα δεδομένα που εισάγονται στην εφαρμογή ανήκουν στον πελάτη/εταιρία. Η DeltaNetwork δεν μοιράζεται,
          δεν πωλεί και δεν χρησιμοποιεί τα δεδομένα πελατών για σκοπούς πέραν της παροχής της υπηρεσίας.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">6. Εφαρμοστέο Δίκαιο</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Οι παρόντες όροι διέπονται από το Ελληνικό Δίκαιο. Αρμόδια δικαστήρια είναι τα δικαστήρια Αθηνών.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[hsl(185,70%,50%)]">7. Επικοινωνία</h2>
        <p className="text-sm text-[hsl(210,14%,70%)] leading-relaxed">
          Για ερωτήσεις σχετικά με τους όρους χρήσης ή τα πνευματικά δικαιώματα, επικοινωνήστε μαζί μας:<br />
          <a href="mailto:info@deltanetwork.app" className="text-[hsl(185,70%,50%)] hover:underline">info@deltanetwork.app</a>
        </p>
      </section>

      <div className="border-t border-[hsl(215,18%,20%)] pt-6 text-center">
        <p className="text-xs text-[hsl(210,14%,40%)]">
          © {new Date().getFullYear()} DeltaNetwork. All rights reserved. Με επιφύλαξη παντός δικαιώματος.
        </p>
      </div>
    </div>
  </div>
);

export default Terms;
