import { useAuth } from "@/contexts/AuthContext";
import { Clock, LogOut } from "lucide-react";

const PendingApproval = () => {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-grid">
      <div className="pointer-events-none fixed top-[-200px] left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full cosmote-gradient opacity-10 blur-[120px]" />
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Αναμονή Έγκρισης</h1>
          <p className="text-sm text-muted-foreground">
            Ο λογαριασμός σας έχει δημιουργηθεί επιτυχώς. Ένας διαχειριστής θα σας εκχωρήσει ρόλο σύντομα.
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted transition-all"
        >
          <LogOut className="h-4 w-4" />
          Αποσύνδεση
        </button>
      </div>
    </div>
  );
};

export default PendingApproval;
