import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSetupChecklist, SetupStep } from "@/hooks/useSetupChecklist";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  HardDrive,
  FolderOpen,
  Mail,
  Users,
  Package,
  Euro,
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  X,
  ExternalLink,
  Info,
  Lightbulb,
  AlertCircle,
  KeyRound,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  "hard-drive": HardDrive,
  "key-round": KeyRound,
  folder: FolderOpen,
  mail: Mail,
  users: Users,
  package: Package,
  euro: Euro,
};

interface StepDetail {
  why: string;
  instructions: { text: string; tip?: string }[];
  important?: string;
  route: string;
  routeLabel: string;
}

const STEP_DETAILS: Record<string, StepDetail> = {
  service_account: {
    why: "Η εφαρμογή χρησιμοποιεί ένα Google Service Account για να επικοινωνεί με το Google Drive και τα Google Sheets χωρίς να χρειάζεται ο χρήστης να κάνει login στο Google κάθε φορά. Είναι σαν ένας «ρομποτικός λογαριασμός» που δουλεύει στο παρασκήνιο.",
    instructions: [
      {
        text: "Ανοίξτε το Google Cloud Console: console.cloud.google.com",
        tip: "Αν δεν έχετε λογαριασμό, δημιουργήστε έναν δωρεάν — δεν χρειάζεται πιστωτική κάρτα για αυτό που θα κάνουμε",
      },
      {
        text: "Δημιουργήστε ένα νέο Project (π.χ. «FTTH Operations») ή επιλέξτε υπάρχον",
        tip: "Πατήστε το dropdown δίπλα στο «Google Cloud» πάνω αριστερά → New Project",
      },
      {
        text: "Ενεργοποιήστε τα APIs: Πηγαίνετε στο μενού ☰ → APIs & Services → Library. Αναζητήστε και ενεργοποιήστε: «Google Drive API» και «Google Sheets API»",
        tip: "Πατήστε Enable σε κάθε ένα — χωρίς αυτά η εφαρμογή δεν μπορεί να διαβάσει/γράψει αρχεία",
      },
      {
        text: "Δημιουργήστε Service Account: Μενού ☰ → IAM & Admin → Service Accounts → Create Service Account",
        tip: "Δώστε του ένα όνομα (π.χ. «ftth-app») — τα υπόλοιπα πεδία μπορείτε να τα αφήσετε κενά",
      },
      {
        text: "Δημιουργήστε κλειδί JSON: Κάντε κλικ στο Service Account → Keys → Add Key → Create New Key → JSON → Create",
        tip: "Θα κατεβάσει αυτόματα ένα αρχείο .json — ΦΥΛΑΞΤΕ ΤΟ ΑΣΦΑΛΕΣ, είναι σαν κωδικός!",
      },
      {
        text: "Αντιγράψτε το email του Service Account (μοιάζει με: ftth-app@project-id.iam.gserviceaccount.com)",
        tip: "Θα το χρειαστείτε στο επόμενο βήμα για να δώσετε πρόσβαση στο Google Drive",
      },
      {
        text: "Στείλτε το JSON κλειδί στον διαχειριστή συστήματος για να το ρυθμίσει στην εφαρμογή",
        tip: "Το κλειδί αποθηκεύεται κρυπτογραφημένα και δεν είναι προσβάσιμο από κανέναν χρήστη",
      },
    ],
    important: "Το JSON κλειδί πρέπει να μείνει απόρρητο — μην το μοιράζεστε μέσω email ή chat. Χρησιμοποιήστε ασφαλή κανάλι (π.χ. password manager). Αν διαρρεύσει, μπορεί κάποιος να αποκτήσει πρόσβαση στα αρχεία σας.",
    route: "/settings",
    routeLabel: "Ρυθμίσεις",
  },
  drive: {
    why: "Το Google Drive χρησιμοποιείται για αποθήκευση φωτογραφιών αυτοψιών, PDF κατασκευών και αρχείων GIS. Χωρίς αυτό, δεν μπορείτε να ανεβάσετε ή να διαχειριστείτε αρχεία.",
    instructions: [
      {
        text: "Ανοίξτε το Google Drive και δημιουργήστε ένα νέο Shared Drive (π.χ. «FTTH Operations»)",
        tip: "Βρίσκεται στο αριστερό μενού → Shared Drives → Νέο",
      },
      {
        text: "Κάντε δεξί κλικ στο Shared Drive → Manage members → Προσθέστε το Service Account email ως Manager",
        tip: "Το Service Account email σας το δίνει ο διαχειριστής συστήματος",
      },
      {
        text: "Αντιγράψτε το Drive ID από τη γραμμή URL (μετά το /drive/folders/)",
        tip: "Παράδειγμα URL: drive.google.com/drive/folders/0ABcDeFgHiJkLmN → το ID είναι 0ABcDeFgHiJkLmN",
      },
      {
        text: "Πηγαίνετε στις Ρυθμίσεις της εφαρμογής → Google Drive → Shared Drive ID και επικολλήστε το ID",
      },
    ],
    important: "Βεβαιωθείτε ότι το Service Account έχει δικαιώματα Manager, αλλιώς η εφαρμογή δεν θα μπορεί να δημιουργεί φακέλους.",
    route: "/settings",
    routeLabel: "Ρυθμίσεις Google Drive",
  },
  areas: {
    why: "Κάθε περιοχή (π.χ. ΡΟΔΟΣ, ΚΩΣ) αντιστοιχεί σε έναν φάκελο στο Google Drive. Όταν δημιουργείται μια νέα ανάθεση, τα αρχεία αποθηκεύονται αυτόματα στον σωστό φάκελο.",
    instructions: [
      {
        text: "Μέσα στο Shared Drive, δημιουργήστε έναν φάκελο για κάθε περιοχή που εξυπηρετείτε",
        tip: "Π.χ. φακέλους: ΡΟΔΟΣ, ΚΩΣ, ΚΑΛΥΜΝΟΣ κλπ.",
      },
      {
        text: "Ανοίξτε κάθε φάκελο και αντιγράψτε το Folder ID από το URL",
        tip: "Μπορείτε να το βρείτε στη γραμμή διεύθυνσης — είναι το τελευταίο κομμάτι μετά το /folders/",
      },
      {
        text: "Πηγαίνετε στις Ρυθμίσεις → Φάκελοι Περιοχών",
      },
      {
        text: "Πατήστε «Προσθήκη Περιοχής», πληκτρολογήστε το όνομα (π.χ. ΡΟΔΟΣ) και επικολλήστε το Folder ID",
        tip: "Το όνομα πρέπει να ταιριάζει ακριβώς με αυτό που χρησιμοποιείτε στις αναθέσεις",
      },
    ],
    important: "Αν αλλάξετε τα ονόματα περιοχών αργότερα, θα πρέπει να ενημερώσετε και εδώ τους αντίστοιχους φακέλους.",
    route: "/settings",
    routeLabel: "Ρυθμίσεις Περιοχών",
  },
  emails: {
    why: "Η εφαρμογή στέλνει αυτόματα emails σε 3 περιπτώσεις: ολοκλήρωση αυτοψίας (PDF report), ολοκλήρωση κατασκευής και ειδοποίηση χαμηλού αποθέματος. Χωρίς σωστή ρύθμιση, δεν θα λαμβάνετε ειδοποιήσεις.",
    instructions: [
      {
        text: "Πηγαίνετε στις Ρυθμίσεις → Email",
      },
      {
        text: "Ορίστε το email αποστολέα — αυτό θα εμφανίζεται ως «Από:» στα emails",
        tip: "Π.χ. noreply@deltanetwork.gr ή operations@company.gr",
      },
      {
        text: "Στο πεδίο «Παραλήπτες Ολοκλήρωσης (TO)» βάλτε τα emails που θέλετε να λαμβάνουν τα reports",
        tip: "Μπορείτε να βάλετε πολλά emails, χωρισμένα με κόμμα",
      },
      {
        text: "Προαιρετικά: Προσθέστε CC emails και ξεχωριστό email για ειδοποιήσεις αποθήκης",
      },
    ],
    route: "/settings",
    routeLabel: "Ρυθμίσεις Email",
  },
  users: {
    why: "Οι τεχνικοί χρησιμοποιούν την εφαρμογή στο κινητό τους για να βλέπουν τις αναθέσεις τους, να ανεβάζουν φωτογραφίες αυτοψίας και να καταγράφουν υλικά κατασκευής. Χωρίς λογαριασμό, δεν μπορούν να συμμετέχουν.",
    instructions: [
      {
        text: "Πηγαίνετε στη σελίδα Διαχείριση Χρηστών",
      },
      {
        text: "Πατήστε το κουμπί «Νέος Χρήστης» πάνω δεξιά",
      },
      {
        text: "Συμπληρώστε: Ονοματεπώνυμο, Email, Τηλέφωνο (προαιρετικά) και επιλέξτε ρόλο «Τεχνικός»",
        tip: "Χρησιμοποιήστε email που έχει πρόσβαση ο τεχνικός — θα λάβει email ενεργοποίησης",
      },
      {
        text: "Ο τεχνικός θα λάβει email με σύνδεσμο ενεργοποίησης. Μόλις το επιβεβαιώσει, μπορεί να συνδεθεί",
        tip: "Αν δεν λάβει email, ελέγξτε τον φάκελο spam ή ξαναστείλτε πρόσκληση",
      },
    ],
    important: "Κάθε τεχνικός βλέπει μόνο τις δικές του αναθέσεις. Οι admins βλέπουν τα πάντα.",
    route: "/users",
    routeLabel: "Διαχείριση Χρηστών",
  },
  materials: {
    why: "Η αποθήκη υλικών σας δείχνει τι έχετε διαθέσιμο (καλώδια, σπιράλ, ρακόρ κλπ). Όταν ένας τεχνικός καταγράφει υλικά σε μια κατασκευή, αφαιρούνται αυτόματα από το απόθεμα.",
    instructions: [
      {
        text: "Πηγαίνετε στη σελίδα Αποθήκη",
      },
      {
        text: "Επιλογή Α: Αυτόματη εισαγωγή — Πατήστε «Sync από Drive» στο Dashboard. Τα υλικά θα εισαχθούν από το Google Sheet αυτόματα",
        tip: "Χρειάζεται να έχετε ρυθμίσει πρώτα το Google Drive (Βήμα 1)",
      },
      {
        text: "Επιλογή Β: Χειροκίνητα — Πατήστε «Προσθήκη Υλικού» και συμπληρώστε κωδικό, περιγραφή, πηγή (OTE ή δική σας), απόθεμα και τιμή",
        tip: "Τα υλικά OTE έχουν τιμή 0€ — τα πληρώνει η OTE. Τα δικά σας έχουν κόστος.",
      },
      {
        text: "Ορίστε το «Ελάχιστο Απόθεμα» για κάθε υλικό — θα λάβετε ειδοποίηση email όταν πέσει κάτω από αυτό",
      },
    ],
    important: "Τα υλικά χωρίζονται σε OTE (παρέχονται δωρεάν) και δικά σας (με κόστος). Αυτό επηρεάζει τον υπολογισμό κέρδους.",
    route: "/materials",
    routeLabel: "Αποθήκη Υλικών",
  },
  pricing: {
    why: "Ο τιμοκατάλογος εργασιών καθορίζει πόσο χρεώνεται κάθε εργασία κατασκευής (π.χ. πόρτα οπτικής ίνας, τοποθέτηση ODF κλπ). Χρησιμοποιείται αυτόματα στις κατασκευές για τον υπολογισμό εσόδων.",
    instructions: [
      {
        text: "Πηγαίνετε στη σελίδα Τιμοκατάλογος Εργασιών",
      },
      {
        text: "Επιλογή Α: Αυτόματη εισαγωγή — Πατήστε «Sync από Drive» στο Dashboard",
        tip: "Τα δεδομένα εισάγονται από το φύλλο «ΕΡΓΑΣΙΕΣ» του Google Sheet",
      },
      {
        text: "Επιλογή Β: Χειροκίνητα — Πατήστε «Νέα Εργασία» και συμπληρώστε τον κωδικό, την περιγραφή, την κατηγορία, τη μονάδα μέτρησης και την τιμή",
        tip: "Παράδειγμα: Κωδ. «ΕΡΓ-001», Περιγραφή «Τοποθέτηση ODF», Μονάδα «τεμ.», Τιμή «45€»",
      },
      {
        text: "Οι τιμές θα χρησιμοποιούνται αυτόματα όταν προσθέτετε εργασίες σε μια κατασκευή",
      },
    ],
    important: "Αν αλλάξετε μια τιμή, οι υπάρχουσες κατασκευές δεν θα επηρεαστούν — μόνο οι νέες.",
    route: "/work-pricing",
    routeLabel: "Τιμοκατάλογος Εργασιών",
  },
};

