import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, UserPlus, ArrowLeft, Globe, Mail, Phone, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import deltaLogo from "@/assets/delta-logo-full-transparent.png";

const LoginPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setForgotSent(true);
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
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
    <div className="flex min-h-screen flex-col bg-[hsl(215,22%,11%)]">
      {/* Ambient glow effects */}
      <div className="pointer-events-none fixed top-[-300px] left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full opacity-20 blur-[150px]" style={{ background: 'radial-gradient(circle, hsl(185 70% 42%), hsl(160 55% 45%), transparent)' }} />
      <div className="pointer-events-none fixed bottom-[-200px] right-[-100px] h-[400px] w-[400px] rounded-full opacity-10 blur-[120px]" style={{ background: 'radial-gradient(circle, hsl(140 50% 42%), transparent)' }} />

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-8">
          {/* Logo section */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl blur-2xl opacity-30" style={{ background: 'linear-gradient(135deg, hsl(185 70% 42%), hsl(160 55% 45%))' }} />
              <img
                src={deltaLogo}
                alt="DeltaNetwork"
                className="relative h-24 w-auto object-contain drop-shadow-2xl"
              />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                FTTx Operations
              </h1>
              <p className="text-sm text-[hsl(210,14%,55%)]">
                Fiber-To-The-Home Management Platform
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="relative overflow-hidden rounded-2xl border border-[hsl(215,18%,20%)] bg-[hsl(215,22%,15%)] shadow-2xl shadow-black/40">
            {/* Gradient top border */}
            <div className="h-1 w-full cosmote-gradient" />

            <div className="p-8">
              {/* Mode title */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">
                  {mode === "login" ? "Σύνδεση" : mode === "signup" ? "Δημιουργία Λογαριασμού" : "Επαναφορά Κωδικού"}
                </h2>
                <p className="text-xs text-[hsl(210,14%,55%)] mt-1">
                  {mode === "login" ? "Εισάγετε τα στοιχεία σας για πρόσβαση" : mode === "signup" ? "Συμπληρώστε τα στοιχεία σας" : "Θα λάβετε email με σύνδεσμο επαναφοράς"}
                </p>
              </div>

              {mode === "forgot" && forgotSent ? (
                <div className="text-center space-y-4 py-6">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(135,60%,40%)]/10">
                    <Mail className="h-8 w-8 text-[hsl(135,60%,40%)]" />
                  </div>
                  <p className="text-sm text-white font-medium">Email στάλθηκε!</p>
                  <p className="text-xs text-[hsl(210,14%,55%)]">Ελέγξτε το inbox σας για τον σύνδεσμο επαναφοράς κωδικού.</p>
                  <button
                    onClick={() => { setMode("login"); setForgotSent(false); setError(""); }}
                    className="text-[hsl(185,70%,50%)] text-xs font-semibold hover:underline flex items-center gap-1.5 mx-auto mt-2"
                  >
                    <ArrowLeft className="h-3 w-3" /> Πίσω στη Σύνδεση
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Ονοματεπώνυμο</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Κινητό</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="69xxxxxxxx"
                          className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                      required
                    />
                  </div>
                  {mode !== "forgot" && (
                    <div>
                      <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Κωδικός</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                        required
                        minLength={6}
                      />
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl bg-[hsl(0,72%,51%)]/10 border border-[hsl(0,72%,51%)]/20 px-4 py-3 text-xs text-[hsl(0,80%,70%)] font-medium">{error}</div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl cosmote-gradient px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[hsl(160,55%,45%)]/20 hover:shadow-xl hover:shadow-[hsl(160,55%,45%)]/30 hover:brightness-110 transition-all disabled:opacity-50 disabled:hover:brightness-100"
                  >
                    {mode === "login" && <LogIn className="h-4 w-4" />}
                    {mode === "signup" && <UserPlus className="h-4 w-4" />}
                    {loading
                      ? "Παρακαλώ περιμένετε..."
                      : mode === "login"
                      ? "Σύνδεση"
                      : mode === "signup"
                      ? "Εγγραφή"
                      : "Αποστολή Συνδέσμου"}
                  </button>

                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(""); }}
                      className="w-full text-center text-xs text-[hsl(210,14%,55%)] hover:text-[hsl(185,70%,50%)] transition-colors"
                    >
                      Ξέχασα τον κωδικό μου
                    </button>
                  )}
                </form>
              )}

              {/* Mode toggle */}
              <div className="mt-6 pt-6 border-t border-[hsl(215,18%,20%)]">
                <p className="text-center text-xs text-[hsl(210,14%,55%)]">
                  {mode === "forgot" && !forgotSent ? (
                    <button onClick={() => { setMode("login"); setError(""); }} className="text-[hsl(185,70%,50%)] font-semibold hover:underline flex items-center gap-1.5 mx-auto">
                      <ArrowLeft className="h-3 w-3" /> Πίσω στη Σύνδεση
                    </button>
                  ) : mode === "login" ? (
                    <>Δεν έχεις λογαριασμό;{" "}
                      <button onClick={() => { setMode("signup"); setError(""); }} className="text-[hsl(185,70%,50%)] font-semibold hover:underline">Εγγραφή</button>
                    </>
                  ) : mode === "signup" ? (
                    <>Έχεις ήδη λογαριασμό;{" "}
                      <button onClick={() => { setMode("login"); setError(""); }} className="text-[hsl(185,70%,50%)] font-semibold hover:underline">Σύνδεση</button>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with company info */}
      <footer className="border-t border-[hsl(215,18%,18%)] bg-[hsl(215,22%,9%)] px-4 py-6">
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex items-center justify-center gap-6 text-[hsl(210,14%,45%)]">
            <a
              href="https://deltanetwork.gr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs hover:text-[hsl(185,70%,50%)] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              deltanetwork.gr
            </a>
            <span className="text-[hsl(215,18%,25%)]">•</span>
            <a
              href="mailto:Info@deltanetwork.gr"
              className="flex items-center gap-1.5 text-xs hover:text-[hsl(185,70%,50%)] transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              Info@deltanetwork.gr
            </a>
          </div>
          <p className="text-center text-[10px] text-[hsl(210,14%,35%)]">
            © {new Date().getFullYear()} DeltaNetwork — "Συνδυάζοντας την Τεχνολογία με Αξίες"
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
