import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a recovery token in the URL
    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      // No recovery token, redirect to login
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-grid">
      <div className="pointer-events-none fixed top-[-200px] left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full cosmote-gradient opacity-10 blur-[120px]" />
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl cosmote-gradient shadow-lg shadow-primary/25">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Νέος Κωδικός</h1>
            <p className="text-xs text-muted-foreground mt-1">Εισάγετε τον νέο σας κωδικό</p>
          </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="text-sm text-foreground font-medium">Ο κωδικός άλλαξε επιτυχώς!</p>
            <p className="text-xs text-muted-foreground">Μεταφορά...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Νέος Κωδικός</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                required
                minLength={6}
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl cosmote-gradient px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? "Παρακαλώ περιμένετε..." : "Αλλαγή Κωδικού"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
