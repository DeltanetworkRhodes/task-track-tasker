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
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  "hard-drive": HardDrive,
  folder: FolderOpen,
  mail: Mail,
  users: Users,
  package: Package,
  euro: Euro,
};

const STEP_GUIDES: Record<string, string[]> = {
  drive: [
    "Δημιουργήστε ένα Shared Drive στο Google Drive",
    "Κάντε Share με το Service Account email",
    "Αντιγράψτε το Drive ID από το URL",
    "Επικολλήστε στις Ρυθμίσεις → Google Drive → Shared Drive ID",
  ],
  areas: [
    "Δημιουργήστε φακέλους για κάθε περιοχή (π.χ. ΡΟΔΟΣ, ΚΩΣ) στο Shared Drive",
    "Αντιγράψτε τα Folder IDs",
    "Πηγαίνετε στις Ρυθμίσεις → Φάκελοι Περιοχών",
    "Προσθέστε κάθε περιοχή με το αντίστοιχο Folder ID",
  ],
  emails: [
    "Πηγαίνετε στις Ρυθμίσεις → Email",
    "Ορίστε το email αποστολέα (π.χ. noreply@company.gr)",
    "Προσθέστε τα emails παραληπτών ολοκλήρωσης (TO & CC)",
    "Ορίστε το email ειδοποίησης αποθήκης",
  ],
  users: [
    "Πηγαίνετε στη Διαχείριση Χρηστών",
    "Πατήστε 'Προσθήκη Χρήστη'",
    "Εισάγετε email, ονοματεπώνυμο και ρόλο (Τεχνικός)",
    "Ο τεχνικός θα λάβει email ενεργοποίησης",
  ],
  materials: [
    "Μπορείτε να εισάγετε υλικά χειροκίνητα ή μέσω Google Sheets sync",
    "Για sync: Ρυθμίστε το Google Sheet ID στο .env",
    "Πατήστε 'Sync από Drive' στο dashboard",
    "Τα υλικά θα εμφανιστούν αυτόματα στην Αποθήκη",
  ],
  pricing: [
    "Μπορείτε να εισάγετε τιμές χειροκίνητα ή μέσω Google Sheets sync",
    "Κάθε εργασία χρειάζεται: κωδικό, περιγραφή, μονάδα, τιμή",
    "Οι τιμές χρησιμοποιούνται αυτόματα στις κατασκευές",
    "Πατήστε 'Sync από Drive' για αυτόματη εισαγωγή",
  ],
};

interface SetupWizardProps {
  onDismiss?: () => void;
}

const SetupWizard = ({ onDismiss }: SetupWizardProps) => {
  const { data: steps, isLoading } = useSetupChecklist();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const navigate = useNavigate();

  if (isLoading || !steps) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progress = Math.round((completedCount / totalSteps) * 100);

  // All done? Show success or nothing
  if (completedCount === totalSteps) {
    return (
      <Card className="p-4 sm:p-5 border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">Η ρύθμιση ολοκληρώθηκε! 🎉</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Όλα είναι έτοιμα. Μπορείτε να ξεκινήσετε να χρησιμοποιείτε την πλατφόρμα.
            </p>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Find first incomplete step
  const nextStep = steps.find((s) => !s.completed);

  return (
    <Card className="overflow-hidden border-primary/20">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Οδηγός Εγκατάστασης</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {completedCount}/{totalSteps} βήματα ολοκληρωμένα
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
      </div>

      {/* Steps */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-1.5 mt-2">
        {steps.map((step) => {
          const Icon = ICON_MAP[step.icon] || Circle;
          const isExpanded = expandedStep === step.id;
          const guide = STEP_GUIDES[step.id] || [];
          const isNext = nextStep?.id === step.id;

          return (
            <div
              key={step.id}
              className={`rounded-lg border transition-all ${
                step.completed
                  ? "border-green-500/20 bg-green-500/5"
                  : isNext
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
              >
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                    step.completed
                      ? "bg-green-500/15"
                      : isNext
                      ? "bg-primary/15"
                      : "bg-muted"
                  }`}
                >
                  {step.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        isNext ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-semibold ${
                      step.completed
                        ? "text-green-600 dark:text-green-400 line-through"
                        : "text-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{step.description}</p>
                </div>
                {!step.completed && (
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </button>

              {/* Expanded guide */}
              {isExpanded && !step.completed && (
                <div className="px-3 pb-3 pt-0.5">
                  <ol className="space-y-1.5 ml-10">
                    {guide.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <span className="shrink-0 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-foreground mt-0.5">
                          {i + 1}
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                  {step.route && (
                    <Button
                      size="sm"
                      variant="default"
                      className="mt-3 ml-10 gap-1.5 text-xs h-8"
                      onClick={() => navigate(step.route!)}
                    >
                      Μετάβαση
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default SetupWizard;
