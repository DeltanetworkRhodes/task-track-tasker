import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, UserPlus, ArrowLeft, Globe, Mail, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { useDemo } from "@/contexts/DemoContext";
import { lovable } from "@/integrations/lovable/index";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";

const LoginPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { enterDemo } = useDemo();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Φόρτωση...</div></div>;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
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
            emailRedirectTo: window.location.origin
          }
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

                alt="DeltaNetwork"
                className="relative h-32 sm:h-40 w-auto object-contain drop-shadow-2xl"
                src={deltaLogoIcon} />
              
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

              {mode === "forgot" && forgotSent ?
              <div className="text-center space-y-4 py-6">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(135,60%,40%)]/10">
                    <Mail className="h-8 w-8 text-[hsl(135,60%,40%)]" />
                  </div>
                  <p className="text-sm text-white font-medium">Email στάλθηκε!</p>
                  <p className="text-xs text-[hsl(210,14%,55%)]">Ελέγξτε το inbox σας για τον σύνδεσμο επαναφοράς κωδικού.</p>
                  <button
                  onClick={() => {setMode("login");setForgotSent(false);setError("");}}
                  className="text-[hsl(185,70%,50%)] text-xs font-semibold hover:underline flex items-center gap-1.5 mx-auto mt-2">
                  
                    <ArrowLeft className="h-3 w-3" /> Πίσω στη Σύνδεση
                  </button>
                </div> :

              <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" &&
                <>
                      <div>
                        <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Ονοματεπώνυμο</label>
                        <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                      required />
                    
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Κινητό</label>
                        <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="69xxxxxxxx"
                      className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all" />
                    
                      </div>
                    </>
                }
                  <div>
                    <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Email</label>
                    <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                    required />
                  
                  </div>
                  {mode !== "forgot" &&
                <div>
                      <label className="text-[11px] font-semibold text-[hsl(210,14%,55%)] uppercase tracking-wider">Κωδικός</label>
                      <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm text-white placeholder:text-[hsl(210,14%,40%)] focus:border-[hsl(185,70%,42%)] focus:outline-none focus:ring-2 focus:ring-[hsl(185,70%,42%)]/20 transition-all"
                    required
                    minLength={6} />
                  
                    </div>
                }

                  {error &&
                <div className="rounded-xl bg-[hsl(0,72%,51%)]/10 border border-[hsl(0,72%,51%)]/20 px-4 py-3 text-xs text-[hsl(0,80%,70%)] font-medium">{error}</div>
                }

                  <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl cosmote-gradient px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[hsl(160,55%,45%)]/20 hover:shadow-xl hover:shadow-[hsl(160,55%,45%)]/30 hover:brightness-110 transition-all disabled:opacity-50 disabled:hover:brightness-100">
                  
                    {mode === "login" && <LogIn className="h-4 w-4" />}
                    {mode === "signup" && <UserPlus className="h-4 w-4" />}
                    {loading ?
                  "Παρακαλώ περιμένετε..." :
                  mode === "login" ?
                  "Σύνδεση" :
                  mode === "signup" ?
                  "Εγγραφή" :
                  "Αποστολή Συνδέσμου"}
                  </button>

                  {mode === "login" && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-[hsl(215,18%,25%)]" />
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase">
                          <span className="bg-[hsl(215,22%,15%)] px-3 text-[hsl(210,14%,45%)]">ή</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={googleLoading}
                        onClick={async () => {
                          setGoogleLoading(true);
                          setError("");
                          const result = await lovable.auth.signInWithOAuth("google", {
                            redirect_uri: window.location.origin,
                          });
                          if (result.error) {
                            setError(result.error.message || "Google sign-in failed");
                            setGoogleLoading(false);
                          }
                          if (result.redirected) return;
                          setGoogleLoading(false);
                        }}
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[hsl(215,18%,25%)] bg-[hsl(215,22%,11%)] px-4 py-3 text-sm font-semibold text-white hover:bg-[hsl(215,22%,18%)] transition-all disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        {googleLoading ? "Σύνδεση..." : "Σύνδεση με Google"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {setMode("forgot");setError("");}}
                        className="w-full text-center text-xs text-[hsl(210,14%,55%)] hover:text-[hsl(185,70%,50%)] transition-colors">
                        Ξέχασα τον κωδικό μου
                      </button>
                    </>
                  )}
                </form>
              }

              {/* Demo button */}
              <div className="mt-6 pt-6 border-t border-[hsl(215,18%,20%)]">
                <button
                  onClick={() => { enterDemo(); navigate("/demo"); }}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[hsl(45,90%,50%)]/40 bg-[hsl(45,90%,50%)]/5 px-4 py-3 text-sm font-bold text-[hsl(45,90%,60%)] hover:bg-[hsl(45,90%,50%)]/10 hover:border-[hsl(45,90%,50%)]/60 transition-all"
                >
                  <Play className="h-4 w-4" />
                  Δοκιμαστική Λειτουργία
                </button>
              </div>

              {/* Mode toggle */}
              <div className="mt-4 pt-4 border-t border-[hsl(215,18%,20%)]">
                <p className="text-center text-xs text-[hsl(210,14%,55%)]">
                  {mode === "forgot" && !forgotSent ?
                  <button onClick={() => {setMode("login");setError("");}} className="text-[hsl(185,70%,50%)] font-semibold hover:underline flex items-center gap-1.5 mx-auto">
                      <ArrowLeft className="h-3 w-3" /> Πίσω στη Σύνδεση
                    </button> :
                  mode === "login" ?
                  <>Δεν έχεις λογαριασμό;{" "}
                      <button onClick={() => {setMode("signup");setError("");}} className="text-[hsl(185,70%,50%)] font-semibold hover:underline">Εγγραφή</button>
                    </> :
                  mode === "signup" ?
                  <>Έχεις ήδη λογαριασμό;{" "}
                      <button onClick={() => {setMode("login");setError("");}} className="text-[hsl(185,70%,50%)] font-semibold hover:underline">Σύνδεση</button>
                    </> :
                  null}
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
              className="flex items-center gap-1.5 text-xs hover:text-[hsl(185,70%,50%)] transition-colors">
              
              <Globe className="h-3.5 w-3.5" />
              deltanetwork.gr
            </a>
            <span className="text-[hsl(215,18%,25%)]">•</span>
            <a
              href="mailto:Info@deltanetwork.gr"
              className="flex items-center gap-1.5 text-xs hover:text-[hsl(185,70%,50%)] transition-colors">
              
              <Mail className="h-3.5 w-3.5" />
              Info@deltanetwork.gr
            </a>
          </div>
          <p className="text-center text-[10px] text-[hsl(210,14%,35%)]">
            © {new Date().getFullYear()} DeltaNetwork. All rights reserved. Με επιφύλαξη παντός δικαιώματος.<br/>
            Απαγορεύεται η αντιγραφή, αναπαραγωγή ή μεταπώληση χωρίς γραπτή άδεια.
          </p>
        </div>
      </footer>
    </div>);

};

export default LoginPage;