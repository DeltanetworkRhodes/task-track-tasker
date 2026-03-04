import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, UserPlus, Wifi } from "lucide-react";

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-grid">
      {/* Decorative gradient orb */}
      <div className="pointer-events-none fixed top-[-200px] left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full cosmote-gradient opacity-10 blur-[120px]" />
      
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl cosmote-gradient shadow-lg shadow-primary/25">
            <Wifi className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">DeltaNet FTTH</h1>
            <p className="text-xs text-muted-foreground mt-1">Operations Management</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ονοματεπώνυμο</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
            </div>
          )}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              required
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Κωδικός</label>
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
            {isLogin ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {loading ? "Παρακαλώ περιμένετε..." : isLogin ? "Σύνδεση" : "Εγγραφή"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {isLogin ? "Δεν έχεις λογαριασμό;" : "Έχεις ήδη λογαριασμό;"}{" "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="text-primary font-semibold hover:underline"
          >
            {isLogin ? "Εγγραφή" : "Σύνδεση"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