interface SetupWizardProps {
  onDismiss?: () => void;
  demoMode?: boolean;
}

const DEMO_STEPS: SetupStep[] = [
  { id: "drive", title: "Google Drive", description: "Σύνδεση με Shared Drive για αρχεία αυτοψιών & κατασκευών", completed: false, route: "/settings", icon: "hard-drive" },
  { id: "areas", title: "Περιοχές & Φάκελοι", description: "Ορισμός περιοχών (π.χ. ΡΟΔΟΣ, ΚΩΣ) και Folder IDs", completed: false, route: "/settings", icon: "folder" },
  { id: "emails", title: "Ρυθμίσεις Email", description: "Email αποστολέα, παραλήπτες ειδοποιήσεων", completed: false, route: "/settings", icon: "mail" },
  { id: "users", title: "Τεχνικοί", description: "Προσθήκη τεχνικών για αναθέσεις αυτοψιών", completed: false, route: "/users", icon: "users" },
  { id: "materials", title: "Αποθήκη Υλικών", description: "Εισαγωγή υλικών (μέσω sync ή χειροκίνητα)", completed: false, route: "/materials", icon: "package" },
  { id: "pricing", title: "Τιμοκατάλογος Εργασιών", description: "Τιμές εργασιών κατασκευής (μέσω sync ή χειροκίνητα)", completed: false, route: "/work-pricing", icon: "euro" },
];

const SetupWizard = ({ onDismiss, demoMode = false }: SetupWizardProps) => {
  const { data: realSteps, isLoading } = useSetupChecklist();
  const [demoSteps, setDemoSteps] = useState<SetupStep[]>(DEMO_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const navigate = useNavigate();

  const steps = demoMode ? demoSteps : realSteps;

  if (!demoMode && (isLoading || !steps)) return null;
  if (!steps) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progress = Math.round((completedCount / totalSteps) * 100);

  // All done
  if (completedCount === totalSteps) {
    return (
      <Card className="p-5 sm:p-6 border-success/30 bg-success/5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">Η ρύθμιση ολοκληρώθηκε! 🎉</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Όλα είναι έτοιμα. Μπορείτε να ξεκινήσετε να δημιουργείτε αναθέσεις και να διαχειρίζεστε τις κατασκευές σας.
            </p>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const currentStep = steps[activeStepIndex];
  const detail = STEP_DETAILS[currentStep.id];
  const Icon = ICON_MAP[currentStep.icon] || Circle;

  const handleMarkComplete = () => {
    if (demoMode) {
      setDemoSteps(prev => prev.map(s => s.id === currentStep.id ? { ...s, completed: true } : s));
    }
    // Auto-advance to next incomplete step
    const nextIncomplete = steps.findIndex((s, i) => i > activeStepIndex && !s.completed);
    if (nextIncomplete !== -1) {
      setActiveStepIndex(nextIncomplete);
    } else {
      const firstIncomplete = steps.findIndex(s => !s.completed && s.id !== currentStep.id);
      if (firstIncomplete !== -1) setActiveStepIndex(firstIncomplete);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      {/* Top gradient bar */}
      <div className="h-1 cosmote-gradient" />

      {/* Header with progress */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl cosmote-gradient flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Οδηγός Εγκατάστασης</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Βήμα {activeStepIndex + 1} από {totalSteps} • {completedCount} ολοκληρωμένα
              </p>
            </div>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Progress value={progress} className="mt-3 h-1.5" />

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 mt-3">
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => setActiveStepIndex(i)}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                step.completed
                  ? "bg-success"
                  : i === activeStepIndex
                  ? "bg-primary"
                  : "bg-muted"
              }`}
              title={step.title}
            />
          ))}
        </div>
      </div>

      {/* Current step detail */}
      <div className="px-4 sm:px-6 pb-5 sm:pb-6">
        {/* Step title */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
            currentStep.completed ? "bg-success/10" : "bg-primary/10"
          }`}>
            {currentStep.completed ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <Icon className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
              {currentStep.title}
              {currentStep.completed && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-lg">
                  Ολοκληρώθηκε
                </span>
              )}
            </h4>
            <p className="text-xs text-muted-foreground">{currentStep.description}</p>
          </div>
        </div>

        {/* Why this matters */}
        {detail && !currentStep.completed && (
          <>
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 mb-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1">Γιατί χρειάζεται</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{detail.why}</p>
                </div>
              </div>
            </div>

            {/* Step-by-step instructions */}
            <div className="space-y-3 mb-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Βήματα</p>
              {detail.instructions.map((inst, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-lg cosmote-gradient flex items-center justify-center text-[11px] font-bold text-white mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed">{inst.text}</p>
                    {inst.tip && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Lightbulb className="h-3 w-3 text-warning mt-0.5 shrink-0" />
                        <p className="text-[11px] text-muted-foreground italic">{inst.tip}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Important note */}
            {detail.important && (
              <div className="rounded-xl bg-warning/5 border border-warning/20 p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold text-warning uppercase tracking-wider mb-1">Σημαντικό</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{detail.important}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex(prev => prev - 1)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Προηγούμενο
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={activeStepIndex === totalSteps - 1}
              onClick={() => setActiveStepIndex(prev => prev + 1)}
            >
              Επόμενο
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {!currentStep.completed && detail && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => navigate(detail.route)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {detail.routeLabel}
              </Button>
            )}
            {!currentStep.completed && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleMarkComplete}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ολοκληρώθηκε
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SetupWizard;
